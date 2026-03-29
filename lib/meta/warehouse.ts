import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import { recordSyncReclaimEvents } from "@/lib/sync/worker-health";
import type {
  ProviderReclaimDecision,
  ProviderReclaimDisposition,
} from "@/lib/sync/provider-orchestration";
import type {
  MetaAccountDailyRow,
  MetaAdDailyRow,
  MetaAdSetDailyRow,
  MetaCampaignDailyRow,
  MetaCreativeDailyRow,
  MetaPartitionStatus,
  MetaRawSnapshotRecord,
  MetaSyncJobRecord,
  MetaSyncLane,
  MetaSyncCheckpointRecord,
  MetaSyncPartitionRecord,
  MetaSyncRunRecord,
  MetaSyncStateRecord,
  MetaWarehouseDataState,
  MetaWarehouseFreshness,
  MetaWarehouseMetricSet,
  MetaWarehouseScope,
} from "@/lib/meta/warehouse-types";

const META_SOURCE_PRIORITY_SQL = `
  CASE partition.source
    WHEN 'priority_window' THEN 700
    WHEN 'today' THEN 650
    WHEN 'request_runtime' THEN 625
    WHEN 'recent' THEN 600
    WHEN 'recent_recovery' THEN 550
    WHEN 'manual_refresh' THEN 525
    WHEN 'core_success' THEN 500
    WHEN 'initial_connect' THEN 250
    WHEN 'historical_recovery' THEN 200
    WHEN 'historical' THEN 150
    ELSE 100
  END
`;

function normalizeDate(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text.slice(0, 10);
}

function normalizeTimestamp(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  const parsed = new Date(text);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  return text;
}

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTimestampMs(value: unknown) {
  const normalized = normalizeTimestamp(value);
  if (!normalized) return null;
  const ms = new Date(normalized).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function tallyDisposition(
  counts: Record<ProviderReclaimDisposition, number>,
  disposition: ProviderReclaimDisposition
) {
  counts[disposition] = (counts[disposition] ?? 0) + 1;
}

function chunkRows<T>(rows: T[], size = 250) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

export function buildMetaRawSnapshotHash(input: {
  businessId: string;
  providerAccountId: string;
  endpointName: string;
  startDate: string;
  endDate: string;
  payload: unknown;
}) {
  return createHash("sha1")
    .update(
      JSON.stringify({
        businessId: input.businessId,
        providerAccountId: input.providerAccountId,
        endpointName: input.endpointName,
        startDate: normalizeDate(input.startDate),
        endDate: normalizeDate(input.endDate),
        payload: input.payload,
      })
    )
    .digest("hex");
}

export function emptyMetaWarehouseMetrics(): MetaWarehouseMetricSet {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    reach: 0,
    frequency: null,
    conversions: 0,
    revenue: 0,
    roas: 0,
    cpa: null,
    ctr: null,
    cpc: null,
  };
}

export function createMetaWarehouseFreshness(
  input: Partial<MetaWarehouseFreshness> = {}
): MetaWarehouseFreshness {
  return {
    dataState: input.dataState ?? "syncing",
    lastSyncedAt: input.lastSyncedAt ?? null,
    liveRefreshedAt: input.liveRefreshedAt ?? null,
    isPartial: input.isPartial ?? false,
    missingWindows: input.missingWindows ?? [],
    warnings: input.warnings ?? [],
  };
}

export function mergeMetaWarehouseState(
  current: MetaWarehouseDataState,
  next: MetaWarehouseDataState
): MetaWarehouseDataState {
  const priority: Record<MetaWarehouseDataState, number> = {
    not_connected: 0,
    connected_no_assignment: 1,
    action_required: 2,
    syncing: 3,
    stale: 4,
    paused: 5,
    partial: 6,
    ready: 7,
  };
  return priority[next] > priority[current] ? next : current;
}

export async function createMetaSyncJob(input: MetaSyncJobRecord) {
  await runMigrations();
  const sql = getDb();
  const existingRows = await sql`
    SELECT id
    FROM meta_sync_jobs
    WHERE business_id = ${input.businessId}
      AND provider_account_id = ${input.providerAccountId}
      AND sync_type = ${input.syncType}
      AND scope = ${input.scope}
      AND start_date = ${normalizeDate(input.startDate)}
      AND end_date = ${normalizeDate(input.endDate)}
      AND trigger_source = ${input.triggerSource}
      AND status = 'running'
    ORDER BY triggered_at DESC
    LIMIT 1
  ` as Array<{ id: string }>;
  if (existingRows[0]?.id) return existingRows[0].id;
  const rows = await sql`
    INSERT INTO meta_sync_jobs (
      business_id,
      provider_account_id,
      sync_type,
      scope,
      start_date,
      end_date,
      status,
      progress_percent,
      trigger_source,
      retry_count,
      last_error,
      triggered_at,
      started_at,
      finished_at,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.providerAccountId},
      ${input.syncType},
      ${input.scope},
      ${normalizeDate(input.startDate)},
      ${normalizeDate(input.endDate)},
      ${input.status},
      ${input.progressPercent},
      ${input.triggerSource},
      ${input.retryCount},
      ${input.lastError},
      COALESCE(${input.triggeredAt ?? null}, now()),
      ${input.startedAt ?? null},
      ${input.finishedAt ?? null},
      now()
    )
    RETURNING id
  ` as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

export async function updateMetaSyncJob(input: {
  id: string;
  status: MetaSyncJobRecord["status"];
  progressPercent?: number;
  lastError?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}) {
  await runMigrations();
  const sql = getDb();
  await sql`
    UPDATE meta_sync_jobs
    SET
      status = ${input.status},
      progress_percent = COALESCE(${input.progressPercent ?? null}, progress_percent),
      last_error = COALESCE(${input.lastError ?? null}, last_error),
      started_at = COALESCE(${input.startedAt ?? null}, started_at),
      finished_at = COALESCE(${input.finishedAt ?? null}, finished_at),
      updated_at = now()
    WHERE id = ${input.id}
  `;
}

export async function queueMetaSyncPartition(input: MetaSyncPartitionRecord) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    INSERT INTO meta_sync_partitions (
      business_id,
      provider_account_id,
      lane,
      scope,
      partition_date,
      status,
      priority,
      source,
      lease_owner,
      lease_expires_at,
      attempt_count,
      next_retry_at,
      last_error,
      started_at,
      finished_at,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.providerAccountId},
      ${input.lane},
      ${input.scope},
      ${normalizeDate(input.partitionDate)},
      ${input.status},
      ${input.priority},
      ${input.source},
      ${input.leaseOwner ?? null},
      ${input.leaseExpiresAt ?? null},
      ${input.attemptCount},
      ${input.nextRetryAt ?? null},
      ${input.lastError ?? null},
      ${input.startedAt ?? null},
      ${input.finishedAt ?? null},
      now()
    )
    ON CONFLICT (business_id, provider_account_id, lane, scope, partition_date)
    DO UPDATE SET
      priority = GREATEST(meta_sync_partitions.priority, EXCLUDED.priority),
      source = CASE
        WHEN meta_sync_partitions.source = 'priority_window' THEN meta_sync_partitions.source
        WHEN EXCLUDED.source = 'priority_window' THEN EXCLUDED.source
        WHEN meta_sync_partitions.source = 'today' THEN meta_sync_partitions.source
        WHEN EXCLUDED.source = 'today' THEN EXCLUDED.source
        WHEN meta_sync_partitions.source = 'request_runtime' THEN meta_sync_partitions.source
        WHEN EXCLUDED.source = 'request_runtime' THEN EXCLUDED.source
        WHEN meta_sync_partitions.source = 'recent' THEN meta_sync_partitions.source
        WHEN EXCLUDED.source = 'recent' THEN EXCLUDED.source
        WHEN meta_sync_partitions.source = 'recent_recovery' THEN meta_sync_partitions.source
        WHEN EXCLUDED.source = 'recent_recovery' THEN EXCLUDED.source
        ELSE meta_sync_partitions.source
      END,
      status = CASE
        WHEN EXCLUDED.source IN ('priority_window', 'recent', 'recent_recovery', 'today', 'request_runtime')
          AND meta_sync_partitions.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
          THEN 'queued'
        ELSE meta_sync_partitions.status
      END,
      lease_owner = CASE
        WHEN EXCLUDED.source IN ('priority_window', 'recent', 'recent_recovery', 'today', 'request_runtime')
          AND meta_sync_partitions.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
          THEN NULL
        ELSE meta_sync_partitions.lease_owner
      END,
      lease_expires_at = CASE
        WHEN EXCLUDED.source IN ('priority_window', 'recent', 'recent_recovery', 'today', 'request_runtime')
          AND meta_sync_partitions.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
          THEN NULL
        ELSE meta_sync_partitions.lease_expires_at
      END,
      last_error = CASE
        WHEN EXCLUDED.source IN ('priority_window', 'recent', 'recent_recovery', 'today', 'request_runtime')
          AND meta_sync_partitions.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
          THEN NULL
        ELSE meta_sync_partitions.last_error
      END,
      next_retry_at = CASE
        WHEN EXCLUDED.source IN ('priority_window', 'recent', 'recent_recovery', 'today', 'request_runtime')
          AND meta_sync_partitions.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
          THEN now()
        WHEN meta_sync_partitions.status IN ('succeeded', 'running', 'leased')
          THEN meta_sync_partitions.next_retry_at
        ELSE LEAST(COALESCE(meta_sync_partitions.next_retry_at, now()), COALESCE(EXCLUDED.next_retry_at, now()))
      END,
      updated_at = now()
    RETURNING id, status
  ` as Array<{ id: string; status: MetaPartitionStatus }>;
  return rows[0] ?? null;
}

export async function leaseMetaSyncPartitions(input: {
  businessId: string;
  lane?: "core" | "extended" | "maintenance";
  sources?: string[] | null;
  workerId: string;
  limit: number;
  leaseMinutes?: number;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    WITH candidates AS (
      SELECT id
      FROM meta_sync_partitions
      WHERE business_id = ${input.businessId}
        AND (${input.lane ?? null}::text IS NULL OR lane = ${input.lane ?? null})
        AND (
          ${input.sources ?? null}::text[] IS NULL
          OR source = ANY(${input.sources ?? null}::text[])
        )
        AND (
          status = 'queued'
          OR (status = 'failed' AND COALESCE(next_retry_at, now()) <= now())
          OR (status = 'leased' AND COALESCE(lease_expires_at, now()) <= now())
        )
      ORDER BY
        priority DESC,
        ${sql.unsafe(META_SOURCE_PRIORITY_SQL)} DESC,
        partition_date DESC,
        updated_at ASC
      LIMIT ${Math.max(1, input.limit)}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE meta_sync_partitions partition
    SET
      status = 'leased',
      lease_owner = ${input.workerId},
      lease_expires_at = now() + (${input.leaseMinutes ?? 5} || ' minutes')::interval,
      updated_at = now()
    FROM candidates
    WHERE partition.id = candidates.id
    RETURNING
      partition.id,
      partition.business_id,
      partition.provider_account_id,
      partition.lane,
      partition.scope,
      partition.partition_date,
      partition.status,
      partition.priority,
      partition.source,
      partition.lease_owner,
      partition.lease_expires_at,
      partition.attempt_count,
      partition.next_retry_at,
      partition.last_error,
      partition.created_at,
      partition.started_at,
      partition.finished_at,
      partition.updated_at
  ` as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id),
    businessId: String(row.business_id),
    providerAccountId: String(row.provider_account_id),
    lane: String(row.lane) as MetaSyncPartitionRecord["lane"],
    scope: String(row.scope) as MetaWarehouseScope,
    partitionDate: normalizeDate(row.partition_date),
    status: String(row.status) as MetaPartitionStatus,
    priority: toNumber(row.priority),
    source: String(row.source),
    leaseOwner: row.lease_owner ? String(row.lease_owner) : null,
    leaseExpiresAt: normalizeTimestamp(row.lease_expires_at),
    attemptCount: toNumber(row.attempt_count),
    nextRetryAt: normalizeTimestamp(row.next_retry_at),
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: normalizeTimestamp(row.created_at) ?? undefined,
    startedAt: normalizeTimestamp(row.started_at),
    finishedAt: normalizeTimestamp(row.finished_at),
    updatedAt: normalizeTimestamp(row.updated_at) ?? undefined,
  })) as MetaSyncPartitionRecord[];
}

