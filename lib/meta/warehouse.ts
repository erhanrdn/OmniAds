import { createHash } from "node:crypto";
import { META_PRODUCT_CORE_COVERAGE_SCOPES } from "@/lib/meta/core-config";
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
  CASE source
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

type MetaClosedCheckpointGroup = {
  checkpointScope: string;
  previousPhase: string;
  count: number;
};

type MetaRunObservabilityPath = "primary" | "backfill" | "repair";

export type MetaPartitionAttemptCompletionResult =
  | {
      ok: true;
      runUpdated: boolean;
      closedRunningRunCount: number;
      callerRunIdWasClosed: boolean | null;
      closedRunningRunIds: string[];
      closedCheckpointGroups: MetaClosedCheckpointGroup[];
      observedLatestRunningRunId: string | null;
      callerRunIdMatchedLatestRunningRunId: boolean | null;
    }
  | {
      ok: false;
      reason: "lease_conflict";
    };

export type MetaCompletionDenialClassification =
  | "owner_mismatch"
  | "epoch_mismatch"
  | "lease_expired"
  | "already_terminal"
  | "unknown_denial";

export interface MetaPartitionCompletionDenialSnapshot {
  currentPartitionStatus: string | null;
  currentLeaseOwner: string | null;
  currentLeaseEpoch: number | null;
  currentLeaseExpiresAt: string | null;
  ownerMatchesCaller: boolean | null;
  epochMatchesCaller: boolean | null;
  leaseExpiredAtObservation: boolean | null;
  currentPartitionFinishedAt: string | null;
  latestCheckpointScope: string | null;
  latestCheckpointPhase: string | null;
  latestCheckpointUpdatedAt: string | null;
  latestRunningRunId: string | null;
  runningRunCount: number;
  denialClassification: MetaCompletionDenialClassification;
}

const META_DAILY_COVERAGE_TABLE_BY_SCOPE: Partial<Record<MetaWarehouseScope, string>> = {
  account_daily: "meta_account_daily",
  campaign_daily: "meta_campaign_daily",
  adset_daily: "meta_adset_daily",
  ad_daily: "meta_ad_daily",
  creative_daily: "meta_creative_daily",
};

export interface MetaCleanupPreservedByReason {
  recentCheckpointProgress: number;
  matchingRunnerLeasePresent: number;
  leaseNotExpired: number;
}