export async function markMetaPartitionRunning(input: {
  partitionId: string;
  workerId: string;
}) {
  await runMigrations();
  const sql = getDb();
  await sql`
    UPDATE meta_sync_partitions
    SET
      status = 'running',
      lease_owner = ${input.workerId},
      started_at = COALESCE(started_at, now()),
      lease_expires_at = now() + interval '5 minutes',
      attempt_count = attempt_count + 1,
      updated_at = now()
    WHERE id = ${input.partitionId}
  `;
}

export async function completeMetaPartition(input: {
  partitionId: string;
  status: Extract<MetaPartitionStatus, "succeeded" | "failed" | "dead_letter" | "cancelled">;
  lastError?: string | null;
  retryDelayMinutes?: number;
}) {
  await runMigrations();
  const sql = getDb();
  await sql`
    UPDATE meta_sync_partitions
    SET
      status = ${input.status},
      lease_owner = NULL,
      lease_expires_at = NULL,
      next_retry_at = CASE
        WHEN ${input.status} = 'failed'
          THEN now() + (${input.retryDelayMinutes ?? 5} || ' minutes')::interval
        ELSE NULL
      END,
      last_error = ${input.lastError ?? null},
      finished_at = CASE
        WHEN ${input.status} IN ('succeeded', 'dead_letter', 'cancelled') THEN now()
        ELSE finished_at
      END,
      updated_at = now()
    WHERE id = ${input.partitionId}
  `;
}

export async function cleanupMetaPartitionOrchestration(input: {
  businessId: string;
  staleLeaseMinutes?: number;
  staleRunMinutes?: number;
  staleRunMinutesByLane?: Partial<Record<MetaSyncLane, number>>;
  runProgressGraceMinutes?: number;
  staleLegacyMinutes?: number;
}) {
  await runMigrations();
  const sql = getDb();
  const staleThresholdMs = Math.max(1, input.staleLeaseMinutes ?? 8) * 60_000;
  const candidates = await sql`
    SELECT
      partition.id,
      partition.lane,
      partition.scope,
      partition.updated_at,
      partition.started_at,
      partition.lease_expires_at,
      checkpoint.checkpoint_scope,
      checkpoint.phase,
      checkpoint.page_index,
      checkpoint.updated_at AS checkpoint_updated_at,
      EXISTS (
        SELECT 1
        FROM sync_runner_leases lease
        WHERE lease.business_id = partition.business_id
          AND lease.provider_scope = 'meta'
          AND lease.lease_expires_at > now()
      ) AS has_active_runner_lease
    FROM meta_sync_partitions partition
    LEFT JOIN LATERAL (
      SELECT checkpoint_scope, phase, page_index, updated_at
      FROM meta_sync_checkpoints checkpoint
      WHERE checkpoint.partition_id = partition.id
      ORDER BY checkpoint.updated_at DESC
      LIMIT 1
    ) checkpoint ON TRUE
    WHERE partition.business_id = ${input.businessId}
      AND partition.status IN ('leased', 'running')
  ` as Array<Record<string, unknown>>;

  const now = Date.now();
  const dispositionCounts: Record<ProviderReclaimDisposition, number> = {
    alive_slow: 0,
    stalled_reclaimable: 0,
    poison_candidate: 0,
  };
  const stalledDecisions: Array<ProviderReclaimDecision & { partitionId: string }> = [];

  for (const row of candidates) {
    const partitionId = String(row.id);
    const progressMs = parseTimestampMs(row.checkpoint_updated_at ?? row.updated_at);
    const leaseMs = parseTimestampMs(
      row.lease_expires_at ?? row.started_at ?? row.updated_at
    );
    const hasRecentProgress =
      progressMs != null && now - progressMs <= staleThresholdMs;
    const hasActiveRunnerLease = Boolean(row.has_active_runner_lease);

    let decision: ProviderReclaimDecision;
    if (hasRecentProgress) {
      decision = {
        disposition: "alive_slow",
        reasonCode: "progress_recently_advanced",
        detail: "Recent checkpoint progress detected; keeping partition leased.",
      };
    } else if (hasActiveRunnerLease) {
      decision = {
        disposition: "alive_slow",
        reasonCode: "active_worker_lease_present",
        detail: "Meta runner lease is still active.",
      };
    } else if (leaseMs != null && now - leaseMs > 0) {
      decision = {
        disposition: "stalled_reclaimable",
        reasonCode: "lease_expired_no_progress",
        detail: "Partition lease expired without recent checkpoint progress.",
      };
    } else {
      continue;
    }
    tallyDisposition(dispositionCounts, decision.disposition);
    if (decision.disposition === "stalled_reclaimable") {
      stalledDecisions.push({ partitionId, ...decision });
    }
  }

  const stalePartitionIds = stalledDecisions.map((row) => row.partitionId);
  if (stalePartitionIds.length > 0) {
    await sql`
      UPDATE meta_sync_partitions
      SET
        status = 'failed',
        lease_owner = NULL,
        lease_expires_at = NULL,
        next_retry_at = now() + interval '3 minutes',
        last_error = COALESCE(last_error, 'stalled partition reclaimed automatically'),
        updated_at = now()
      WHERE id = ANY(${stalePartitionIds}::uuid[])
    `;
    for (const decision of stalledDecisions) {
      await recordSyncReclaimEvents({
        providerScope: "meta",
        businessId: input.businessId,
        partitionIds: [decision.partitionId],
        eventType: "reclaimed",
        disposition: decision.disposition,
        reasonCode: decision.reasonCode,
        detail: decision.detail,
      }).catch(() => null);
    }
  }

  const staleLegacyRows = await sql`
    UPDATE meta_sync_jobs
    SET
      status = 'failed',
      last_error = COALESCE(last_error, 'legacy meta sync job expired automatically'),
      finished_at = now(),
      updated_at = now()
    WHERE business_id = ${input.businessId}
      AND status = 'running'
      AND started_at < now() - (${input.staleLegacyMinutes ?? 15} || ' minutes')::interval
    RETURNING id
  ` as Array<Record<string, unknown>>;

  const staleRunMinutesCore = Math.max(
    1,
    input.staleRunMinutesByLane?.core ?? input.staleRunMinutes ?? 12
  );
  const staleRunMinutesMaintenance = Math.max(
    1,
    input.staleRunMinutesByLane?.maintenance ?? Math.max(staleRunMinutesCore, 15)
  );
  const staleRunMinutesExtended = Math.max(
    1,
    input.staleRunMinutesByLane?.extended ?? Math.max(staleRunMinutesMaintenance, 25)
  );
  const runProgressGraceMinutes = Math.max(1, input.runProgressGraceMinutes ?? 3);
  const staleRunRows = await sql`
    WITH stale_candidates AS (
      SELECT
        run.id,
        run.partition_id,
        run.worker_id,
        run.lane,
        COALESCE(run.started_at, run.created_at) AS started_at,
        checkpoint.phase AS checkpoint_phase,
        checkpoint.updated_at AS progress_updated_at,
        lease.lease_owner AS active_lease_owner,
        lease.updated_at AS lease_updated_at,
        lease.lease_expires_at AS lease_expires_at,
        CASE
          WHEN run.lane = 'core' THEN ${String(staleRunMinutesCore)}
          WHEN run.lane = 'maintenance' THEN ${String(staleRunMinutesMaintenance)}
          ELSE ${String(staleRunMinutesExtended)}
        END AS stale_threshold_minutes,
        EXISTS (
          SELECT 1
          FROM meta_sync_partitions partition
          WHERE partition.id = run.partition_id
            AND partition.status NOT IN ('leased', 'running')
        ) AS partition_state_invalid
      FROM meta_sync_runs run
      LEFT JOIN LATERAL (
        SELECT checkpoint.phase, checkpoint.updated_at
        FROM meta_sync_checkpoints checkpoint
        WHERE checkpoint.partition_id = run.partition_id
        ORDER BY checkpoint.updated_at DESC
        LIMIT 1
      ) checkpoint ON TRUE
      LEFT JOIN LATERAL (
        SELECT lease.lease_owner, lease.updated_at, lease.lease_expires_at
        FROM sync_runner_leases lease
        WHERE lease.business_id = run.business_id
          AND lease.provider_scope = 'meta'
        ORDER BY lease.updated_at DESC
        LIMIT 1
      ) lease ON TRUE
      WHERE run.business_id = ${input.businessId}
        AND run.status = 'running'
    )
    UPDATE meta_sync_runs run
    SET
      status = 'failed',
      error_class = COALESCE(error_class, 'stale_run'),
      error_message = COALESCE(error_message, 'stale partition run closed automatically'),
      finished_at = COALESCE(finished_at, now()),
      duration_ms = COALESCE(
        duration_ms,
        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(run.started_at, run.created_at))) * 1000))::int
      ),
      meta_json = COALESCE(run.meta_json, '{}'::jsonb) || jsonb_build_object(
        'decisionCaller', 'cleanupMetaPartitionOrchestration',
        'checkpointPhase', stale_candidates.checkpoint_phase,
        'staleThresholdMs', stale_candidates.stale_threshold_minutes * 60000,
        'runAgeMs', GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - stale_candidates.started_at)) * 1000))::int,
        'leaseAgeMs', CASE
          WHEN stale_candidates.lease_updated_at IS NULL THEN NULL
          ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - stale_candidates.lease_updated_at)) * 1000))::int
        END,
        'heartbeatAgeMs', CASE
          WHEN stale_candidates.progress_updated_at IS NULL THEN NULL
          ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - stale_candidates.progress_updated_at)) * 1000))::int
        END,
        'runnerLeaseSeen', COALESCE(stale_candidates.lease_expires_at > now(), false),
        'closureReason', CASE
          WHEN stale_candidates.partition_state_invalid THEN 'partition_state_invalid'
          ELSE 'lane_stale_threshold_exceeded'
        END
      ),
      updated_at = now()
    FROM stale_candidates
    WHERE run.id = stale_candidates.id
      AND (
        COALESCE(run.started_at, run.created_at) <
          now() - ((stale_candidates.stale_threshold_minutes)::text || ' minutes')::interval
        OR stale_candidates.partition_state_invalid
      )
      AND NOT (
        stale_candidates.active_lease_owner IS NOT NULL
        AND stale_candidates.active_lease_owner = run.worker_id
        AND stale_candidates.lease_expires_at > now()
      )
      AND NOT (
        stale_candidates.progress_updated_at IS NOT NULL
        AND stale_candidates.progress_updated_at >
          now() - (${String(runProgressGraceMinutes)} || ' minutes')::interval
      )
    RETURNING run.id
  ` as Array<Record<string, unknown>>;

  return {
    stalePartitionCount: stalePartitionIds.length,
    aliveSlowCount: dispositionCounts.alive_slow,
    staleRunCount: staleRunRows.length,
    staleLegacyCount: staleLegacyRows.length,
    reclaimReasons: {
      stalledReclaimable: stalledDecisions.map((row) => row.reasonCode),
    },
  };
}

export async function createMetaSyncRun(input: MetaSyncRunRecord) {
  await runMigrations();
  const sql = getDb();
  await sql`
    UPDATE meta_sync_runs
    SET
      status = 'cancelled',
      error_class = COALESCE(error_class, 'superseded_attempt'),
      error_message = COALESCE(error_message, 'partition attempt was superseded by a newer worker'),
      finished_at = COALESCE(finished_at, now()),
      duration_ms = COALESCE(
        duration_ms,
        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(started_at, created_at))) * 1000))::int
      ),
      updated_at = now()
    WHERE partition_id = ${input.partitionId}
      AND status = 'running'
  `;
  const rows = await sql`
    INSERT INTO meta_sync_runs (
      partition_id,
      business_id,
      provider_account_id,
      lane,
      scope,
      partition_date,
      status,
      worker_id,
      attempt_count,
      row_count,
      duration_ms,
      error_class,
      error_message,
      meta_json,
      started_at,
      finished_at,
      updated_at
    )
    VALUES (
      ${input.partitionId},
      ${input.businessId},
      ${input.providerAccountId},
      ${input.lane},
      ${input.scope},
      ${normalizeDate(input.partitionDate)},
      ${input.status},
      ${input.workerId ?? null},
      ${input.attemptCount},
      ${input.rowCount ?? null},
      ${input.durationMs ?? null},
      ${input.errorClass ?? null},
      ${input.errorMessage ?? null},
      ${JSON.stringify(input.metaJson ?? {})}::jsonb,
      COALESCE(${input.startedAt ?? null}, now()),
      ${input.finishedAt ?? null},
      now()
    )
    RETURNING id
  ` as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

export async function updateMetaSyncRun(input: {
  id: string;
  status: MetaSyncRunRecord["status"];
  rowCount?: number | null;
  durationMs?: number | null;
  errorClass?: string | null;
  errorMessage?: string | null;
  metaJson?: Record<string, unknown>;
  finishedAt?: string | null;
  onlyIfCurrentStatus?: MetaSyncRunRecord["status"] | null;
}) {
  await runMigrations();
  const sql = getDb();
  await sql`
    UPDATE meta_sync_runs
    SET
      status = ${input.status},
      row_count = COALESCE(${input.rowCount ?? null}, row_count),
      duration_ms = COALESCE(${input.durationMs ?? null}, duration_ms),
      error_class = CASE
        WHEN ${input.status} = 'succeeded' THEN NULL
        ELSE COALESCE(${input.errorClass ?? null}, error_class)
      END,
      error_message = CASE
        WHEN ${input.status} = 'succeeded' THEN NULL
        ELSE COALESCE(${input.errorMessage ?? null}, error_message)
      END,
      meta_json = COALESCE(${input.metaJson ? JSON.stringify(input.metaJson) : null}::jsonb, meta_json),
      finished_at = COALESCE(${input.finishedAt ?? null}, finished_at),
      updated_at = now()
    WHERE id = ${input.id}
      AND (${input.onlyIfCurrentStatus ?? null}::text IS NULL OR status = ${input.onlyIfCurrentStatus ?? null})
  `;
}

export function buildMetaSyncCheckpointHash(input: {
  partitionId: string;
  checkpointScope: string;
  phase: string;
  pageIndex: number;
  nextPageUrl?: string | null;
  providerCursor?: string | null;
}) {
  return createHash("sha1")
    .update(
      JSON.stringify({
        partitionId: input.partitionId,
        checkpointScope: input.checkpointScope,
        phase: input.phase,
        pageIndex: input.pageIndex,
        nextPageUrl: input.nextPageUrl ?? null,
        providerCursor: input.providerCursor ?? null,
      })
    )
    .digest("hex");
}

export async function upsertMetaSyncCheckpoint(input: MetaSyncCheckpointRecord) {
  await runMigrations();
  const sql = getDb();
  const checkpointHash =
    input.checkpointHash ??
    buildMetaSyncCheckpointHash({
      partitionId: input.partitionId,
      checkpointScope: input.checkpointScope,
      phase: input.phase,
      pageIndex: input.pageIndex,
      nextPageUrl: input.nextPageUrl ?? null,
      providerCursor: input.providerCursor ?? null,
    });
  const rows = await sql`
    INSERT INTO meta_sync_checkpoints (
      partition_id,
      business_id,
      provider_account_id,
      checkpoint_scope,
      phase,
      status,
      page_index,
      next_page_url,
      provider_cursor,
      rows_fetched,
      rows_written,
      last_successful_entity_key,
      last_response_headers,
      checkpoint_hash,
      attempt_count,
      retry_after_at,
      lease_owner,
      lease_expires_at,
      started_at,
      finished_at,
      updated_at
    )
    VALUES (
      ${input.partitionId},
      ${input.businessId},
      ${input.providerAccountId},
      ${input.checkpointScope},
      ${input.phase},
      ${input.status},
      ${input.pageIndex},
      ${input.nextPageUrl ?? null},
      ${input.providerCursor ?? null},
      ${input.rowsFetched ?? 0},
      ${input.rowsWritten ?? 0},
      ${input.lastSuccessfulEntityKey ?? null},
      ${JSON.stringify(input.lastResponseHeaders ?? {})}::jsonb,
      ${checkpointHash},
      ${input.attemptCount},
      ${input.retryAfterAt ?? null},
      ${input.leaseOwner ?? null},
      ${input.leaseExpiresAt ?? null},
      ${input.startedAt ?? null},
      ${input.finishedAt ?? null},
      now()
    )
    ON CONFLICT (partition_id, checkpoint_scope)
    DO UPDATE SET
      phase = EXCLUDED.phase,
      status = EXCLUDED.status,
      page_index = EXCLUDED.page_index,
      next_page_url = EXCLUDED.next_page_url,
      provider_cursor = EXCLUDED.provider_cursor,
      rows_fetched = EXCLUDED.rows_fetched,
      rows_written = EXCLUDED.rows_written,
      last_successful_entity_key = EXCLUDED.last_successful_entity_key,
      last_response_headers = EXCLUDED.last_response_headers,
      checkpoint_hash = EXCLUDED.checkpoint_hash,
      attempt_count = EXCLUDED.attempt_count,
      retry_after_at = EXCLUDED.retry_after_at,
      lease_owner = EXCLUDED.lease_owner,
      lease_expires_at = EXCLUDED.lease_expires_at,
      started_at = COALESCE(meta_sync_checkpoints.started_at, EXCLUDED.started_at, now()),
      finished_at = EXCLUDED.finished_at,
      updated_at = now()
    RETURNING id
  ` as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

export async function getMetaSyncCheckpoint(input: {
  partitionId: string;
  checkpointScope: string;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT *
    FROM meta_sync_checkpoints
    WHERE partition_id = ${input.partitionId}
      AND checkpoint_scope = ${input.checkpointScope}
    LIMIT 1
  ` as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    partitionId: String(row.partition_id),
    businessId: String(row.business_id),
    providerAccountId: String(row.provider_account_id),
    checkpointScope: String(row.checkpoint_scope),
    phase: String(row.phase) as MetaSyncCheckpointRecord["phase"],
    status: String(row.status) as MetaSyncCheckpointRecord["status"],
    pageIndex: toNumber(row.page_index),
    nextPageUrl: row.next_page_url ? String(row.next_page_url) : null,
    providerCursor: row.provider_cursor ? String(row.provider_cursor) : null,
    rowsFetched: toNumber(row.rows_fetched),
    rowsWritten: toNumber(row.rows_written),
    lastSuccessfulEntityKey: row.last_successful_entity_key
      ? String(row.last_successful_entity_key)
      : null,
    lastResponseHeaders:
      row.last_response_headers && typeof row.last_response_headers === "object"
        ? (row.last_response_headers as Record<string, unknown>)
        : {},
    checkpointHash: row.checkpoint_hash ? String(row.checkpoint_hash) : null,
    attemptCount: toNumber(row.attempt_count),
    retryAfterAt: normalizeTimestamp(row.retry_after_at),
    leaseOwner: row.lease_owner ? String(row.lease_owner) : null,
    leaseExpiresAt: normalizeTimestamp(row.lease_expires_at),
    startedAt: normalizeTimestamp(row.started_at),
    finishedAt: normalizeTimestamp(row.finished_at),
    createdAt: normalizeTimestamp(row.created_at) ?? undefined,
    updatedAt: normalizeTimestamp(row.updated_at) ?? undefined,
  } satisfies MetaSyncCheckpointRecord;
}

export async function listMetaRawSnapshotsForPartition(input: {
  partitionId: string;
  endpointName: string;
}) {
  await runMigrations();
  const sql = getDb();
  return (sql`
    SELECT
      id,
      page_index,
      payload_json,
      response_headers,
      provider_cursor,
      request_context,
      provider_http_status,
      status,
      fetched_at
    FROM meta_raw_snapshots
    WHERE partition_id = ${input.partitionId}
      AND endpoint_name = ${input.endpointName}
    ORDER BY COALESCE(page_index, 0) ASC, fetched_at ASC
  ` as unknown) as Array<{
    id: string;
    page_index: number | null;
    payload_json: unknown;
    response_headers: Record<string, unknown> | null;
    provider_cursor: string | null;
    request_context: Record<string, unknown> | null;
    provider_http_status: number | null;
    status: string;
    fetched_at: string | null;
  }>;
}

export async function heartbeatMetaPartitionLease(input: {
  partitionId: string;
  workerId: string;
  leaseMinutes?: number;
}) {
  await runMigrations();
  const sql = getDb();
  await sql`
    UPDATE meta_sync_partitions
    SET
      lease_owner = ${input.workerId},
      lease_expires_at = now() + (${input.leaseMinutes ?? 5} || ' minutes')::interval,
      updated_at = now()
    WHERE id = ${input.partitionId}
  `;
}

export async function upsertMetaSyncState(input: MetaSyncStateRecord) {
  await runMigrations();
  const sql = getDb();
  await sql`
    INSERT INTO meta_sync_state (
      business_id,
      provider_account_id,
      scope,
      historical_target_start,
      historical_target_end,
      effective_target_start,
      effective_target_end,
      ready_through_date,
      last_successful_partition_date,
      latest_background_activity_at,
      latest_successful_sync_at,
      completed_days,
      dead_letter_count,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.providerAccountId},
      ${input.scope},
      ${normalizeDate(input.historicalTargetStart)},
      ${normalizeDate(input.historicalTargetEnd)},
      ${normalizeDate(input.effectiveTargetStart)},
      ${normalizeDate(input.effectiveTargetEnd)},
      ${input.readyThroughDate ? normalizeDate(input.readyThroughDate) : null},
      ${input.lastSuccessfulPartitionDate ? normalizeDate(input.lastSuccessfulPartitionDate) : null},
      ${input.latestBackgroundActivityAt ?? null},
      ${input.latestSuccessfulSyncAt ?? null},
      ${input.completedDays},
      ${input.deadLetterCount},
      now()
    )
    ON CONFLICT (business_id, provider_account_id, scope)
    DO UPDATE SET
      historical_target_start = EXCLUDED.historical_target_start,
      historical_target_end = EXCLUDED.historical_target_end,
      effective_target_start = EXCLUDED.effective_target_start,
      effective_target_end = EXCLUDED.effective_target_end,
      ready_through_date = EXCLUDED.ready_through_date,
      last_successful_partition_date = EXCLUDED.last_successful_partition_date,
      latest_background_activity_at = EXCLUDED.latest_background_activity_at,
      latest_successful_sync_at = EXCLUDED.latest_successful_sync_at,
      completed_days = EXCLUDED.completed_days,
      dead_letter_count = EXCLUDED.dead_letter_count,
      updated_at = now()
  `;
}

export async function persistMetaRawSnapshot(input: MetaRawSnapshotRecord) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    INSERT INTO meta_raw_snapshots (
      business_id,
      provider_account_id,
      partition_id,
      checkpoint_id,
      endpoint_name,
      entity_scope,
      page_index,
      provider_cursor,
      start_date,
      end_date,
      account_timezone,
      account_currency,
      payload_json,
      payload_hash,
      request_context,
      response_headers,
      provider_http_status,
      status,
      fetched_at,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.providerAccountId},
      ${input.partitionId ?? null},
      ${input.checkpointId ?? null},
      ${input.endpointName},
      ${input.entityScope},
      ${input.pageIndex ?? null},
      ${input.providerCursor ?? null},
      ${normalizeDate(input.startDate)},
      ${normalizeDate(input.endDate)},
      ${input.accountTimezone},
      ${input.accountCurrency},
      ${JSON.stringify(input.payloadJson)}::jsonb,
      ${input.payloadHash},
      ${JSON.stringify(input.requestContext ?? {})}::jsonb,
      ${JSON.stringify(input.responseHeaders ?? {})}::jsonb,
      ${input.providerHttpStatus},
      ${input.status},
      COALESCE(${input.fetchedAt ?? null}, now()),
      now()
    )
    RETURNING id
  ` as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

export async function getLatestMetaSyncHealth(input: {
  businessId: string;
  providerAccountId?: string | null;
}) {
  await runMigrations();
  const sql = getDb();
  const [runRows, partitionRows, legacyRows] = await Promise.all([
    sql`
      SELECT
        id,
        provider_account_id,
        CASE
          WHEN lane = 'maintenance' AND scope = 'creative_daily' THEN 'incremental_recent'
          WHEN lane = 'maintenance' THEN 'today_refresh'
          ELSE 'initial_backfill'
        END AS sync_type,
        scope,
        partition_date AS start_date,
        partition_date AS end_date,
        'background_partition' AS trigger_source,
        created_at AS triggered_at,
        status,
        error_message AS last_error,
        NULL::double precision AS progress_percent,
        finished_at,
        started_at,
        updated_at
      FROM meta_sync_runs
      WHERE business_id = ${input.businessId}
        AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      ORDER BY updated_at DESC
      LIMIT 1
    `.catch(() => []) as Promise<Array<Record<string, unknown>>>,
    sql`
      SELECT
        id,
        provider_account_id,
        CASE
          WHEN lane = 'maintenance' AND source = 'today' THEN 'today_refresh'
          WHEN lane = 'maintenance' THEN 'incremental_recent'
          WHEN source = 'priority_window' THEN 'repair_window'
          ELSE 'initial_backfill'
        END AS sync_type,
        scope,
        partition_date AS start_date,
        partition_date AS end_date,
        source AS trigger_source,
        created_at AS triggered_at,
        status,
        last_error,
        NULL::double precision AS progress_percent,
        finished_at,
        started_at,
        updated_at
      FROM meta_sync_partitions
      WHERE business_id = ${input.businessId}
        AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      ORDER BY updated_at DESC
      LIMIT 1
    `.catch(() => []) as Promise<Array<Record<string, unknown>>>,
    sql`
      SELECT
        id,
        provider_account_id,
        sync_type,
        scope,
        start_date,
        end_date,
        trigger_source,
        triggered_at,
        status,
        last_error,
        progress_percent,
        finished_at,
        started_at,
        updated_at
      FROM meta_sync_jobs
      WHERE business_id = ${input.businessId}
        AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
        AND trigger_source <> 'request_runtime'
      ORDER BY updated_at DESC
      LIMIT 1
    `.catch(() => []) as Promise<Array<Record<string, unknown>>>,
  ]);
  return runRows[0] ?? partitionRows[0] ?? legacyRows[0] ?? null;
}

export async function expireStaleMetaSyncJobs(input: {
  businessId?: string | null;
  staleAfterMinutes?: number;
}) {
  await runMigrations();
  const sql = getDb();
  const staleAfterMinutes = Math.max(10, Math.floor(input.staleAfterMinutes ?? 45));
  const rows = await sql`
    UPDATE meta_sync_jobs
    SET
      status = 'cancelled',
      last_error = COALESCE(last_error, 'Sync job expired after inactivity.'),
      finished_at = COALESCE(finished_at, now()),
      updated_at = now()
    WHERE status = 'running'
      AND (${input.businessId ?? null}::text IS NULL OR business_id = ${input.businessId ?? null})
      AND COALESCE(updated_at, started_at, triggered_at) < now() - (${staleAfterMinutes} || ' minutes')::interval
    RETURNING id
  ` as Array<{ id: string }>;
  return rows.length;
}

export async function hasBlockingMetaSyncJob(input: {
  businessId: string;
  syncTypes?: string[] | null;
  triggerSources?: string[] | null;
  excludeTriggerSources?: string[] | null;
  scopes?: string[] | null;
  lookbackMinutes?: number;
}) {
  await runMigrations();
  const sql = getDb();
  const lookbackMinutes = Math.max(5, Math.floor(input.lookbackMinutes ?? 90));
  const [jobRows, partitionRows] = await Promise.all([
    sql`
    SELECT id
    FROM meta_sync_jobs
    WHERE business_id = ${input.businessId}
      AND status = 'running'
      AND COALESCE(updated_at, started_at, triggered_at) > now() - (${lookbackMinutes} || ' minutes')::interval
      AND (
        ${input.syncTypes ?? null}::text[] IS NULL
        OR sync_type = ANY(${input.syncTypes ?? null}::text[])
      )
      AND (
        ${input.triggerSources ?? null}::text[] IS NULL
        OR trigger_source = ANY(${input.triggerSources ?? null}::text[])
      )
      AND (
        ${input.excludeTriggerSources ?? null}::text[] IS NULL
        OR NOT (trigger_source = ANY(${input.excludeTriggerSources ?? null}::text[]))
      )
      AND (
        ${input.scopes ?? null}::text[] IS NULL
        OR scope = ANY(${input.scopes ?? null}::text[])
      )
    LIMIT 1
  ` as unknown as Promise<Array<{ id: string }>>,
    sql`
      SELECT id
      FROM meta_sync_partitions
      WHERE business_id = ${input.businessId}
        AND status IN ('leased', 'running')
        AND updated_at > now() - (${lookbackMinutes} || ' minutes')::interval
        AND (
          ${input.scopes ?? null}::text[] IS NULL
          OR scope = ANY(${input.scopes ?? null}::text[])
        )
      LIMIT 1
    ` as unknown as Promise<Array<{ id: string }>>,
  ]);
  return jobRows.length > 0 || partitionRows.length > 0;
}

export async function getMetaSyncJobHealth(input: {
  businessId: string;
  staleAfterMinutes?: number;
}) {
  await runMigrations();
  const sql = getDb();
  const staleAfterMinutes = Math.max(10, Math.floor(input.staleAfterMinutes ?? 45));
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'running')::int AS running_jobs,
      COUNT(*) FILTER (
        WHERE status = 'running'
          AND COALESCE(updated_at, started_at, triggered_at) < now() - (${staleAfterMinutes} || ' minutes')::interval
      )::int AS stale_running_jobs
    FROM meta_sync_jobs
    WHERE business_id = ${input.businessId}
  ` as Array<{
    running_jobs: number;
    stale_running_jobs: number;
  }>;
  return {
    runningJobs: rows[0]?.running_jobs ?? 0,
    staleRunningJobs: rows[0]?.stale_running_jobs ?? 0,
  };
}

export async function getMetaQueueHealth(input: { businessId: string }) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'queued') AS queue_depth,
      COUNT(*) FILTER (WHERE status IN ('leased', 'running')) AS leased_partitions,
      COUNT(*) FILTER (WHERE lane = 'core' AND status = 'queued') AS core_queue_depth,
      COUNT(*) FILTER (WHERE lane = 'core' AND status IN ('leased', 'running')) AS core_leased_partitions,
      COUNT(*) FILTER (
        WHERE lane = 'core'
          AND source IN ('historical', 'historical_recovery', 'initial_connect')
          AND status = 'queued'
      ) AS historical_core_queue_depth,
      COUNT(*) FILTER (
        WHERE lane = 'core'
          AND source IN ('historical', 'historical_recovery', 'initial_connect')
          AND status IN ('leased', 'running')
      ) AS historical_core_leased_partitions,
      COUNT(*) FILTER (WHERE lane = 'extended' AND status = 'queued') AS extended_queue_depth,
      COUNT(*) FILTER (WHERE lane = 'extended' AND status IN ('leased', 'running')) AS extended_leased_partitions,
      COUNT(*) FILTER (
        WHERE lane = 'extended'
          AND source IN ('recent', 'recent_recovery', 'today', 'priority_window', 'request_runtime', 'manual_refresh')
          AND status = 'queued'
      ) AS extended_recent_queue_depth,
      COUNT(*) FILTER (
        WHERE lane = 'extended'
          AND source IN ('recent', 'recent_recovery', 'today', 'priority_window', 'request_runtime', 'manual_refresh')
          AND status IN ('leased', 'running')
      ) AS extended_recent_leased_partitions,
      COUNT(*) FILTER (
        WHERE lane = 'extended'
          AND source IN ('historical', 'historical_recovery', 'initial_connect')
          AND status = 'queued'
      ) AS extended_historical_queue_depth,
      COUNT(*) FILTER (
        WHERE lane = 'extended'
          AND source IN ('historical', 'historical_recovery', 'initial_connect')
          AND status IN ('leased', 'running')
      ) AS extended_historical_leased_partitions,
      COUNT(*) FILTER (WHERE lane = 'maintenance' AND status = 'queued') AS maintenance_queue_depth,
      COUNT(*) FILTER (WHERE lane = 'maintenance' AND status IN ('leased', 'running')) AS maintenance_leased_partitions,
      COUNT(*) FILTER (WHERE status = 'failed') AS retryable_failed_partitions,
      COUNT(*) FILTER (WHERE status = 'dead_letter') AS dead_letter_partitions,
      MIN(partition_date) FILTER (WHERE status = 'queued') AS oldest_queued_partition,
      MAX(updated_at) FILTER (WHERE lane = 'core') AS latest_core_activity_at,
      MAX(updated_at) FILTER (WHERE lane = 'extended') AS latest_extended_activity_at,
      MAX(updated_at) FILTER (WHERE lane = 'maintenance') AS latest_maintenance_activity_at
    FROM meta_sync_partitions
    WHERE business_id = ${input.businessId}
  ` as Array<Record<string, unknown>>;
  const row = rows[0] ?? {};
  return {
    queueDepth: toNumber(row.queue_depth),
    leasedPartitions: toNumber(row.leased_partitions),
    coreQueueDepth: toNumber(row.core_queue_depth),
    coreLeasedPartitions: toNumber(row.core_leased_partitions),
    historicalCoreQueueDepth: toNumber(row.historical_core_queue_depth),
    historicalCoreLeasedPartitions: toNumber(row.historical_core_leased_partitions),
    extendedQueueDepth: toNumber(row.extended_queue_depth),
    extendedLeasedPartitions: toNumber(row.extended_leased_partitions),
    extendedRecentQueueDepth: toNumber(row.extended_recent_queue_depth),
    extendedRecentLeasedPartitions: toNumber(row.extended_recent_leased_partitions),
    extendedHistoricalQueueDepth: toNumber(row.extended_historical_queue_depth),
    extendedHistoricalLeasedPartitions: toNumber(row.extended_historical_leased_partitions),
    maintenanceQueueDepth: toNumber(row.maintenance_queue_depth),
    maintenanceLeasedPartitions: toNumber(row.maintenance_leased_partitions),
    retryableFailedPartitions: toNumber(row.retryable_failed_partitions),
    deadLetterPartitions: toNumber(row.dead_letter_partitions),
    oldestQueuedPartition: row.oldest_queued_partition ? normalizeDate(row.oldest_queued_partition) : null,
    latestCoreActivityAt: normalizeTimestamp(row.latest_core_activity_at),
    latestExtendedActivityAt: normalizeTimestamp(row.latest_extended_activity_at),
    latestMaintenanceActivityAt: normalizeTimestamp(row.latest_maintenance_activity_at),
  };
}

export async function getMetaPartitionHealth(input: {
  businessId: string;
  providerAccountId?: string | null;
  scope?: MetaWarehouseScope | null;
  lane?: "core" | "extended" | "maintenance" | null;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'queued') AS queue_depth,
      COUNT(*) FILTER (WHERE status IN ('leased', 'running')) AS leased_partitions,
      COUNT(*) FILTER (WHERE status = 'failed') AS retryable_failed_partitions,
      COUNT(*) FILTER (WHERE status = 'dead_letter') AS dead_letter_partitions,
      MIN(partition_date) FILTER (WHERE status = 'queued') AS oldest_queued_partition,
      MAX(updated_at) AS latest_activity_at
    FROM meta_sync_partitions
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND (${input.scope ?? null}::text IS NULL OR scope = ${input.scope ?? null})
      AND (${input.lane ?? null}::text IS NULL OR lane = ${input.lane ?? null})
  ` as Array<Record<string, unknown>>;
  const row = rows[0] ?? {};
  return {
    queueDepth: toNumber(row.queue_depth),
    leasedPartitions: toNumber(row.leased_partitions),
    retryableFailedPartitions: toNumber(row.retryable_failed_partitions),
    deadLetterPartitions: toNumber(row.dead_letter_partitions),
    oldestQueuedPartition: row.oldest_queued_partition ? normalizeDate(row.oldest_queued_partition) : null,
    latestActivityAt: normalizeTimestamp(row.latest_activity_at),
  };
}

export async function requeueMetaRetryableFailedPartitions(input: {
  businessId: string;
  limit?: number;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    WITH candidates AS (
      SELECT id
      FROM meta_sync_partitions
      WHERE business_id = ${input.businessId}
        AND status = 'failed'
        AND COALESCE(next_retry_at, now()) <= now()
      ORDER BY
        ${sql.unsafe(META_SOURCE_PRIORITY_SQL)} DESC,
        partition_date DESC,
        updated_at ASC
      LIMIT ${Math.max(1, input.limit ?? 500)}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE meta_sync_partitions partition
    SET
      status = 'queued',
      lease_owner = NULL,
      lease_expires_at = NULL,
      next_retry_at = now(),
      updated_at = now()
    FROM candidates
    WHERE partition.id = candidates.id
    RETURNING partition.id
  ` as Array<{ id: string }>;

  return rows.map((row) => row.id);
}

async function getMetaCoverageForTable(input: {
  tableName: string;
  scope: MetaWarehouseScope;
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  await runMigrations();
  const sql = getDb();
  const [rows, partitionRows] = await Promise.all([
    sql.query(
      `
        SELECT
          COUNT(DISTINCT date) AS completed_days,
          COALESCE(MAX(date), NULL) AS ready_through_date,
          COALESCE(MAX(updated_at), NULL) AS latest_updated_at,
          COUNT(*) AS total_rows
        FROM ${input.tableName}
        WHERE business_id = $1
          AND date >= $2
          AND date <= $3
          AND ($4::text IS NULL OR provider_account_id = $4)
      `,
      [
        input.businessId,
        normalizeDate(input.startDate),
        normalizeDate(input.endDate),
        input.providerAccountId ?? null,
      ]
    ) as Promise<Array<Record<string, unknown>>>,
    sql.query(
      `
        SELECT
          COUNT(DISTINCT partition_date) AS completed_days,
          COALESCE(MAX(partition_date), NULL) AS ready_through_date,
          COALESCE(MAX(updated_at), NULL) AS latest_updated_at
        FROM meta_sync_partitions
        WHERE business_id = $1
          AND scope = $2
          AND partition_date >= $3
          AND partition_date <= $4
          AND status = 'succeeded'
          AND ($5::text IS NULL OR provider_account_id = $5)
      `,
      [
        input.businessId,
        input.scope,
        normalizeDate(input.startDate),
        normalizeDate(input.endDate),
        input.providerAccountId ?? null,
      ]
    ) as Promise<Array<Record<string, unknown>>>,
  ]);
  const row = rows[0] ?? {};
  const partitionRow = partitionRows[0] ?? {};
  return {
    completed_days: Math.max(toNumber(row.completed_days), toNumber(partitionRow.completed_days)),
    ready_through_date:
      partitionRow.ready_through_date || row.ready_through_date
        ? normalizeDate(partitionRow.ready_through_date ?? row.ready_through_date)
        : null,
    latest_updated_at:
      partitionRow.latest_updated_at || row.latest_updated_at
        ? normalizeTimestamp(partitionRow.latest_updated_at ?? row.latest_updated_at)
        : null,
    total_rows: toNumber(row.total_rows),
  };
}

export async function getMetaAccountDailyCoverage(input: {
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  return getMetaCoverageForTable({
    tableName: "meta_account_daily",
    scope: "account_daily",
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    startDate: input.startDate,
    endDate: input.endDate,
  });
}

export async function getMetaCampaignDailyCoverage(input: {
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  return getMetaCoverageForTable({
    tableName: "meta_campaign_daily",
    scope: "campaign_daily",
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    startDate: input.startDate,
    endDate: input.endDate,
  });
}

export async function getMetaAdSetDailyCoverage(input: {
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  return getMetaCoverageForTable({
    tableName: "meta_adset_daily",
    scope: "adset_daily",
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    startDate: input.startDate,
    endDate: input.endDate,
  });
}

export async function getMetaAdDailyCoverage(input: {
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  return getMetaCoverageForTable({
    tableName: "meta_ad_daily",
    scope: "ad_daily",
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    startDate: input.startDate,
    endDate: input.endDate,
  });
}

export async function getMetaCreativeDailyCoverage(input: {
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  return getMetaCoverageForTable({
    tableName: "meta_creative_daily",
    scope: "creative_daily",
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    startDate: input.startDate,
    endDate: input.endDate,
  });
}

export async function getMetaAdDailyPreviewCoverage(input: {
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      COUNT(*)::int AS total_rows,
      COUNT(*) FILTER (
        WHERE
          NULLIF(payload_json->>'preview_url', '') IS NOT NULL OR
          NULLIF(payload_json->>'thumbnail_url', '') IS NOT NULL OR
          NULLIF(payload_json->>'image_url', '') IS NOT NULL OR
          NULLIF(payload_json->'preview'->>'image_url', '') IS NOT NULL OR
          NULLIF(payload_json->'preview'->>'poster_url', '') IS NOT NULL OR
          NULLIF(payload_json->'preview'->>'video_url', '') IS NOT NULL
      )::int AS preview_ready_rows
    FROM meta_ad_daily
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND date::date BETWEEN ${normalizeDate(input.startDate)}::date AND ${normalizeDate(input.endDate)}::date
  ` as Array<{
    total_rows: number;
    preview_ready_rows: number;
  }>;
  const row = rows[0] ?? { total_rows: 0, preview_ready_rows: 0 };
  return {
    total_rows: Number(row.total_rows ?? 0),
    preview_ready_rows: Number(row.preview_ready_rows ?? 0),
  };
}

export async function getMetaRawSnapshotCoverageByEndpoint(input: {
  businessId: string;
  endpointNames: string[];
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  const endpointNames = Array.from(new Set(input.endpointNames.filter(Boolean)));
  if (endpointNames.length === 0) {
    return new Map<string, { completed_days: number; ready_through_date: string | null }>();
  }

  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      endpoint_name,
      COUNT(DISTINCT start_date::date)::int AS completed_days,
      MAX(start_date::date)::text AS ready_through_date
    FROM meta_raw_snapshots
    WHERE business_id = ${input.businessId}
      AND endpoint_name = ANY(${endpointNames}::text[])
      AND status = 'fetched'
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND start_date::date BETWEEN ${normalizeDate(input.startDate)}::date AND ${normalizeDate(input.endDate)}::date
      AND end_date::date BETWEEN ${normalizeDate(input.startDate)}::date AND ${normalizeDate(input.endDate)}::date
    GROUP BY endpoint_name
  ` as Array<{
    endpoint_name: string;
    completed_days: number;
    ready_through_date: string | null;
  }>;

  const map = new Map<string, { completed_days: number; ready_through_date: string | null }>();
  for (const endpointName of endpointNames) {
    map.set(endpointName, { completed_days: 0, ready_through_date: null });
  }
  for (const row of rows) {
    map.set(row.endpoint_name, {
      completed_days: Number(row.completed_days ?? 0),
      ready_through_date: row.ready_through_date ?? null,
    });
  }
  return map;
}

export async function replayMetaDeadLetterPartitions(input: {
  businessId: string;
  scope?: MetaWarehouseScope | null;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    UPDATE meta_sync_partitions
    SET
      status = 'queued',
      lease_owner = NULL,
      lease_expires_at = NULL,
      next_retry_at = NULL,
      source = CASE
        WHEN lane = 'extended' THEN 'historical_recovery'
        ELSE source
      END,
      last_error = NULL,
      updated_at = now()
    WHERE business_id = ${input.businessId}
      AND status = 'dead_letter'
      AND (${input.scope ?? null}::text IS NULL OR scope = ${input.scope ?? null})
    RETURNING id, lane, scope, partition_date
  ` as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    lane: String(row.lane),
    scope: String(row.scope),
    partitionDate: normalizeDate(row.partition_date),
  }));
}

export async function getMetaSyncState(input: {
  businessId: string;
  providerAccountId?: string | null;
  scope: MetaWarehouseScope;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      business_id,
      provider_account_id,
      scope,
      historical_target_start,
      historical_target_end,
      effective_target_start,
      effective_target_end,
      ready_through_date,
      last_successful_partition_date,
      latest_background_activity_at,
      latest_successful_sync_at,
      completed_days,
      dead_letter_count,
      updated_at
    FROM meta_sync_state
    WHERE business_id = ${input.businessId}
      AND scope = ${input.scope}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
    ORDER BY updated_at DESC
  ` as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    businessId: String(row.business_id),
    providerAccountId: String(row.provider_account_id),
    scope: String(row.scope) as MetaWarehouseScope,
    historicalTargetStart: normalizeDate(row.historical_target_start),
    historicalTargetEnd: normalizeDate(row.historical_target_end),
    effectiveTargetStart: normalizeDate(row.effective_target_start),
    effectiveTargetEnd: normalizeDate(row.effective_target_end),
    readyThroughDate: row.ready_through_date ? normalizeDate(row.ready_through_date) : null,
    lastSuccessfulPartitionDate: row.last_successful_partition_date
      ? normalizeDate(row.last_successful_partition_date)
      : null,
    latestBackgroundActivityAt: normalizeTimestamp(row.latest_background_activity_at),
    latestSuccessfulSyncAt: normalizeTimestamp(row.latest_successful_sync_at),
    completedDays: toNumber(row.completed_days),
    deadLetterCount: toNumber(row.dead_letter_count),
    updatedAt: normalizeTimestamp(row.updated_at) ?? undefined,
  })) as MetaSyncStateRecord[];
}

export async function getMetaAccountDailyStats(input: {
  businessId: string;
  providerAccountId?: string | null;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      COUNT(*)::int AS row_count,
      MIN(date)::text AS first_date,
      MAX(date)::text AS last_date
    FROM meta_account_daily
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
  ` as Array<{
    row_count: number;
    first_date: string | null;
    last_date: string | null;
  }>;
  return rows[0] ?? { row_count: 0, first_date: null, last_date: null };
}

export async function getLatestMetaRawSnapshot(input: {
  businessId: string;
  providerAccountId: string;
  endpointName: string;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      id,
      fetched_at,
      status,
      account_timezone,
      account_currency,
      payload_json
    FROM meta_raw_snapshots
    WHERE business_id = ${input.businessId}
      AND provider_account_id = ${input.providerAccountId}
      AND endpoint_name = ${input.endpointName}
    ORDER BY fetched_at DESC
    LIMIT 1
  ` as Array<{
    id: string;
    fetched_at: string;
    status: string;
    account_timezone: string | null;
    account_currency: string | null;
    payload_json: unknown;
  }>;
  return rows[0] ?? null;
}

export async function upsertMetaAccountDailyRows(rows: MetaAccountDailyRow[]) {
  if (rows.length === 0) return;
  await runMigrations();
  const sql = getDb();
  for (const chunk of chunkRows(rows)) {
    const values: unknown[] = [];
    const placeholders = chunk
      .map((row, index) => {
        const offset = index * 18;
        values.push(
          row.businessId,
          row.providerAccountId,
          normalizeDate(row.date),
          row.accountName,
          row.accountTimezone,
          row.accountCurrency,
          row.spend,
          row.impressions,
          row.clicks,
          row.reach,
          row.frequency,
          row.conversions,
          row.revenue,
          row.roas,
          row.cpa,
          row.ctr,
          row.cpc,
          row.sourceSnapshotId
        );
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11},$${offset + 12},$${offset + 13},$${offset + 14},$${offset + 15},$${offset + 16},$${offset + 17},$${offset + 18},now())`;
      })
      .join(", ");
    await sql.query(
      `
        INSERT INTO meta_account_daily (
          business_id,
          provider_account_id,
          date,
          account_name,
          account_timezone,
          account_currency,
          spend,
          impressions,
          clicks,
          reach,
          frequency,
          conversions,
          revenue,
          roas,
          cpa,
          ctr,
          cpc,
          source_snapshot_id,
          updated_at
        )
        VALUES ${placeholders}
        ON CONFLICT (business_id, provider_account_id, date) DO UPDATE SET
          account_name = EXCLUDED.account_name,
          account_timezone = EXCLUDED.account_timezone,
          account_currency = EXCLUDED.account_currency,
          spend = EXCLUDED.spend,
          impressions = EXCLUDED.impressions,
          clicks = EXCLUDED.clicks,
          reach = EXCLUDED.reach,
          frequency = EXCLUDED.frequency,
          conversions = EXCLUDED.conversions,
          revenue = EXCLUDED.revenue,
          roas = EXCLUDED.roas,
          cpa = EXCLUDED.cpa,
          ctr = EXCLUDED.ctr,
          cpc = EXCLUDED.cpc,
          source_snapshot_id = EXCLUDED.source_snapshot_id,
          updated_at = now()
      `,
      values
    );
  }
}

export async function upsertMetaCampaignDailyRows(rows: MetaCampaignDailyRow[]) {
  if (rows.length === 0) return;
  await runMigrations();
  const sql = getDb();
  for (const chunk of chunkRows(rows, 200)) {
    const values: unknown[] = [];
    const placeholders = chunk
      .map((row, index) => {
        const offset = index * 23;
        values.push(
          row.businessId,
          row.providerAccountId,
          normalizeDate(row.date),
          row.campaignId,
          row.campaignNameCurrent,
          row.campaignNameHistorical,
          row.campaignStatus,
          row.objective,
          row.buyingType,
          row.accountTimezone,
          row.accountCurrency,
          row.spend,
          row.impressions,
          row.clicks,
          row.reach,
          row.frequency,
          row.conversions,
          row.revenue,
          row.roas,
          row.cpa,
          row.ctr,
          row.cpc,
          row.sourceSnapshotId
        );
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11},$${offset + 12},$${offset + 13},$${offset + 14},$${offset + 15},$${offset + 16},$${offset + 17},$${offset + 18},$${offset + 19},$${offset + 20},$${offset + 21},$${offset + 22},$${offset + 23},now())`;
      })
      .join(", ");
    await sql.query(
      `
      INSERT INTO meta_campaign_daily (
        business_id,
        provider_account_id,
        date,
        campaign_id,
        campaign_name_current,
        campaign_name_historical,
        campaign_status,
        objective,
        buying_type,
        account_timezone,
        account_currency,
        spend,
        impressions,
        clicks,
        reach,
        frequency,
        conversions,
        revenue,
        roas,
        cpa,
        ctr,
        cpc,
        source_snapshot_id,
        updated_at
      )
      VALUES ${placeholders}
      ON CONFLICT (business_id, provider_account_id, date, campaign_id) DO UPDATE SET
        campaign_name_current = EXCLUDED.campaign_name_current,
        campaign_name_historical = EXCLUDED.campaign_name_historical,
        campaign_status = EXCLUDED.campaign_status,
        objective = EXCLUDED.objective,
        buying_type = EXCLUDED.buying_type,
        account_timezone = EXCLUDED.account_timezone,
        account_currency = EXCLUDED.account_currency,
        spend = EXCLUDED.spend,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        reach = EXCLUDED.reach,
        frequency = EXCLUDED.frequency,
        conversions = EXCLUDED.conversions,
        revenue = EXCLUDED.revenue,
        roas = EXCLUDED.roas,
        cpa = EXCLUDED.cpa,
        ctr = EXCLUDED.ctr,
        cpc = EXCLUDED.cpc,
        source_snapshot_id = EXCLUDED.source_snapshot_id,
        updated_at = now()
    `,
      values
    );
  }
}

export async function upsertMetaAdSetDailyRows(rows: MetaAdSetDailyRow[]) {
  if (rows.length === 0) return;
  await runMigrations();
  const sql = getDb();
  for (const chunk of chunkRows(rows, 200)) {
    const values: unknown[] = [];
    const placeholders = chunk
      .map((row, index) => {
        const offset = index * 22;
        values.push(
          row.businessId,
          row.providerAccountId,
          normalizeDate(row.date),
          row.campaignId,
          row.adsetId,
          row.adsetNameCurrent,
          row.adsetNameHistorical,
          row.adsetStatus,
          row.accountTimezone,
          row.accountCurrency,
          row.spend,
          row.impressions,
          row.clicks,
          row.reach,
          row.frequency,
          row.conversions,
          row.revenue,
          row.roas,
          row.cpa,
          row.ctr,
          row.cpc,
          row.sourceSnapshotId
        );
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11},$${offset + 12},$${offset + 13},$${offset + 14},$${offset + 15},$${offset + 16},$${offset + 17},$${offset + 18},$${offset + 19},$${offset + 20},$${offset + 21},$${offset + 22},now())`;
      })
      .join(", ");
    await sql.query(
      `
      INSERT INTO meta_adset_daily (
        business_id,
        provider_account_id,
        date,
        campaign_id,
        adset_id,
        adset_name_current,
        adset_name_historical,
        adset_status,
        account_timezone,
        account_currency,
        spend,
        impressions,
        clicks,
        reach,
        frequency,
        conversions,
        revenue,
        roas,
        cpa,
        ctr,
        cpc,
        source_snapshot_id,
        updated_at
      )
      VALUES ${placeholders}
      ON CONFLICT (business_id, provider_account_id, date, adset_id) DO UPDATE SET
        campaign_id = EXCLUDED.campaign_id,
        adset_name_current = EXCLUDED.adset_name_current,
        adset_name_historical = EXCLUDED.adset_name_historical,
        adset_status = EXCLUDED.adset_status,
        account_timezone = EXCLUDED.account_timezone,
        account_currency = EXCLUDED.account_currency,
        spend = EXCLUDED.spend,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        reach = EXCLUDED.reach,
        frequency = EXCLUDED.frequency,
        conversions = EXCLUDED.conversions,
        revenue = EXCLUDED.revenue,
        roas = EXCLUDED.roas,
        cpa = EXCLUDED.cpa,
        ctr = EXCLUDED.ctr,
        cpc = EXCLUDED.cpc,
        source_snapshot_id = EXCLUDED.source_snapshot_id,
        updated_at = now()
    `,
      values
    );
  }
}

export async function upsertMetaAdDailyRows(rows: MetaAdDailyRow[]) {
  if (rows.length === 0) return;
  await runMigrations();
  const sql = getDb();
  for (const chunk of chunkRows(rows, 150)) {
    const values: unknown[] = [];
    const placeholders = chunk
      .map((row, index) => {
        const offset = index * 24;
        values.push(
          row.businessId,
          row.providerAccountId,
          normalizeDate(row.date),
          row.campaignId,
          row.adsetId,
          row.adId,
          row.adNameCurrent,
          row.adNameHistorical,
          row.adStatus,
          row.accountTimezone,
          row.accountCurrency,
          row.spend,
          row.impressions,
          row.clicks,
          row.reach,
          row.frequency,
          row.conversions,
          row.revenue,
          row.roas,
          row.cpa,
          row.ctr,
          row.cpc,
          row.sourceSnapshotId,
          JSON.stringify(row.payloadJson ?? null)
        );
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11},$${offset + 12},$${offset + 13},$${offset + 14},$${offset + 15},$${offset + 16},$${offset + 17},$${offset + 18},$${offset + 19},$${offset + 20},$${offset + 21},$${offset + 22},$${offset + 23},$${offset + 24}::jsonb,now())`;
      })
      .join(", ");
    await sql.query(
      `
      INSERT INTO meta_ad_daily (
        business_id,
        provider_account_id,
        date,
        campaign_id,
        adset_id,
        ad_id,
        ad_name_current,
        ad_name_historical,
        ad_status,
        account_timezone,
        account_currency,
        spend,
        impressions,
        clicks,
        reach,
        frequency,
        conversions,
        revenue,
        roas,
        cpa,
        ctr,
        cpc,
        source_snapshot_id,
        payload_json,
        updated_at
      )
      VALUES ${placeholders}
      ON CONFLICT (business_id, provider_account_id, date, ad_id) DO UPDATE SET
        campaign_id = EXCLUDED.campaign_id,
        adset_id = EXCLUDED.adset_id,
        ad_name_current = EXCLUDED.ad_name_current,
        ad_name_historical = EXCLUDED.ad_name_historical,
        ad_status = EXCLUDED.ad_status,
        account_timezone = EXCLUDED.account_timezone,
        account_currency = EXCLUDED.account_currency,
        spend = EXCLUDED.spend,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        reach = EXCLUDED.reach,
        frequency = EXCLUDED.frequency,
        conversions = EXCLUDED.conversions,
        revenue = EXCLUDED.revenue,
        roas = EXCLUDED.roas,
        cpa = EXCLUDED.cpa,
        ctr = EXCLUDED.ctr,
        cpc = EXCLUDED.cpc,
        source_snapshot_id = EXCLUDED.source_snapshot_id,
        payload_json = EXCLUDED.payload_json,
        updated_at = now()
    `,
      values
    );
  }
}

export async function upsertMetaCreativeDailyRows(rows: MetaCreativeDailyRow[]) {
  if (rows.length === 0) return;
  await runMigrations();
  const sql = getDb();

  for (const row of rows) {
    await sql`
      INSERT INTO meta_creative_daily (
        business_id,
        provider_account_id,
        date,
        campaign_id,
        adset_id,
        ad_id,
        creative_id,
        creative_name,
        headline,
        primary_text,
        destination_url,
        thumbnail_url,
        asset_type,
        account_timezone,
        account_currency,
        spend,
        impressions,
        clicks,
        conversions,
        revenue,
        roas,
        ctr,
        cpc,
        source_snapshot_id,
        payload_json,
        updated_at
      )
      VALUES (
        ${row.businessId},
        ${row.providerAccountId},
        ${normalizeDate(row.date)},
        ${row.campaignId},
        ${row.adsetId},
        ${row.adId},
        ${row.creativeId},
        ${row.creativeName},
        ${row.headline},
        ${row.primaryText},
        ${row.destinationUrl},
        ${row.thumbnailUrl},
        ${row.assetType},
        ${row.accountTimezone},
        ${row.accountCurrency},
        ${row.spend},
        ${row.impressions},
        ${row.clicks},
        ${row.conversions},
        ${row.revenue},
        ${row.roas},
        ${row.ctr},
        ${row.cpc},
        ${row.sourceSnapshotId},
        ${JSON.stringify(row.payloadJson ?? null)}::jsonb,
        now()
      )
      ON CONFLICT (business_id, provider_account_id, date, creative_id) DO UPDATE SET
        campaign_id = EXCLUDED.campaign_id,
        adset_id = EXCLUDED.adset_id,
        ad_id = EXCLUDED.ad_id,
        creative_name = EXCLUDED.creative_name,
        headline = EXCLUDED.headline,
        primary_text = EXCLUDED.primary_text,
        destination_url = EXCLUDED.destination_url,
        thumbnail_url = EXCLUDED.thumbnail_url,
        asset_type = EXCLUDED.asset_type,
        account_timezone = EXCLUDED.account_timezone,
        account_currency = EXCLUDED.account_currency,
        spend = EXCLUDED.spend,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        conversions = EXCLUDED.conversions,
        revenue = EXCLUDED.revenue,
        roas = EXCLUDED.roas,
        ctr = EXCLUDED.ctr,
        cpc = EXCLUDED.cpc,
        source_snapshot_id = EXCLUDED.source_snapshot_id,
        payload_json = EXCLUDED.payload_json,
        updated_at = now()
    `;
  }
}

export async function getMetaAccountDailyRange(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  providerAccountIds?: string[] | null;
}): Promise<MetaAccountDailyRow[]> {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      business_id,
      provider_account_id,
      date,
      account_name,
      account_timezone,
      account_currency,
      spend,
      impressions,
      clicks,
      reach,
      frequency,
      conversions,
      revenue,
      roas,
      cpa,
      ctr,
      cpc,
      source_snapshot_id,
      created_at,
      updated_at
    FROM meta_account_daily
    WHERE business_id = ${input.businessId}
      AND date >= ${normalizeDate(input.startDate)}
      AND date <= ${normalizeDate(input.endDate)}
      AND (
        ${input.providerAccountIds ?? null}::text[] IS NULL
        OR provider_account_id = ANY(${input.providerAccountIds ?? null}::text[])
      )
    ORDER BY date ASC, provider_account_id ASC
  ` as Array<{
    business_id: string;
    provider_account_id: string;
    date: string;
    account_name: string | null;
    account_timezone: string;
    account_currency: string;
    spend: number;
    impressions: number;
    clicks: number;
    reach: number;
    frequency: number | null;
    conversions: number;
    revenue: number;
    roas: number;
    cpa: number | null;
    ctr: number | null;
    cpc: number | null;
    source_snapshot_id: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    businessId: row.business_id,
    providerAccountId: row.provider_account_id,
    date: row.date,
    accountName: row.account_name,
    accountTimezone: row.account_timezone,
    accountCurrency: row.account_currency,
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    reach: Number(row.reach ?? 0),
    frequency: row.frequency == null ? null : Number(row.frequency),
    conversions: Number(row.conversions ?? 0),
    revenue: Number(row.revenue ?? 0),
    roas: Number(row.roas ?? 0),
    cpa: row.cpa == null ? null : Number(row.cpa),
    ctr: row.ctr == null ? null : Number(row.ctr),
    cpc: row.cpc == null ? null : Number(row.cpc),
    sourceSnapshotId: row.source_snapshot_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getMetaCheckpointHealth(input: {
  businessId: string;
  providerAccountId?: string | null;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      checkpoint_scope,
      phase,
      status,
      page_index,
      updated_at,
      COUNT(*) FILTER (WHERE status = 'failed') OVER ()::int AS checkpoint_failures
    FROM meta_sync_checkpoints
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
    ORDER BY updated_at DESC
    LIMIT 1
  ` as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) {
    return {
      latestCheckpointScope: null,
      latestCheckpointPhase: null,
      latestCheckpointStatus: null,
      latestCheckpointUpdatedAt: null,
      checkpointLagMinutes: null,
      lastSuccessfulPageIndex: null,
      resumeCapable: false,
      checkpointFailures: 0,
    };
  }
  const updatedAt = normalizeTimestamp(row.updated_at);
  const lagMinutes =
    updatedAt && Number.isFinite(new Date(updatedAt).getTime())
      ? Math.max(0, Math.round((Date.now() - new Date(updatedAt).getTime()) / 60_000))
      : null;
  return {
    latestCheckpointScope: row.checkpoint_scope ? String(row.checkpoint_scope) : null,
    latestCheckpointPhase: row.phase ? String(row.phase) : null,
    latestCheckpointStatus: row.status ? String(row.status) : null,
    latestCheckpointUpdatedAt: updatedAt,
    checkpointLagMinutes: lagMinutes,
    lastSuccessfulPageIndex: toNumber(row.page_index),
    resumeCapable:
      row.status != null &&
      ["pending", "running", "failed"].includes(String(row.status)),
    checkpointFailures: toNumber(row.checkpoint_failures),
  };
}

export async function getMetaCampaignDailyRange(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  providerAccountIds?: string[] | null;
}): Promise<MetaCampaignDailyRow[]> {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      business_id,
      provider_account_id,
      date,
      campaign_id,
      campaign_name_current,
      campaign_name_historical,
      campaign_status,
      objective,
      buying_type,
      account_timezone,
      account_currency,
      spend,
      impressions,
      clicks,
      reach,
      frequency,
      conversions,
      revenue,
      roas,
      cpa,
      ctr,
      cpc,
      source_snapshot_id,
      created_at,
      updated_at
    FROM meta_campaign_daily
    WHERE business_id = ${input.businessId}
      AND date >= ${normalizeDate(input.startDate)}
      AND date <= ${normalizeDate(input.endDate)}
      AND (
        ${input.providerAccountIds ?? null}::text[] IS NULL
        OR provider_account_id = ANY(${input.providerAccountIds ?? null}::text[])
      )
    ORDER BY date ASC, provider_account_id ASC, campaign_id ASC
  ` as Array<{
    business_id: string;
    provider_account_id: string;
    date: string;
    campaign_id: string;
    campaign_name_current: string | null;
    campaign_name_historical: string | null;
    campaign_status: string | null;
    objective: string | null;
    buying_type: string | null;
    account_timezone: string;
    account_currency: string;
    spend: number;
    impressions: number;
    clicks: number;
    reach: number;
    frequency: number | null;
    conversions: number;
    revenue: number;
    roas: number;
    cpa: number | null;
    ctr: number | null;
    cpc: number | null;
    source_snapshot_id: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    businessId: row.business_id,
    providerAccountId: row.provider_account_id,
    date: row.date,
    campaignId: row.campaign_id,
    campaignNameCurrent: row.campaign_name_current,
    campaignNameHistorical: row.campaign_name_historical,
    campaignStatus: row.campaign_status,
    objective: row.objective,
    buyingType: row.buying_type,
    accountTimezone: row.account_timezone,
    accountCurrency: row.account_currency,
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    reach: Number(row.reach ?? 0),
    frequency: row.frequency == null ? null : Number(row.frequency),
    conversions: Number(row.conversions ?? 0),
    revenue: Number(row.revenue ?? 0),
    roas: Number(row.roas ?? 0),
    cpa: row.cpa == null ? null : Number(row.cpa),
    ctr: row.ctr == null ? null : Number(row.ctr),
    cpc: row.cpc == null ? null : Number(row.cpc),
    sourceSnapshotId: row.source_snapshot_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getMetaAdSetDailyRange(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  providerAccountIds?: string[] | null;
  campaignIds?: string[] | null;
}): Promise<MetaAdSetDailyRow[]> {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      business_id,
      provider_account_id,
      date,
      campaign_id,
      adset_id,
      adset_name_current,
      adset_name_historical,
      adset_status,
      account_timezone,
      account_currency,
      spend,
      impressions,
      clicks,
      reach,
      frequency,
      conversions,
      revenue,
      roas,
      cpa,
      ctr,
      cpc,
      source_snapshot_id,
      created_at,
      updated_at
    FROM meta_adset_daily
    WHERE business_id = ${input.businessId}
      AND date >= ${normalizeDate(input.startDate)}
      AND date <= ${normalizeDate(input.endDate)}
      AND (
        ${input.providerAccountIds ?? null}::text[] IS NULL
        OR provider_account_id = ANY(${input.providerAccountIds ?? null}::text[])
      )
      AND (
        ${input.campaignIds ?? null}::text[] IS NULL
        OR campaign_id = ANY(${input.campaignIds ?? null}::text[])
      )
    ORDER BY date ASC, provider_account_id ASC, campaign_id ASC, adset_id ASC
  ` as Array<{
    business_id: string;
    provider_account_id: string;
    date: string;
    campaign_id: string | null;
    adset_id: string;
    adset_name_current: string | null;
    adset_name_historical: string | null;
    adset_status: string | null;
    account_timezone: string;
    account_currency: string;
    spend: number;
    impressions: number;
    clicks: number;
    reach: number;
    frequency: number | null;
    conversions: number;
    revenue: number;
    roas: number;
    cpa: number | null;
    ctr: number | null;
    cpc: number | null;
    source_snapshot_id: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    businessId: row.business_id,
    providerAccountId: row.provider_account_id,
    date: row.date,
    campaignId: row.campaign_id,
    adsetId: row.adset_id,
    adsetNameCurrent: row.adset_name_current,
    adsetNameHistorical: row.adset_name_historical,
    adsetStatus: row.adset_status,
    accountTimezone: row.account_timezone,
    accountCurrency: row.account_currency,
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    reach: Number(row.reach ?? 0),
    frequency: row.frequency == null ? null : Number(row.frequency),
    conversions: Number(row.conversions ?? 0),
    revenue: Number(row.revenue ?? 0),
    roas: Number(row.roas ?? 0),
    cpa: row.cpa == null ? null : Number(row.cpa),
    ctr: row.ctr == null ? null : Number(row.ctr),
    cpc: row.cpc == null ? null : Number(row.cpc),
    sourceSnapshotId: row.source_snapshot_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getMetaAdDailyRange(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  providerAccountIds?: string[] | null;
}): Promise<MetaAdDailyRow[]> {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      business_id,
      provider_account_id,
      date,
      campaign_id,
      adset_id,
      ad_id,
      ad_name_current,
      ad_name_historical,
      ad_status,
      account_timezone,
      account_currency,
      spend,
      impressions,
      clicks,
      reach,
      frequency,
      conversions,
      revenue,
      roas,
      cpa,
      ctr,
      cpc,
      source_snapshot_id,
      payload_json,
      created_at,
      updated_at
    FROM meta_ad_daily
    WHERE business_id = ${input.businessId}
      AND date >= ${normalizeDate(input.startDate)}
      AND date <= ${normalizeDate(input.endDate)}
      AND (
        ${input.providerAccountIds ?? null}::text[] IS NULL
        OR provider_account_id = ANY(${input.providerAccountIds ?? null}::text[])
      )
    ORDER BY date ASC, provider_account_id ASC, ad_id ASC
  ` as Array<{
    business_id: string;
    provider_account_id: string;
    date: string;
    campaign_id: string | null;
    adset_id: string | null;
    ad_id: string;
    ad_name_current: string | null;
    ad_name_historical: string | null;
    ad_status: string | null;
    account_timezone: string;
    account_currency: string;
    spend: number;
    impressions: number;
    clicks: number;
    reach: number;
    frequency: number | null;
    conversions: number;
    revenue: number;
    roas: number;
    cpa: number | null;
    ctr: number | null;
    cpc: number | null;
    source_snapshot_id: string | null;
    payload_json: unknown;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    businessId: row.business_id,
    providerAccountId: row.provider_account_id,
    date: row.date,
    campaignId: row.campaign_id,
    adsetId: row.adset_id,
    adId: row.ad_id,
    adNameCurrent: row.ad_name_current,
    adNameHistorical: row.ad_name_historical,
    adStatus: row.ad_status,
    accountTimezone: row.account_timezone,
    accountCurrency: row.account_currency,
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    reach: Number(row.reach ?? 0),
    frequency: row.frequency == null ? null : Number(row.frequency),
    conversions: Number(row.conversions ?? 0),
    revenue: Number(row.revenue ?? 0),
    roas: Number(row.roas ?? 0),
    cpa: row.cpa == null ? null : Number(row.cpa),
    ctr: row.ctr == null ? null : Number(row.ctr),
    cpc: row.cpc == null ? null : Number(row.cpc),
    sourceSnapshotId: row.source_snapshot_id,
    payloadJson: row.payload_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getMetaCreativeDailyRange(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  providerAccountIds?: string[] | null;
}): Promise<MetaCreativeDailyRow[]> {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      business_id,
      provider_account_id,
      date,
      campaign_id,
      adset_id,
      ad_id,
      creative_id,
      creative_name,
      headline,
      primary_text,
      destination_url,
      thumbnail_url,
      asset_type,
      account_timezone,
      account_currency,
      spend,
      impressions,
      clicks,
      conversions,
      revenue,
      roas,
      ctr,
      cpc,
      source_snapshot_id,
      payload_json,
      created_at,
      updated_at
    FROM meta_creative_daily
    WHERE business_id = ${input.businessId}
      AND date >= ${normalizeDate(input.startDate)}
      AND date <= ${normalizeDate(input.endDate)}
      AND (
        ${input.providerAccountIds ?? null}::text[] IS NULL
        OR provider_account_id = ANY(${input.providerAccountIds ?? null}::text[])
      )
    ORDER BY date ASC, provider_account_id ASC, creative_id ASC
  ` as Array<{
    business_id: string;
    provider_account_id: string;
    date: string;
    campaign_id: string | null;
    adset_id: string | null;
    ad_id: string | null;
    creative_id: string;
    creative_name: string | null;
    headline: string | null;
    primary_text: string | null;
    destination_url: string | null;
    thumbnail_url: string | null;
    asset_type: string | null;
    account_timezone: string;
    account_currency: string;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
    roas: number;
    ctr: number | null;
    cpc: number | null;
    source_snapshot_id: string | null;
    payload_json: unknown;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    businessId: row.business_id,
    providerAccountId: row.provider_account_id,
    date: row.date,
    campaignId: row.campaign_id,
    adsetId: row.adset_id,
    adId: row.ad_id,
    creativeId: row.creative_id,
    creativeName: row.creative_name,
    headline: row.headline,
    primaryText: row.primary_text,
    destinationUrl: row.destination_url,
    thumbnailUrl: row.thumbnail_url,
    assetType: row.asset_type,
    accountTimezone: row.account_timezone,
    accountCurrency: row.account_currency,
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    reach: 0,
    frequency: null,
    conversions: Number(row.conversions ?? 0),
    revenue: Number(row.revenue ?? 0),
    roas: Number(row.roas ?? 0),
    cpa: null,
    ctr: row.ctr == null ? null : Number(row.ctr),
    cpc: row.cpc == null ? null : Number(row.cpc),
    sourceSnapshotId: row.source_snapshot_id,
    payloadJson: row.payload_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getMetaRawSnapshotsForWindow(input: {
  businessId: string;
  endpointNames: string[];
  startDate: string;
  endDate: string;
  providerAccountIds?: string[] | null;
}) {
  const endpointNames = Array.from(new Set(input.endpointNames.filter(Boolean)));
  if (endpointNames.length === 0) return [];

  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    WITH ranked AS (
      SELECT
        id,
        business_id,
        provider_account_id,
        endpoint_name,
        entity_scope,
        start_date,
        end_date,
        account_timezone,
        account_currency,
        payload_json,
        payload_hash,
        request_context,
        provider_http_status,
        status,
        fetched_at,
        created_at,
        updated_at,
        ROW_NUMBER() OVER (
          PARTITION BY provider_account_id, endpoint_name, start_date, end_date
          ORDER BY fetched_at DESC, created_at DESC
        ) AS row_num
      FROM meta_raw_snapshots
      WHERE business_id = ${input.businessId}
        AND endpoint_name = ANY(${endpointNames}::text[])
        AND start_date >= ${normalizeDate(input.startDate)}
        AND end_date <= ${normalizeDate(input.endDate)}
        AND (
          ${input.providerAccountIds ?? null}::text[] IS NULL
          OR provider_account_id = ANY(${input.providerAccountIds ?? null}::text[])
        )
    )
    SELECT
      id,
      business_id,
      provider_account_id,
      endpoint_name,
      entity_scope,
      start_date,
      end_date,
      account_timezone,
      account_currency,
      payload_json,
      payload_hash,
      request_context,
      provider_http_status,
      status,
      fetched_at,
      created_at,
      updated_at
    FROM ranked
    WHERE row_num = 1
    ORDER BY start_date ASC, provider_account_id ASC, endpoint_name ASC
  ` as Array<{
    id: string;
    business_id: string;
    provider_account_id: string;
    endpoint_name: string;
    entity_scope: string;
    start_date: string;
    end_date: string;
    account_timezone: string | null;
    account_currency: string | null;
    payload_json: unknown;
    payload_hash: string;
    request_context: Record<string, unknown> | null;
    provider_http_status: number | null;
    status: MetaRawSnapshotRecord["status"];
    fetched_at: string;
    created_at: string;
    updated_at: string;
  }>;
  return rows;
}