export interface MetaCleanupSummary {
  candidateCount: number;
  stalePartitionCount: number;
  aliveSlowCount: number;
  reconciledRunCount: number;
  staleRunCount: number;
  staleLegacyCount: number;
  reclaimReasons: {
    stalledReclaimable: string[];
  };
  preservedByReason: MetaCleanupPreservedByReason;
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
        WHEN meta_sync_partitions.source = 'yesterday' THEN meta_sync_partitions.source
        WHEN EXCLUDED.source = 'yesterday' THEN EXCLUDED.source
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
        WHEN EXCLUDED.source IN (
          'priority_window',
          'yesterday',
          'recent',
          'recent_recovery',
          'today',
          'request_runtime',
          'historical_recovery'
        )
          AND meta_sync_partitions.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
          THEN 'queued'
        ELSE meta_sync_partitions.status
      END,
      lease_owner = CASE
        WHEN EXCLUDED.source IN (
          'priority_window',
          'recent',
          'recent_recovery',
          'today',
          'request_runtime',
          'historical_recovery'
        )
          AND meta_sync_partitions.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
          THEN NULL
        ELSE meta_sync_partitions.lease_owner
      END,
      lease_expires_at = CASE
        WHEN EXCLUDED.source IN (
          'priority_window',
          'recent',
          'recent_recovery',
          'today',
          'request_runtime',
          'historical_recovery'
        )
          AND meta_sync_partitions.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
          THEN NULL
        ELSE meta_sync_partitions.lease_expires_at
      END,
      last_error = CASE
        WHEN EXCLUDED.source IN (
          'priority_window',
          'recent',
          'recent_recovery',
          'today',
          'request_runtime',
          'historical_recovery'
        )
          AND meta_sync_partitions.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
          THEN NULL
        ELSE meta_sync_partitions.last_error
      END,
      next_retry_at = CASE
        WHEN EXCLUDED.source IN (
          'priority_window',
          'recent',
          'recent_recovery',
          'today',
          'request_runtime',
          'historical_recovery'
        )
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

export async function cancelObsoleteMetaCoreScopePartitions(input: {
  businessId: string;
  canonicalScope?: MetaWarehouseScope;
}) {
  await runMigrations();
  const sql = getDb();
  const canonicalScope = input.canonicalScope ?? META_PRODUCT_CORE_COVERAGE_SCOPES[0];
  const rows = await sql`
    UPDATE meta_sync_partitions
    SET
      status = 'cancelled',
      lease_owner = NULL,
      lease_expires_at = NULL,
      next_retry_at = NULL,
      last_error = COALESCE(
        last_error,
        'Obsolete duplicate core-day partition scope cancelled after product-core migration.'
      ),
      finished_at = COALESCE(finished_at, now()),
      updated_at = now()
    WHERE business_id = ${input.businessId}
      AND lane IN ('core', 'maintenance')
      AND scope <> ${canonicalScope}
      AND status IN ('queued', 'failed', 'dead_letter')
    RETURNING id
  ` as Array<{ id: string }>;

  return rows.map((row) => row.id);
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
        CASE source
          WHEN 'priority_window' THEN 700
          WHEN 'yesterday' THEN 675
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
        END DESC,
        CASE
          WHEN source = 'priority_window'
            THEN NULL
          WHEN source IN ('historical', 'historical_recovery', 'initial_connect')
            THEN partition_date
          ELSE NULL
        END ASC,
        CASE
          WHEN source = 'priority_window'
            THEN partition_date
          WHEN source IN ('historical', 'historical_recovery', 'initial_connect')
            THEN NULL
          ELSE partition_date
        END DESC,
        updated_at ASC
      LIMIT ${Math.max(1, input.limit)}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE meta_sync_partitions partition
    SET
      status = 'leased',
      lease_epoch = partition.lease_epoch + 1,
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
      partition.lease_epoch,
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
    leaseEpoch: toNumber(row.lease_epoch),
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
  leaseEpoch: number;
  leaseMinutes?: number;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    UPDATE meta_sync_partitions
    SET
      status = 'running',
      lease_owner = ${input.workerId},
      started_at = COALESCE(started_at, now()),
      lease_expires_at = now() + (${input.leaseMinutes ?? 15} || ' minutes')::interval,
      attempt_count = attempt_count + 1,
      updated_at = now()
    WHERE id = ${input.partitionId}
      AND lease_owner = ${input.workerId}
      AND lease_epoch = ${input.leaseEpoch}
      AND COALESCE(lease_expires_at, now()) > now()
    RETURNING id
  ` as Array<{ id: string }>;
  return rows.length > 0;
}

function parseMetaClosedCheckpointGroups(raw: unknown): MetaClosedCheckpointGroup[] {
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const record = entry as Record<string, unknown>;
        return {
          checkpointScope: String(record.checkpointScope ?? record.checkpoint_scope ?? ""),
          previousPhase: String(record.previousPhase ?? record.previous_phase ?? ""),
          count: toNumber(record.count ?? record.row_count),
        } satisfies MetaClosedCheckpointGroup;
      })
      .filter((entry): entry is MetaClosedCheckpointGroup => Boolean(entry?.checkpointScope));
  }
  if (typeof raw === "string") {
    try {
      return parseMetaClosedCheckpointGroups(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

function parseNullableBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return null;
}

function parseStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === "string" ? entry : String(entry ?? "").trim()))
      .filter((entry) => entry.length > 0);
  }
  if (typeof value === "string") {
    try {
      return parseStringArray(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

export async function getMetaPartitionCompletionDenialSnapshot(input: {
  partitionId: string;
  workerId: string;
  leaseEpoch: number;
}) {
  const sql = getDb();
  try {
    const [row] = (await sql`
      WITH input_values AS (
        SELECT
          ${input.partitionId}::uuid AS partition_id,
          ${input.workerId}::text AS worker_id,
          ${input.leaseEpoch}::bigint AS lease_epoch
      ),
      current_partition AS (
        SELECT
          partition.status::text AS current_partition_status,
          partition.lease_owner::text AS current_lease_owner,
          partition.lease_epoch AS current_lease_epoch,
          partition.lease_expires_at AS current_lease_expires_at,
          (partition.lease_owner = input_values.worker_id) AS owner_matches_caller,
          (partition.lease_epoch = input_values.lease_epoch) AS epoch_matches_caller,
          (COALESCE(partition.lease_expires_at, now() - interval '1 second') <= now())
            AS lease_expired_at_observation,
          partition.finished_at AS current_partition_finished_at
        FROM meta_sync_partitions partition
        CROSS JOIN input_values
        WHERE partition.id = input_values.partition_id
      ),
      latest_checkpoint AS (
        SELECT
          checkpoint.checkpoint_scope::text AS latest_checkpoint_scope,
          checkpoint.phase::text AS latest_checkpoint_phase,
          checkpoint.updated_at AS latest_checkpoint_updated_at
        FROM meta_sync_checkpoints checkpoint
        CROSS JOIN input_values
        WHERE checkpoint.partition_id = input_values.partition_id
        ORDER BY checkpoint.updated_at DESC
        LIMIT 1
      ),
      latest_running_run AS (
        SELECT run.id::text AS latest_running_run_id
        FROM meta_sync_runs run
        CROSS JOIN input_values
        WHERE run.partition_id = input_values.partition_id
          AND run.status = 'running'
        ORDER BY run.created_at DESC
        LIMIT 1
      ),
      running_run_count AS (
        SELECT COUNT(*)::int AS running_run_count
        FROM meta_sync_runs run
        CROSS JOIN input_values
        WHERE run.partition_id = input_values.partition_id
          AND run.status = 'running'
      )
      SELECT
        current_partition.current_partition_status,
        current_partition.current_lease_owner,
        current_partition.current_lease_epoch,
        current_partition.current_lease_expires_at,
        current_partition.owner_matches_caller,
        current_partition.epoch_matches_caller,
        current_partition.lease_expired_at_observation,
        current_partition.current_partition_finished_at,
        latest_checkpoint.latest_checkpoint_scope,
        latest_checkpoint.latest_checkpoint_phase,
        latest_checkpoint.latest_checkpoint_updated_at,
        latest_running_run.latest_running_run_id,
        running_run_count.running_run_count,
        CASE
          WHEN current_partition.current_partition_status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
            THEN 'already_terminal'
          WHEN current_partition.owner_matches_caller IS FALSE
            THEN 'owner_mismatch'
          WHEN current_partition.epoch_matches_caller IS FALSE
            THEN 'epoch_mismatch'
          WHEN current_partition.lease_expired_at_observation IS TRUE
            THEN 'lease_expired'
          ELSE 'unknown_denial'
        END AS denial_classification
      FROM current_partition
      LEFT JOIN latest_checkpoint ON TRUE
      LEFT JOIN latest_running_run ON TRUE
      LEFT JOIN running_run_count ON TRUE
    `) as Array<Record<string, unknown>>;

    if (!row) return null;

    return {
      currentPartitionStatus:
        typeof row.current_partition_status === "string" ? row.current_partition_status : null,
      currentLeaseOwner: typeof row.current_lease_owner === "string" ? row.current_lease_owner : null,
      currentLeaseEpoch:
        typeof row.current_lease_epoch === "number" ? row.current_lease_epoch : toNumber(row.current_lease_epoch),
      currentLeaseExpiresAt: normalizeTimestamp(row.current_lease_expires_at),
      ownerMatchesCaller: parseNullableBoolean(row.owner_matches_caller),
      epochMatchesCaller: parseNullableBoolean(row.epoch_matches_caller),
      leaseExpiredAtObservation: parseNullableBoolean(row.lease_expired_at_observation),
      currentPartitionFinishedAt: normalizeTimestamp(row.current_partition_finished_at),
      latestCheckpointScope:
        typeof row.latest_checkpoint_scope === "string" ? row.latest_checkpoint_scope : null,
      latestCheckpointPhase:
        typeof row.latest_checkpoint_phase === "string" ? row.latest_checkpoint_phase : null,
      latestCheckpointUpdatedAt: normalizeTimestamp(row.latest_checkpoint_updated_at),
      latestRunningRunId: typeof row.latest_running_run_id === "string" ? row.latest_running_run_id : null,
      runningRunCount: toNumber(row.running_run_count),
      denialClassification:
        typeof row.denial_classification === "string"
          ? (row.denial_classification as MetaCompletionDenialClassification)
          : "unknown_denial",
    } satisfies MetaPartitionCompletionDenialSnapshot;
  } catch (error) {
    console.warn("[meta-sync] partition_completion_denial_observability_failed", {
      partitionId: input.partitionId,
      workerId: input.workerId,
      leaseEpoch: input.leaseEpoch,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function writeMetaPartitionCompletionObservability(input: {
  partitionId: string;
  runId?: string | null;
  recoveredRunId?: string | null;
  workerId: string;
  leaseEpoch: number;
  lane?: MetaSyncLane | null;
  scope?: MetaWarehouseScope | null;
  partitionStatus: Extract<MetaPartitionStatus, "succeeded" | "failed" | "dead_letter" | "cancelled">;
  runStatus: MetaSyncRunRecord["status"];
  observabilityPath?: MetaRunObservabilityPath | null;
}) {
  const sql = getDb();
  try {
    const [latestRow] = (await sql`
      SELECT id::text AS latest_running_run_id
      FROM meta_sync_runs
      WHERE partition_id = ${input.partitionId}::uuid
        AND status = 'running'
      ORDER BY created_at DESC
      LIMIT 1
    `) as Array<{ latest_running_run_id?: string | null }>;

    const observedLatestRunningRunId =
      typeof latestRow?.latest_running_run_id === "string" ? latestRow.latest_running_run_id : null;
    const callerRunIdMatchedLatestRunningRunId =
      input.runId && observedLatestRunningRunId ? input.runId === observedLatestRunningRunId : null;

    if (!observedLatestRunningRunId) {
      return {
        observedLatestRunningRunId: null,
        callerRunIdMatchedLatestRunningRunId,
      };
    }

    await sql`
      UPDATE meta_sync_runs run
      SET
        meta_json = COALESCE(run.meta_json, '{}'::jsonb) || jsonb_build_object(
          'runLeakObservability',
          jsonb_strip_nulls(
            jsonb_build_object(
              'callerRunId', ${input.runId ?? null}::text,
              'recoveredRunId', ${input.recoveredRunId ?? null}::text,
              'latestRunningRunId', ${observedLatestRunningRunId}::text,
              'callerRunIdMatchedLatestRunningRunId', ${callerRunIdMatchedLatestRunningRunId}::boolean,
              'pathKind', ${input.observabilityPath ?? null}::text,
              'workerId', ${input.workerId}::text,
              'leaseEpoch', ${input.leaseEpoch}::bigint,
              'lane', ${input.lane ?? null}::text,
              'scope', ${input.scope ?? null}::text,
              'partitionStatus', ${input.partitionStatus}::text,
              'runStatusBefore', 'running',
              'runStatusAfter', ${input.runStatus}::text,
              'observedAt', now()
            )
          )
        )
      WHERE run.id = ${observedLatestRunningRunId}::uuid
    `;

    return {
      observedLatestRunningRunId,
      callerRunIdMatchedLatestRunningRunId,
    };
  } catch (error) {
    console.warn("[meta-sync] partition_completion_observability_failed", {
      partitionId: input.partitionId,
      runId: input.runId ?? null,
      recoveredRunId: input.recoveredRunId ?? null,
      workerId: input.workerId,
      leaseEpoch: input.leaseEpoch,
      lane: input.lane ?? null,
      scope: input.scope ?? null,
      partitionStatus: input.partitionStatus,
      runStatusBefore: "running",
      runStatusAfter: input.runStatus,
      pathKind: input.observabilityPath ?? null,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      observedLatestRunningRunId: null,
      callerRunIdMatchedLatestRunningRunId: null,
    };
  }
}

export async function backfillMetaRunningRunsForTerminalPartition(input: {
  partitionId: string;
  runId?: string | null;
  recoveredRunId?: string | null;
}) {
  const sql = getDb();
  const [row] = (await sql`
    WITH input_values AS (
      SELECT
        ${input.partitionId}::uuid AS partition_id,
        ${input.runId ?? input.recoveredRunId ?? null}::uuid AS effective_run_id
    ),
    terminal_partition AS (
      SELECT
        partition.status::text AS partition_status,
        partition.last_error::text AS partition_last_error,
        partition.finished_at AS partition_finished_at
      FROM meta_sync_partitions partition
      CROSS JOIN input_values
      WHERE partition.id = input_values.partition_id
        AND partition.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
    ),
    updated_runs AS (
      UPDATE meta_sync_runs run
      SET
        status = CASE
          WHEN terminal_partition.partition_status = 'succeeded' THEN 'succeeded'
          WHEN terminal_partition.partition_status = 'cancelled' THEN 'cancelled'
          ELSE 'failed'
        END,
        error_class = CASE
          WHEN terminal_partition.partition_status IN ('succeeded', 'cancelled') THEN NULL
          WHEN terminal_partition.partition_status = 'dead_letter'
            THEN COALESCE(run.error_class, 'dead_letter')
          ELSE COALESCE(run.error_class, 'failed')
        END,
        error_message = CASE
          WHEN terminal_partition.partition_status IN ('succeeded', 'cancelled') THEN NULL
          WHEN terminal_partition.partition_status = 'dead_letter'
            THEN COALESCE(
              terminal_partition.partition_last_error,
              run.error_message,
              'partition already dead_letter'
            )
          ELSE COALESCE(
            terminal_partition.partition_last_error,
            run.error_message,
            'partition already failed'
          )
        END,
        finished_at = COALESCE(run.finished_at, terminal_partition.partition_finished_at, now()),
        duration_ms = COALESCE(
          run.duration_ms,
          GREATEST(
            0,
            FLOOR(
              EXTRACT(
                EPOCH FROM (
                  COALESCE(terminal_partition.partition_finished_at, now()) -
                  COALESCE(run.started_at, run.created_at)
                )
              ) * 1000
            )::int
          )
        ),
        meta_json = COALESCE(run.meta_json, '{}'::jsonb) || jsonb_build_object(
          'decisionCaller', 'backfillMetaRunningRunsForTerminalPartition',
          'closureReason', CASE
            WHEN terminal_partition.partition_status = 'succeeded' THEN 'partition_already_succeeded'
            WHEN terminal_partition.partition_status = 'failed' THEN 'partition_already_failed'
            WHEN terminal_partition.partition_status = 'dead_letter' THEN 'partition_already_dead_letter'
            ELSE 'partition_already_cancelled'
          END
        ),
        updated_at = now()
      FROM terminal_partition
      CROSS JOIN input_values
      WHERE run.partition_id = input_values.partition_id
        AND run.status = 'running'
      RETURNING
        run.id AS run_id_uuid,
        run.id::text AS run_id,
        terminal_partition.partition_status
    ),
    updated_summary AS (
      SELECT
        COALESCE(MAX(partition_status), (SELECT partition_status FROM terminal_partition LIMIT 1)) AS partition_status,
        COUNT(*)::int AS closed_running_run_count,
        CASE
          WHEN (SELECT effective_run_id FROM input_values) IS NULL THEN NULL
          ELSE BOOL_OR(run_id_uuid = (SELECT effective_run_id FROM input_values))
        END AS caller_run_id_was_closed
      FROM updated_runs
    ),
    capped_run_ids AS (
      SELECT run_id
      FROM updated_runs
      ORDER BY run_id
      LIMIT 10
    )
    SELECT
      (SELECT partition_status FROM updated_summary) AS partition_status,
      COALESCE((SELECT closed_running_run_count FROM updated_summary), 0) AS closed_running_run_count,
      (SELECT caller_run_id_was_closed FROM updated_summary) AS caller_run_id_was_closed,
      COALESCE((SELECT json_agg(run_id ORDER BY run_id) FROM capped_run_ids), '[]'::json) AS closed_running_run_ids
  `) as Array<Record<string, unknown>>;

  return {
    partitionStatus:
      typeof row?.partition_status === "string" ? row.partition_status : null,
    closedRunningRunCount: toNumber(row?.closed_running_run_count),
    callerRunIdWasClosed: parseNullableBoolean(row?.caller_run_id_was_closed),
    closedRunningRunIds: parseStringArray(row?.closed_running_run_ids),
  };
}

export async function completeMetaPartitionAttempt(input: {
  partitionId: string;
  workerId: string;
  leaseEpoch: number;
  partitionStatus: Extract<MetaPartitionStatus, "succeeded" | "failed" | "dead_letter" | "cancelled">;
  runId?: string | null;
  runStatus?: MetaSyncRunRecord["status"];
  durationMs?: number | null;
  errorClass?: string | null;
  errorMessage?: string | null;
  finishedAt?: string | null;
  lastError?: string | null;
  retryDelayMinutes?: number;
  lane?: MetaSyncLane | null;
  scope?: MetaWarehouseScope | null;
  observabilityPath?: MetaRunObservabilityPath | null;
  recoveredRunId?: string | null;
}): Promise<MetaPartitionAttemptCompletionResult> {
  await runMigrations();
  const sql = getDb();
  const runStatus =
    input.runStatus ??
    (input.partitionStatus === "succeeded"
      ? "succeeded"
      : input.partitionStatus === "cancelled"
        ? "cancelled"
        : "failed");
  const rows = await sql`
    WITH input_values AS (
      SELECT
        ${input.partitionStatus}::text AS partition_status,
        ${input.retryDelayMinutes ?? 5}::int AS retry_delay_minutes,
        ${input.lastError ?? null}::text AS last_error,
        ${input.finishedAt ?? null}::timestamptz AS finished_at,
        ${input.partitionId}::uuid AS partition_id,
        ${input.workerId}::text AS worker_id,
        ${input.leaseEpoch}::bigint AS lease_epoch,
        ${input.runId ?? null}::uuid AS run_id,
        ${input.runId ?? input.recoveredRunId ?? null}::uuid AS effective_run_id,
        ${runStatus}::text AS run_status,
        ${input.durationMs ?? null}::int AS duration_ms,
        ${input.errorClass ?? null}::text AS error_class,
        ${input.errorMessage ?? null}::text AS error_message
    ),
    completed_partition AS (
      UPDATE meta_sync_partitions partition
      SET
        status = input_values.partition_status,
        lease_owner = NULL,
        lease_expires_at = NULL,
        next_retry_at = CASE
          WHEN input_values.partition_status = 'failed'
            THEN now() + (input_values.retry_delay_minutes || ' minutes')::interval
          ELSE NULL
        END,
        last_error = input_values.last_error,
        finished_at = CASE
          WHEN input_values.partition_status IN ('succeeded', 'dead_letter', 'cancelled')
            THEN COALESCE(input_values.finished_at, now())
          ELSE partition.finished_at
        END,
        updated_at = now()
      FROM input_values
      WHERE partition.id = input_values.partition_id
        AND partition.lease_owner = input_values.worker_id
        AND partition.lease_epoch = input_values.lease_epoch
        AND COALESCE(partition.lease_expires_at, now()) > now()
      RETURNING partition.id
    ),
    candidate_checkpoints AS (
      SELECT
        checkpoint.id,
        checkpoint.checkpoint_scope,
        checkpoint.phase AS previous_phase
      FROM meta_sync_checkpoints checkpoint
      JOIN completed_partition partition
        ON partition.id = checkpoint.partition_id
      CROSS JOIN input_values
      WHERE input_values.partition_status = 'succeeded'
        AND COALESCE(checkpoint.lease_epoch, 0) = input_values.lease_epoch
        AND checkpoint.status = 'running'
    ),
    closed_checkpoints AS (
      UPDATE meta_sync_checkpoints checkpoint
      SET
        status = 'succeeded',
        phase = 'finalize',
        next_page_url = NULL,
        provider_cursor = NULL,
        finished_at = COALESCE(checkpoint.finished_at, now()),
        updated_at = now()
      FROM candidate_checkpoints candidate
      WHERE checkpoint.id = candidate.id
      RETURNING
        candidate.checkpoint_scope,
        candidate.previous_phase
    ),
    grouped_closed_checkpoints AS (
      SELECT
        checkpoint_scope,
        previous_phase,
        COUNT(*)::int AS row_count
      FROM closed_checkpoints
      GROUP BY checkpoint_scope, previous_phase
    ),
    updated_runs AS (
      UPDATE meta_sync_runs run
      SET
        status = input_values.run_status,
        duration_ms = COALESCE(input_values.duration_ms, run.duration_ms),
        error_class = CASE
          WHEN input_values.run_status IN ('succeeded', 'cancelled') THEN NULL
          ELSE COALESCE(input_values.error_class, run.error_class)
        END,
        error_message = CASE
          WHEN input_values.run_status IN ('succeeded', 'cancelled') THEN NULL
          ELSE COALESCE(input_values.error_message, run.error_message)
        END,
        finished_at = COALESCE(input_values.finished_at, now()),
        updated_at = now()
      FROM completed_partition partition
      CROSS JOIN input_values
      WHERE run.partition_id = partition.id
        AND run.status = 'running'
      RETURNING
        run.id AS run_id_uuid,
        run.id::text AS run_id
    ),
    updated_run_summary AS (
      SELECT
        COUNT(*)::int AS closed_running_run_count,
        CASE
          WHEN (SELECT effective_run_id FROM input_values) IS NULL THEN NULL
          ELSE BOOL_OR(run_id_uuid = (SELECT effective_run_id FROM input_values))
        END AS caller_run_id_was_closed
      FROM updated_runs
    ),
    capped_updated_run_ids AS (
      SELECT run_id
      FROM updated_runs
      ORDER BY run_id
      LIMIT 10
    )
    SELECT
      EXISTS(SELECT 1 FROM completed_partition) AS completed,
      EXISTS(SELECT 1 FROM updated_runs) AS run_updated,
      COALESCE((SELECT closed_running_run_count FROM updated_run_summary), 0) AS closed_running_run_count,
      (SELECT caller_run_id_was_closed FROM updated_run_summary) AS caller_run_id_was_closed,
      COALESCE((SELECT json_agg(run_id ORDER BY run_id) FROM capped_updated_run_ids), '[]'::json)
        AS closed_running_run_ids,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'checkpointScope', checkpoint_scope,
              'previousPhase', previous_phase,
              'count', row_count
            )
            ORDER BY checkpoint_scope, previous_phase
          )
          FROM grouped_closed_checkpoints
        ),
        '[]'::json
      ) AS closed_checkpoint_groups
  ` as Array<Record<string, unknown>>;

  const row = rows[0] ?? {};
  if (!Boolean(row.completed)) {
    return {
      ok: false,
      reason: "lease_conflict",
    };
  }

  const closedCheckpointGroups = parseMetaClosedCheckpointGroups(row.closed_checkpoint_groups);
  const closedRunningRunCount = toNumber(row.closed_running_run_count);
  const callerRunIdWasClosed = parseNullableBoolean(row.caller_run_id_was_closed);
  const closedRunningRunIds = parseStringArray(row.closed_running_run_ids);
  if (input.partitionStatus === "succeeded" && closedCheckpointGroups.length > 0) {
    console.info("[meta-sync] partition_success_closed_open_checkpoints", {
      partitionId: input.partitionId,
      workerId: input.workerId,
      leaseEpoch: input.leaseEpoch,
      closedCheckpointGroups,
    });
  }
  if (closedRunningRunCount > 0) {
    console.info("[meta-sync] partition_completion_closed_running_runs", {
      partitionId: input.partitionId,
      runId: input.runId ?? null,
      recoveredRunId: input.recoveredRunId ?? null,
      workerId: input.workerId,
      leaseEpoch: input.leaseEpoch,
      lane: input.lane ?? null,
      scope: input.scope ?? null,
      partitionStatus: input.partitionStatus,
      runStatusBefore: "running",
      runStatusAfter: runStatus,
      pathKind: input.observabilityPath ?? null,
      closedRunningRunCount,
      callerRunIdWasClosed,
      closedRunningRunIds,
    });
  }
  const {
    observedLatestRunningRunId,
    callerRunIdMatchedLatestRunningRunId,
  } = await writeMetaPartitionCompletionObservability({
    partitionId: input.partitionId,
    runId: input.runId ?? null,
    recoveredRunId: input.recoveredRunId ?? null,
    workerId: input.workerId,
    leaseEpoch: input.leaseEpoch,
    lane: input.lane ?? null,
    scope: input.scope ?? null,
    partitionStatus: input.partitionStatus,
    runStatus,
    observabilityPath: input.observabilityPath ?? null,
  });
  if (!Boolean(row.run_updated)) {
    console.warn("[meta-sync] partition_completion_run_update_zero_rows", {
      partitionId: input.partitionId,
      runId: input.runId ?? null,
      recoveredRunId: input.recoveredRunId ?? null,
      workerId: input.workerId,
      leaseEpoch: input.leaseEpoch,
      lane: input.lane ?? null,
      scope: input.scope ?? null,
      partitionStatus: input.partitionStatus,
      runStatusBefore: "running",
      runStatusAfter: runStatus,
      pathKind: input.observabilityPath ?? null,
      closedRunningRunCount,
      callerRunIdWasClosed,
      closedRunningRunIds,
      observedLatestRunningRunId,
      callerRunIdMatchedLatestRunningRunId,
    });
  }

  return {
    ok: true,
    runUpdated: Boolean(row.run_updated),
    closedRunningRunCount,
    callerRunIdWasClosed,
    closedRunningRunIds,
    closedCheckpointGroups,
    observedLatestRunningRunId,
    callerRunIdMatchedLatestRunningRunId,
  };
}

export async function completeMetaPartition(input: {
  partitionId: string;
  workerId: string;
  leaseEpoch: number;
  status: Extract<MetaPartitionStatus, "succeeded" | "failed" | "dead_letter" | "cancelled">;
  lastError?: string | null;
  retryDelayMinutes?: number;
}) {
  const result = await completeMetaPartitionAttempt({
    partitionId: input.partitionId,
    workerId: input.workerId,
    leaseEpoch: input.leaseEpoch,
    partitionStatus: input.status,
    lastError: input.lastError ?? null,
    retryDelayMinutes: input.retryDelayMinutes,
  });
  return result.ok;
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
      partition.lease_owner,
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
          AND lease.lease_owner = partition.lease_owner
          AND lease.lease_expires_at > now()
      ) AS has_matching_runner_lease
    FROM meta_sync_partitions partition
    LEFT JOIN LATERAL (
      SELECT checkpoint_scope, phase, page_index, updated_at
      FROM meta_sync_checkpoints checkpoint
      WHERE checkpoint.partition_id = partition.id
        AND COALESCE(checkpoint.lease_epoch, 0) = COALESCE(partition.lease_epoch, 0)
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
  const preservedByReason: MetaCleanupPreservedByReason = {
    recentCheckpointProgress: 0,
    matchingRunnerLeasePresent: 0,
    leaseNotExpired: 0,
  };
  const stalledDecisions: Array<ProviderReclaimDecision & { partitionId: string }> = [];

  for (const row of candidates) {
    const partitionId = String(row.id);
    const progressMs = parseTimestampMs(row.checkpoint_updated_at ?? row.updated_at);
    const leaseExpiresMs = parseTimestampMs(row.lease_expires_at);
    const hasRecentProgress =
      progressMs != null && now - progressMs <= staleThresholdMs;
    const hasMatchingRunnerLease = Boolean(row.has_matching_runner_lease);
    const leaseNotExpired = leaseExpiresMs != null && leaseExpiresMs > now;

    let decision: ProviderReclaimDecision;
    if (hasRecentProgress) {
      preservedByReason.recentCheckpointProgress += 1;
      decision = {
        disposition: "alive_slow",
        reasonCode: "progress_recently_advanced",
        detail: "Recent checkpoint progress detected; keeping partition leased.",
      };
    } else if (hasMatchingRunnerLease) {
      preservedByReason.matchingRunnerLeasePresent += 1;
      decision = {
        disposition: "alive_slow",
        reasonCode: "active_worker_lease_present",
        detail: "Matching Meta runner lease is still active.",
      };
    } else if (leaseNotExpired) {
      preservedByReason.leaseNotExpired += 1;
      decision = {
        disposition: "alive_slow",
        reasonCode: "lease_not_expired",
        detail: "Partition lease has not expired yet.",
      };
    } else {
      decision = {
        disposition: "stalled_reclaimable",
        reasonCode: "lease_expired_no_progress",
        detail: "Partition lease expired without recent checkpoint progress.",
      };
    }
    tallyDisposition(dispositionCounts, decision.disposition);
    if (decision.disposition === "stalled_reclaimable") {
      stalledDecisions.push({ partitionId, ...decision });
    }
  }

  const stalePartitionIds = stalledDecisions.map((row) => row.partitionId);
  let reconciledRunCount = 0;
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
    const reconciledRuns = await sql`
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
          'closureReason', 'partition_reclaimed',
          'partitionReclaimed', true
        ),
        updated_at = now()
      WHERE run.business_id = ${input.businessId}
        AND run.partition_id = ANY(${stalePartitionIds}::uuid[])
        AND run.status = 'running'
      RETURNING run.id
    ` as Array<Record<string, unknown>>;
    reconciledRunCount = reconciledRuns.length;
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
        partition.status AS partition_status,
        partition.last_error AS partition_last_error,
        partition.finished_at AS partition_finished_at,
        partition.lease_epoch AS partition_lease_epoch,
        checkpoint.phase AS checkpoint_phase,
        checkpoint.updated_at AS progress_updated_at,
        lease.lease_owner AS active_lease_owner,
        lease.updated_at AS lease_updated_at,
        lease.lease_expires_at AS lease_expires_at,
        CASE
          WHEN run.lane = 'core' THEN ${staleRunMinutesCore}
          WHEN run.lane = 'maintenance' THEN ${staleRunMinutesMaintenance}
          ELSE ${staleRunMinutesExtended}
        END AS stale_threshold_minutes,
        (partition.id IS NULL OR partition.status NOT IN ('leased', 'running')) AS partition_state_invalid
      FROM meta_sync_runs run
      LEFT JOIN meta_sync_partitions partition
        ON partition.id = run.partition_id
      LEFT JOIN LATERAL (
        SELECT checkpoint.phase, checkpoint.updated_at
        FROM meta_sync_checkpoints checkpoint
        WHERE checkpoint.partition_id = run.partition_id
          AND (
            partition.id IS NULL
            OR COALESCE(checkpoint.lease_epoch, 0) = COALESCE(partition.lease_epoch, 0)
          )
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
      status = CASE
        WHEN stale_candidates.partition_state_invalid
          AND stale_candidates.partition_status = 'succeeded'
          THEN 'succeeded'
        WHEN stale_candidates.partition_state_invalid
          AND stale_candidates.partition_status = 'cancelled'
          THEN 'cancelled'
        ELSE 'failed'
      END,
      error_class = CASE
        WHEN stale_candidates.partition_state_invalid
          AND stale_candidates.partition_status IN ('succeeded', 'cancelled')
          THEN NULL
        WHEN stale_candidates.partition_state_invalid
          AND stale_candidates.partition_status = 'dead_letter'
          THEN COALESCE(error_class, 'dead_letter')
        WHEN stale_candidates.partition_state_invalid
          AND stale_candidates.partition_status = 'failed'
          THEN COALESCE(error_class, 'failed')
        ELSE COALESCE(error_class, 'stale_run')
      END,
      error_message = CASE
        WHEN stale_candidates.partition_state_invalid
          AND stale_candidates.partition_status IN ('succeeded', 'cancelled')
          THEN NULL
        WHEN stale_candidates.partition_state_invalid
          AND stale_candidates.partition_status = 'dead_letter'
          THEN COALESCE(
            stale_candidates.partition_last_error,
            error_message,
            'partition already dead_letter'
          )
        WHEN stale_candidates.partition_state_invalid
          AND stale_candidates.partition_status = 'failed'
          THEN COALESCE(
            stale_candidates.partition_last_error,
            error_message,
            'partition already failed'
          )
        ELSE COALESCE(error_message, 'stale partition run closed automatically')
      END,
      finished_at = COALESCE(finished_at, stale_candidates.partition_finished_at, now()),
      duration_ms = COALESCE(
        duration_ms,
        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(run.started_at, run.created_at))) * 1000))::int
      ),
      meta_json = COALESCE(run.meta_json, '{}'::jsonb) || jsonb_build_object(
        'decisionCaller', 'cleanupMetaPartitionOrchestration',
        'checkpointPhase', stale_candidates.checkpoint_phase,
        'staleThresholdMs', (stale_candidates.stale_threshold_minutes::int * 60000),
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
          WHEN stale_candidates.partition_state_invalid
            AND stale_candidates.partition_status = 'succeeded'
            THEN 'partition_already_succeeded'
          WHEN stale_candidates.partition_state_invalid
            AND stale_candidates.partition_status = 'failed'
            THEN 'partition_already_failed'
          WHEN stale_candidates.partition_state_invalid
            AND stale_candidates.partition_status = 'dead_letter'
            THEN 'partition_already_dead_letter'
          WHEN stale_candidates.partition_state_invalid
            AND stale_candidates.partition_status = 'cancelled'
            THEN 'partition_already_cancelled'
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
          now() - (${runProgressGraceMinutes} || ' minutes')::interval
      )
    RETURNING run.id
  ` as Array<Record<string, unknown>>;

  return {
    candidateCount: candidates.length,
    stalePartitionCount: stalePartitionIds.length,
    aliveSlowCount: dispositionCounts.alive_slow,
    reconciledRunCount,
    staleRunCount: staleRunRows.length,
    staleLegacyCount: staleLegacyRows.length,
    reclaimReasons: {
      stalledReclaimable: stalledDecisions.map((row) => row.reasonCode),
    },
    preservedByReason,
  } satisfies MetaCleanupSummary;
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
    ON CONFLICT (partition_id)
      WHERE status = 'running'
    DO UPDATE SET
      business_id = EXCLUDED.business_id,
      provider_account_id = EXCLUDED.provider_account_id,
      lane = EXCLUDED.lane,
      scope = EXCLUDED.scope,
      partition_date = EXCLUDED.partition_date,
      worker_id = EXCLUDED.worker_id,
      attempt_count = GREATEST(meta_sync_runs.attempt_count, EXCLUDED.attempt_count),
      meta_json = EXCLUDED.meta_json,
      updated_at = now()
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

export async function getLatestRunningMetaSyncRunIdForPartition(input: {
  partitionId: string;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT id
    FROM meta_sync_runs
    WHERE partition_id = ${input.partitionId}
      AND status = 'running'
    ORDER BY created_at DESC
    LIMIT 1
  ` as Array<{ id: string }>;
  return rows[0]?.id ?? null;
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
  const normalizedLeaseEpoch =
    input.leaseEpoch == null ? null : Math.max(0, Math.trunc(input.leaseEpoch));
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
    WITH owner_guard AS (
      SELECT id
      FROM meta_sync_partitions
      WHERE id = ${input.partitionId}
        AND (
          ${input.leaseOwner ?? null}::text IS NULL
          OR (
            lease_owner = ${input.leaseOwner ?? null}
            AND ${normalizedLeaseEpoch}::bigint IS NOT NULL
            AND COALESCE(lease_epoch, 0) = ${normalizedLeaseEpoch}::bigint
            AND COALESCE(lease_expires_at, now() - interval '1 second') > now()
          )
        )
    )
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
      lease_epoch,
      lease_owner,
      lease_expires_at,
      started_at,
      finished_at,
      updated_at
    )
    SELECT
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
      ${normalizedLeaseEpoch},
      ${input.leaseOwner ?? null},
      ${input.leaseExpiresAt ?? null},
      ${input.startedAt ?? null},
      ${input.finishedAt ?? null},
      now()
    FROM owner_guard
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
      lease_epoch = EXCLUDED.lease_epoch,
      lease_owner = EXCLUDED.lease_owner,
      lease_expires_at = EXCLUDED.lease_expires_at,
      started_at = COALESCE(meta_sync_checkpoints.started_at, EXCLUDED.started_at, now()),
      finished_at = EXCLUDED.finished_at,
      updated_at = now()
    WHERE EXISTS (SELECT 1 FROM owner_guard)
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
    leaseEpoch:
      row.lease_epoch == null ? null : toNumber(row.lease_epoch),
    leaseOwner: row.lease_owner ? String(row.lease_owner) : null,
    leaseExpiresAt: normalizeTimestamp(row.lease_expires_at),
    startedAt: normalizeTimestamp(row.started_at),
    finishedAt: normalizeTimestamp(row.finished_at),
    createdAt: normalizeTimestamp(row.created_at) ?? undefined,
    updatedAt: normalizeTimestamp(row.updated_at) ?? undefined,
  } satisfies MetaSyncCheckpointRecord;
}

export async function getLatestMetaCheckpointForPartition(input: {
  partitionId: string;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT checkpoint_scope, phase, status, updated_at
    FROM meta_sync_checkpoints
    WHERE partition_id = ${input.partitionId}
    ORDER BY updated_at DESC
    LIMIT 1
  ` as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  return {
    checkpointScope: row.checkpoint_scope ? String(row.checkpoint_scope) : null,
    phase: row.phase ? String(row.phase) : null,
    status: row.status ? String(row.status) : null,
    updatedAt: normalizeTimestamp(row.updated_at),
  };
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
  leaseEpoch: number;
  leaseMinutes?: number;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    UPDATE meta_sync_partitions
    SET
      lease_owner = ${input.workerId},
      lease_expires_at = now() + (${input.leaseMinutes ?? 5} || ' minutes')::interval,
      updated_at = now()
    WHERE id = ${input.partitionId}
      AND lease_owner = ${input.workerId}
      AND lease_epoch = ${input.leaseEpoch}
      AND COALESCE(lease_expires_at, now()) > now()
    RETURNING id
  ` as Array<{ id: string }>;
  return rows.length > 0;
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

export interface MetaQueueCompositionSummary {
  historicalCoreQueued: number;
  maintenanceQueued: number;
  extendedRecentQueued: number;
  extendedHistoricalQueued: number;
}

export interface MetaQueueComposition {
  summary: MetaQueueCompositionSummary;
  statusCounts: Record<string, number>;
  laneSourceStatusCounts: Array<{
    lane: string;
    source: string;
    status: string;
    count: number;
  }>;
}

export async function getMetaQueueComposition(input: { businessId: string }): Promise<MetaQueueComposition> {
  await runMigrations();
  const sql = getDb();
  const [statusRows, breakdownRows] = (await Promise.all([
    sql`
      SELECT status, COUNT(*)::int AS count
      FROM meta_sync_partitions
      WHERE business_id = ${input.businessId}
      GROUP BY status
      ORDER BY status
    `,
    sql`
      SELECT lane, source, status, COUNT(*)::int AS count
      FROM meta_sync_partitions
      WHERE business_id = ${input.businessId}
      GROUP BY lane, source, status
      ORDER BY lane, source, status
    `,
  ])) as [Array<Record<string, unknown>>, Array<Record<string, unknown>>];

  const normalizedBreakdown = breakdownRows.map((row) => ({
    lane: String(row.lane ?? ""),
    source: String(row.source ?? ""),
    status: String(row.status ?? ""),
    count: toNumber(row.count),
  }));

  return {
    summary: {
      historicalCoreQueued: normalizedBreakdown
        .filter(
          (row) =>
            row.lane === "core" &&
            row.status === "queued" &&
            ["historical", "historical_recovery", "initial_connect"].includes(row.source)
        )
        .reduce((sum, row) => sum + row.count, 0),
      maintenanceQueued: normalizedBreakdown
        .filter((row) => row.lane === "maintenance" && row.status === "queued")
        .reduce((sum, row) => sum + row.count, 0),
      extendedRecentQueued: normalizedBreakdown
        .filter(
          (row) =>
            row.lane === "extended" &&
            row.status === "queued" &&
            ["recent", "recent_recovery", "today", "priority_window", "request_runtime", "manual_refresh"].includes(
              row.source
            )
        )
        .reduce((sum, row) => sum + row.count, 0),
      extendedHistoricalQueued: normalizedBreakdown
        .filter(
          (row) =>
            row.lane === "extended" &&
            row.status === "queued" &&
            ["historical", "historical_recovery", "initial_connect"].includes(row.source)
        )
        .reduce((sum, row) => sum + row.count, 0),
    },
    statusCounts: Object.fromEntries(
      statusRows.map((row) => [String(row.status ?? "unknown"), toNumber(row.count)])
    ),
    laneSourceStatusCounts: normalizedBreakdown,
  };
}

export async function getMetaPartitionStatesForDate(input: {
  businessId: string;
  providerAccountId: string;
  lane: MetaSyncLane;
  partitionDate: string;
  scopes: MetaWarehouseScope[];
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT scope, status, source, finished_at
    FROM meta_sync_partitions
    WHERE business_id = ${input.businessId}
      AND provider_account_id = ${input.providerAccountId}
      AND lane = ${input.lane}
      AND partition_date = ${normalizeDate(input.partitionDate)}
      AND scope = ANY(${input.scopes}::text[])
  ` as Array<Record<string, unknown>>;

  return new Map(
    rows.map((row) => [
      String(row.scope ?? ""),
      {
        status: String(row.status ?? ""),
        source: String(row.source ?? ""),
        finishedAt: normalizeTimestamp(row.finished_at),
      },
    ])
  );
}

export async function getMetaIncompleteCoreDates(input: {
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
  limit?: number;
}) {
  return getMetaIncompleteCoverageDates({
    ...input,
    scopes: [...META_PRODUCT_CORE_COVERAGE_SCOPES],
  });
}

export async function getMetaIncompleteCoverageDates(input: {
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
  scopes: MetaWarehouseScope[];
  limit?: number;
}) {
  await runMigrations();
  const sql = getDb();
  const scopes = Array.from(
    new Set(
      input.scopes.filter(
        (scope): scope is MetaWarehouseScope =>
          typeof scope === "string" && Boolean(META_DAILY_COVERAGE_TABLE_BY_SCOPE[scope])
      )
    )
  );
  if (scopes.length === 0) return [];

  const coverageCtes = scopes
    .map((scope) => {
      const tableName = META_DAILY_COVERAGE_TABLE_BY_SCOPE[scope];
      const alias = `${scope}_dates`;
      return `
      ${alias} AS (
        SELECT DISTINCT date::date AS day
        FROM ${tableName}
        WHERE business_id = $3
          AND ($4::text IS NULL OR provider_account_id = $4)
          AND date::date BETWEEN $1::date AND $2::date
      )`;
    })
    .join(",\n");
  const joins = scopes
    .map((scope) => {
      const alias = `${scope}_dates`;
      return `LEFT JOIN ${alias} ON ${alias}.day = target_dates.day`;
    })
    .join("\n      ");
  const missingCoveragePredicate = scopes
    .map((scope) => `${scope}_dates.day IS NULL`)
    .join("\n         OR ");
  const rows = await sql.query(
    `
      WITH target_dates AS (
        SELECT generate_series($1::date, $2::date, interval '1 day')::date AS day
      ),
      ${coverageCtes}
      SELECT target_dates.day::text AS partition_date
      FROM target_dates
      ${joins}
      WHERE ${missingCoveragePredicate}
      ORDER BY target_dates.day ASC
      LIMIT $5
    `,
    [
      normalizeDate(input.startDate),
      normalizeDate(input.endDate),
      input.businessId,
      input.providerAccountId ?? null,
      Math.max(1, input.limit ?? 100),
    ]
  ) as Array<Record<string, unknown>>;

  return rows
    .map((row) => normalizeDate(row.partition_date))
    .filter(Boolean);
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
        CASE source
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
        END DESC,
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

export type MetaRecoveryOutcome = "replayed" | "skipped_active_lease" | "no_matching_partitions";

export interface MetaRecoveryActionResult {
  outcome: MetaRecoveryOutcome;
  partitions: Array<{
    id: string;
    lane: string;
    scope: string;
    partitionDate: string;
  }>;
  matchedCount: number;
  changedCount: number;
  skippedActiveLeaseCount: number;
}

export async function replayMetaDeadLetterPartitions(input: {
  businessId: string;
  scope?: MetaWarehouseScope | null;
  sources?: string[] | null;
}): Promise<MetaRecoveryActionResult> {
  await runMigrations();
  const sql = getDb();
  const matchedRows = await sql`
    SELECT id
    FROM meta_sync_partitions
    WHERE business_id = ${input.businessId}
      AND status = 'dead_letter'
      AND (${input.scope ?? null}::text IS NULL OR scope = ${input.scope ?? null})
      AND (${input.sources ?? null}::text[] IS NULL OR source = ANY(${input.sources ?? null}::text[]))
  ` as Array<{ id: string }>;
  const skippedActiveLeaseRows = await sql`
    SELECT id
    FROM meta_sync_partitions
    WHERE business_id = ${input.businessId}
      AND status = 'dead_letter'
      AND COALESCE(lease_expires_at, now() - interval '1 second') > now()
      AND (${input.scope ?? null}::text IS NULL OR scope = ${input.scope ?? null})
      AND (${input.sources ?? null}::text[] IS NULL OR source = ANY(${input.sources ?? null}::text[]))
  ` as Array<{ id: string }>;
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
      AND COALESCE(lease_expires_at, now() - interval '1 second') <= now()
      AND (${input.scope ?? null}::text IS NULL OR scope = ${input.scope ?? null})
      AND (${input.sources ?? null}::text[] IS NULL OR source = ANY(${input.sources ?? null}::text[]))
    RETURNING id, lane, scope, partition_date
  ` as Array<Record<string, unknown>>;
  const partitions = rows.map((row) => ({
    id: String(row.id),
    lane: String(row.lane),
    scope: String(row.scope),
    partitionDate: normalizeDate(row.partition_date),
  }));
  if (skippedActiveLeaseRows.length > 0) {
    await recordSyncReclaimEvents({
      providerScope: "meta",
      businessId: input.businessId,
      partitionIds: skippedActiveLeaseRows.map((row) => row.id),
      eventType: "skipped_active_lease",
      detail: "Replay skipped because the partition still has an active lease.",
    }).catch(() => null);
  }
  return {
    outcome:
      partitions.length > 0
        ? "replayed"
        : matchedRows.length > 0
          ? "skipped_active_lease"
          : "no_matching_partitions",
    partitions,
    matchedCount: matchedRows.length,
    changedCount: partitions.length,
    skippedActiveLeaseCount: skippedActiveLeaseRows.length,
  };
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
        const offset = index * 36;
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
          row.optimizationGoal,
          row.bidStrategyType,
          row.bidStrategyLabel,
          row.manualBidAmount,
          row.bidValue,
          row.bidValueFormat,
          row.dailyBudget,
          row.lifetimeBudget,
          row.isBudgetMixed,
          row.isConfigMixed,
          row.isOptimizationGoalMixed,
          row.isBidStrategyMixed,
          row.isBidValueMixed,
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
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11},$${offset + 12},$${offset + 13},$${offset + 14},$${offset + 15},$${offset + 16},$${offset + 17},$${offset + 18},$${offset + 19},$${offset + 20},$${offset + 21},$${offset + 22},$${offset + 23},$${offset + 24},$${offset + 25},$${offset + 26},$${offset + 27},$${offset + 28},$${offset + 29},$${offset + 30},$${offset + 31},$${offset + 32},$${offset + 33},$${offset + 34},$${offset + 35},$${offset + 36},now())`;
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
        optimization_goal,
        bid_strategy_type,
        bid_strategy_label,
        manual_bid_amount,
        bid_value,
        bid_value_format,
        daily_budget,
        lifetime_budget,
        is_budget_mixed,
        is_config_mixed,
        is_optimization_goal_mixed,
        is_bid_strategy_mixed,
        is_bid_value_mixed,
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
        objective = COALESCE(EXCLUDED.objective, meta_campaign_daily.objective),
        buying_type = EXCLUDED.buying_type,
        optimization_goal = COALESCE(EXCLUDED.optimization_goal, meta_campaign_daily.optimization_goal),
        bid_strategy_type = COALESCE(EXCLUDED.bid_strategy_type, meta_campaign_daily.bid_strategy_type),
        bid_strategy_label = COALESCE(EXCLUDED.bid_strategy_label, meta_campaign_daily.bid_strategy_label),
        manual_bid_amount = COALESCE(EXCLUDED.manual_bid_amount, meta_campaign_daily.manual_bid_amount),
        bid_value = COALESCE(EXCLUDED.bid_value, meta_campaign_daily.bid_value),
        bid_value_format = COALESCE(EXCLUDED.bid_value_format, meta_campaign_daily.bid_value_format),
        daily_budget = COALESCE(EXCLUDED.daily_budget, meta_campaign_daily.daily_budget),
        lifetime_budget = COALESCE(EXCLUDED.lifetime_budget, meta_campaign_daily.lifetime_budget),
        is_budget_mixed = EXCLUDED.is_budget_mixed OR meta_campaign_daily.is_budget_mixed,
        is_config_mixed = EXCLUDED.is_config_mixed OR meta_campaign_daily.is_config_mixed,
        is_optimization_goal_mixed = EXCLUDED.is_optimization_goal_mixed OR meta_campaign_daily.is_optimization_goal_mixed,
        is_bid_strategy_mixed = EXCLUDED.is_bid_strategy_mixed OR meta_campaign_daily.is_bid_strategy_mixed,
        is_bid_value_mixed = EXCLUDED.is_bid_value_mixed OR meta_campaign_daily.is_bid_value_mixed,
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
        const offset = index * 35;
        values.push(
          row.businessId,
          row.providerAccountId,
          normalizeDate(row.date),
          row.campaignId,
          row.adsetId,
          row.adsetNameCurrent,
          row.adsetNameHistorical,
          row.adsetStatus,
          row.optimizationGoal,
          row.bidStrategyType,
          row.bidStrategyLabel,
          row.manualBidAmount,
          row.bidValue,
          row.bidValueFormat,
          row.dailyBudget,
          row.lifetimeBudget,
          row.isBudgetMixed,
          row.isConfigMixed,
          row.isOptimizationGoalMixed,
          row.isBidStrategyMixed,
          row.isBidValueMixed,
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
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11},$${offset + 12},$${offset + 13},$${offset + 14},$${offset + 15},$${offset + 16},$${offset + 17},$${offset + 18},$${offset + 19},$${offset + 20},$${offset + 21},$${offset + 22},$${offset + 23},$${offset + 24},$${offset + 25},$${offset + 26},$${offset + 27},$${offset + 28},$${offset + 29},$${offset + 30},$${offset + 31},$${offset + 32},$${offset + 33},$${offset + 34},$${offset + 35},now())`;
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
        optimization_goal,
        bid_strategy_type,
        bid_strategy_label,
        manual_bid_amount,
        bid_value,
        bid_value_format,
        daily_budget,
        lifetime_budget,
        is_budget_mixed,
        is_config_mixed,
        is_optimization_goal_mixed,
        is_bid_strategy_mixed,
        is_bid_value_mixed,
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
        optimization_goal = COALESCE(EXCLUDED.optimization_goal, meta_adset_daily.optimization_goal),
        bid_strategy_type = COALESCE(EXCLUDED.bid_strategy_type, meta_adset_daily.bid_strategy_type),
        bid_strategy_label = COALESCE(EXCLUDED.bid_strategy_label, meta_adset_daily.bid_strategy_label),
        manual_bid_amount = COALESCE(EXCLUDED.manual_bid_amount, meta_adset_daily.manual_bid_amount),
        bid_value = COALESCE(EXCLUDED.bid_value, meta_adset_daily.bid_value),
        bid_value_format = COALESCE(EXCLUDED.bid_value_format, meta_adset_daily.bid_value_format),
        daily_budget = COALESCE(EXCLUDED.daily_budget, meta_adset_daily.daily_budget),
        lifetime_budget = COALESCE(EXCLUDED.lifetime_budget, meta_adset_daily.lifetime_budget),
        is_budget_mixed = EXCLUDED.is_budget_mixed OR meta_adset_daily.is_budget_mixed,
        is_config_mixed = EXCLUDED.is_config_mixed OR meta_adset_daily.is_config_mixed,
        is_optimization_goal_mixed = EXCLUDED.is_optimization_goal_mixed OR meta_adset_daily.is_optimization_goal_mixed,
        is_bid_strategy_mixed = EXCLUDED.is_bid_strategy_mixed OR meta_adset_daily.is_bid_strategy_mixed,
        is_bid_value_mixed = EXCLUDED.is_bid_value_mixed OR meta_adset_daily.is_bid_value_mixed,
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
      optimization_goal,
      bid_strategy_type,
      bid_strategy_label,
      manual_bid_amount,
      bid_value,
      bid_value_format,
      daily_budget,
      lifetime_budget,
      is_budget_mixed,
      is_config_mixed,
      is_optimization_goal_mixed,
      is_bid_strategy_mixed,
      is_bid_value_mixed,
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
    optimization_goal: string | null;
    bid_strategy_type: string | null;
    bid_strategy_label: string | null;
    manual_bid_amount: number | null;
    bid_value: number | null;
    bid_value_format: "currency" | "roas" | null;
    daily_budget: number | null;
    lifetime_budget: number | null;
    is_budget_mixed: boolean;
    is_config_mixed: boolean;
    is_optimization_goal_mixed: boolean;
    is_bid_strategy_mixed: boolean;
    is_bid_value_mixed: boolean;
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
    optimizationGoal: row.optimization_goal,
    bidStrategyType: row.bid_strategy_type,
    bidStrategyLabel: row.bid_strategy_label,
    manualBidAmount: row.manual_bid_amount == null ? null : Number(row.manual_bid_amount),
    bidValue: row.bid_value == null ? null : Number(row.bid_value),
    bidValueFormat: row.bid_value_format,
    dailyBudget: row.daily_budget == null ? null : Number(row.daily_budget),
    lifetimeBudget: row.lifetime_budget == null ? null : Number(row.lifetime_budget),
    isBudgetMixed: Boolean(row.is_budget_mixed),
    isConfigMixed: Boolean(row.is_config_mixed),
    isOptimizationGoalMixed: Boolean(row.is_optimization_goal_mixed),
    isBidStrategyMixed: Boolean(row.is_bid_strategy_mixed),
    isBidValueMixed: Boolean(row.is_bid_value_mixed),
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
      optimization_goal,
      bid_strategy_type,
      bid_strategy_label,
      manual_bid_amount,
      bid_value,
      bid_value_format,
      daily_budget,
      lifetime_budget,
      is_budget_mixed,
      is_config_mixed,
      is_optimization_goal_mixed,
      is_bid_strategy_mixed,
      is_bid_value_mixed,
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
    optimization_goal: string | null;
    bid_strategy_type: string | null;
    bid_strategy_label: string | null;
    manual_bid_amount: number | null;
    bid_value: number | null;
    bid_value_format: "currency" | "roas" | null;
    daily_budget: number | null;
    lifetime_budget: number | null;
    is_budget_mixed: boolean;
    is_config_mixed: boolean;
    is_optimization_goal_mixed: boolean;
    is_bid_strategy_mixed: boolean;
    is_bid_value_mixed: boolean;
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
    optimizationGoal: row.optimization_goal,
    bidStrategyType: row.bid_strategy_type,
    bidStrategyLabel: row.bid_strategy_label,
    manualBidAmount: row.manual_bid_amount == null ? null : Number(row.manual_bid_amount),
    bidValue: row.bid_value == null ? null : Number(row.bid_value),
    bidValueFormat: row.bid_value_format,
    dailyBudget: row.daily_budget == null ? null : Number(row.daily_budget),
    lifetimeBudget: row.lifetime_budget == null ? null : Number(row.lifetime_budget),
    isBudgetMixed: Boolean(row.is_budget_mixed),
    isConfigMixed: Boolean(row.is_config_mixed),
    isOptimizationGoalMixed: Boolean(row.is_optimization_goal_mixed),
    isBidStrategyMixed: Boolean(row.is_bid_strategy_mixed),
    isBidValueMixed: Boolean(row.is_bid_value_mixed),
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
