import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import { recordSyncReclaimEvents } from "@/lib/sync/worker-health";
import type {
  ProviderReclaimDecision,
  ProviderReclaimDisposition,
} from "@/lib/sync/provider-orchestration";
import type {
  GoogleAdsPartitionStatus,
  GoogleAdsRawSnapshotRecord,
  GoogleAdsRunnerLeaseRecord,
  GoogleAdsSyncLane,
  GoogleAdsSyncCheckpointRecord,
  GoogleAdsSyncJobRecord,
  GoogleAdsSyncPartitionRecord,
  GoogleAdsSyncRunRecord,
  GoogleAdsSyncStateRecord,
  GoogleAdsWarehouseDailyRow,
  GoogleAdsWarehouseDataState,
  GoogleAdsWarehouseFreshness,
  GoogleAdsWarehouseMetricSet,
  GoogleAdsWarehouseScope,
} from "@/lib/google-ads/warehouse-types";
import { computeCheckpointLagMinutes } from "@/lib/provider-readiness";

const GOOGLE_SCOPE_TABLES: Record<GoogleAdsWarehouseScope, string> = {
  account_daily: "google_ads_account_daily",
  campaign_daily: "google_ads_campaign_daily",
  ad_group_daily: "google_ads_ad_group_daily",
  ad_daily: "google_ads_ad_daily",
  keyword_daily: "google_ads_keyword_daily",
  search_term_daily: "google_ads_search_term_daily",
  asset_group_daily: "google_ads_asset_group_daily",
  asset_daily: "google_ads_asset_daily",
  audience_daily: "google_ads_audience_daily",
  geo_daily: "google_ads_geo_daily",
  device_daily: "google_ads_device_daily",
  product_daily: "google_ads_product_daily",
};

function normalizeDate(value: unknown) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const parsed = new Date(trimmed);
    if (Number.isFinite(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const day = String(parsed.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    return trimmed.slice(0, 10);
  }
  const parsed = new Date(String(value ?? ""));
  if (Number.isFinite(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value ?? "").slice(0, 10);
}

function normalizeTimestamp(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  const parsed = new Date(text);
  if (Number.isFinite(parsed.getTime())) {
    return parsed.toISOString();
  }
  return text;
}

function tableNameForScope(scope: GoogleAdsWarehouseScope) {
  return GOOGLE_SCOPE_TABLES[scope];
}

function buildGoogleAdsScopeLeasePrioritySql() {
  return `
    CASE scope
      WHEN 'search_term_daily' THEN 100
      WHEN 'product_daily' THEN 95
      WHEN 'asset_group_daily' THEN 90
      WHEN 'asset_daily' THEN 85
      WHEN 'geo_daily' THEN 80
      WHEN 'device_daily' THEN 75
      WHEN 'audience_daily' THEN 70
      WHEN 'ad_daily' THEN 40
      WHEN 'ad_group_daily' THEN 35
      WHEN 'keyword_daily' THEN 30
      WHEN 'campaign_daily' THEN 20
      WHEN 'account_daily' THEN 10
      ELSE 0
    END
  `;
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

export function buildGoogleAdsRawSnapshotHash(input: {
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

export function buildGoogleAdsSyncCheckpointHash(input: {
  partitionId: string;
  checkpointScope: string;
  phase: string;
  pageIndex: number;
  nextPageToken?: string | null;
  providerCursor?: string | null;
}) {
  return createHash("sha1")
    .update(
      JSON.stringify({
        partitionId: input.partitionId,
        checkpointScope: input.checkpointScope,
        phase: input.phase,
        pageIndex: input.pageIndex,
        nextPageToken: input.nextPageToken ?? null,
        providerCursor: input.providerCursor ?? null,
      })
    )
    .digest("hex");
}

export function emptyGoogleAdsWarehouseMetrics(): GoogleAdsWarehouseMetricSet {
  return {
    spend: 0,
    revenue: 0,
    conversions: 0,
    impressions: 0,
    clicks: 0,
    ctr: null,
    cpc: null,
    cpa: null,
    roas: 0,
    conversionRate: null,
    interactionRate: null,
  };
}

export function createGoogleAdsWarehouseFreshness(
  input: Partial<GoogleAdsWarehouseFreshness> = {}
): GoogleAdsWarehouseFreshness {
  return {
    dataState: input.dataState ?? "syncing",
    lastSyncedAt: input.lastSyncedAt ?? null,
    liveRefreshedAt: input.liveRefreshedAt ?? null,
    isPartial: input.isPartial ?? false,
    missingWindows: input.missingWindows ?? [],
    warnings: input.warnings ?? [],
  };
}

export function mergeGoogleAdsWarehouseState(
  current: GoogleAdsWarehouseDataState,
  next: GoogleAdsWarehouseDataState
): GoogleAdsWarehouseDataState {
  const priority: Record<GoogleAdsWarehouseDataState, number> = {
    not_connected: 0,
    connected_no_assignment: 1,
    action_required: 2,
    syncing: 3,
    stale: 4,
    partial: 5,
    advisor_not_ready: 6,
    ready: 7,
  };
  return priority[next] > priority[current] ? next : current;
}

export async function createGoogleAdsSyncJob(input: GoogleAdsSyncJobRecord) {
  // Legacy-only: retained for reset/debug visibility. Queue/status truth must not depend on this table.
  await runMigrations();
  const sql = getDb();
  const insertedRows = await sql`
    INSERT INTO google_ads_sync_jobs (
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
    ON CONFLICT (
      business_id,
      provider_account_id,
      sync_type,
      scope,
      start_date,
      end_date,
      trigger_source
    ) WHERE status = 'running'
    DO NOTHING
    RETURNING id
  ` as Array<{ id: string }>;
  if (insertedRows[0]?.id) {
    return {
      id: insertedRows[0].id,
      created: true,
    };
  }

  const existingRows = await sql`
    SELECT id
    FROM google_ads_sync_jobs
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
  return {
    id: existingRows[0]?.id ?? null,
    created: false,
  };
}

export async function updateGoogleAdsSyncJob(input: {
  id: string;
  status: GoogleAdsSyncJobRecord["status"];
  progressPercent?: number;
  lastError?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}) {
  // Legacy-only: retained for reset/debug visibility. Queue/status truth must not depend on this table.
  await runMigrations();
  const sql = getDb();
  await sql`
    UPDATE google_ads_sync_jobs
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

export async function expireStaleGoogleAdsRunnerLeases(input?: {
  businessId?: string;
  lane?: GoogleAdsSyncLane;
}) {
  await runMigrations();
  const sql = getDb();
  await sql`
    DELETE FROM google_ads_runner_leases
    WHERE lease_expires_at <= now()
      AND (${input?.businessId ?? null}::text IS NULL OR business_id = ${input?.businessId ?? null})
      AND (${input?.lane ?? null}::text IS NULL OR lane = ${input?.lane ?? null})
  `;
}

export async function acquireGoogleAdsRunnerLease(input: {
  businessId: string;
  lane: GoogleAdsSyncLane;
  leaseOwner: string;
  leaseMinutes?: number;
}) {
  await runMigrations();
  const sql = getDb();
  await expireStaleGoogleAdsRunnerLeases({
    businessId: input.businessId,
    lane: input.lane,
  }).catch(() => null);
  const rows = await sql`
    INSERT INTO google_ads_runner_leases (
      business_id,
      lane,
      lease_owner,
      lease_expires_at,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.lane},
      ${input.leaseOwner},
      now() + (${input.leaseMinutes ?? 5} || ' minutes')::interval,
      now()
    )
    ON CONFLICT (business_id, lane)
    DO UPDATE SET
      lease_owner = CASE
        WHEN google_ads_runner_leases.lease_expires_at <= now() THEN EXCLUDED.lease_owner
        ELSE google_ads_runner_leases.lease_owner
      END,
      lease_expires_at = CASE
        WHEN google_ads_runner_leases.lease_expires_at <= now()
          THEN EXCLUDED.lease_expires_at
        ELSE google_ads_runner_leases.lease_expires_at
      END,
      updated_at = CASE
        WHEN google_ads_runner_leases.lease_expires_at <= now()
          THEN now()
        ELSE google_ads_runner_leases.updated_at
      END
    RETURNING
      business_id,
      lane,
      lease_owner,
      lease_expires_at,
      created_at,
      updated_at
  ` as Array<Record<string, unknown>>;

  const row = rows[0];
  if (!row) return null;
  if (String(row.lease_owner) !== input.leaseOwner) {
    return null;
  }
  return {
    businessId: String(row.business_id),
    lane: String(row.lane) as GoogleAdsSyncLane,
    leaseOwner: String(row.lease_owner),
    leaseExpiresAt: normalizeTimestamp(row.lease_expires_at) ?? new Date().toISOString(),
    createdAt: normalizeTimestamp(row.created_at) ?? undefined,
    updatedAt: normalizeTimestamp(row.updated_at) ?? undefined,
  } satisfies GoogleAdsRunnerLeaseRecord;
}

export async function releaseGoogleAdsRunnerLease(input: {
  businessId: string;
  lane: GoogleAdsSyncLane;
  leaseOwner?: string | null;
}) {
  await runMigrations();
  const sql = getDb();
  await sql`
    DELETE FROM google_ads_runner_leases
    WHERE business_id = ${input.businessId}
      AND lane = ${input.lane}
      AND (${input.leaseOwner ?? null}::text IS NULL OR lease_owner = ${input.leaseOwner ?? null})
  `;
}

export async function queueGoogleAdsSyncPartition(input: GoogleAdsSyncPartitionRecord) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    INSERT INTO google_ads_sync_partitions (
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
      priority = GREATEST(google_ads_sync_partitions.priority, EXCLUDED.priority),
      source = CASE
        WHEN google_ads_sync_partitions.source = 'selected_range' THEN google_ads_sync_partitions.source
        WHEN EXCLUDED.source = 'selected_range' THEN EXCLUDED.source
        ELSE google_ads_sync_partitions.source
      END,
      status = CASE
        WHEN EXCLUDED.source IN ('selected_range', 'recent', 'today')
          AND google_ads_sync_partitions.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
          THEN 'queued'
        ELSE google_ads_sync_partitions.status
      END,
      lease_owner = CASE
        WHEN EXCLUDED.source IN ('selected_range', 'recent', 'today')
          AND google_ads_sync_partitions.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
          THEN NULL
        ELSE google_ads_sync_partitions.lease_owner
      END,
      lease_expires_at = CASE
        WHEN EXCLUDED.source IN ('selected_range', 'recent', 'today')
          AND google_ads_sync_partitions.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
          THEN NULL
        ELSE google_ads_sync_partitions.lease_expires_at
      END,
      last_error = CASE
        WHEN EXCLUDED.source IN ('selected_range', 'recent', 'today')
          AND google_ads_sync_partitions.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
          THEN NULL
        ELSE google_ads_sync_partitions.last_error
      END,
      next_retry_at = CASE
        WHEN EXCLUDED.source IN ('selected_range', 'recent', 'today')
          AND google_ads_sync_partitions.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
          THEN now()
        WHEN google_ads_sync_partitions.status IN ('succeeded', 'running', 'leased')
          THEN google_ads_sync_partitions.next_retry_at
        ELSE LEAST(COALESCE(google_ads_sync_partitions.next_retry_at, now()), COALESCE(EXCLUDED.next_retry_at, now()))
      END,
      updated_at = now()
    RETURNING id, status
  ` as Array<{ id: string; status: GoogleAdsPartitionStatus }>;
  return rows[0] ?? null;
}

export async function leaseGoogleAdsSyncPartitions(input: {
  businessId: string;
  lane?: GoogleAdsSyncLane;
  workerId: string;
  limit: number;
  leaseMinutes?: number;
}) {
  await runMigrations();
  const sql = getDb();
  const scopePrioritySql = buildGoogleAdsScopeLeasePrioritySql();
  const rows = await sql.query(
    `
      WITH candidates AS (
        SELECT id
        FROM google_ads_sync_partitions
        WHERE business_id = $1
          AND ($2::text IS NULL OR lane = $2)
          AND (
            status = 'queued'
            OR (status = 'failed' AND COALESCE(next_retry_at, now()) <= now())
            OR (status = 'leased' AND COALESCE(lease_expires_at, now()) <= now())
          )
        ORDER BY priority DESC, ${scopePrioritySql} DESC, partition_date DESC, updated_at ASC
        LIMIT $3
        FOR UPDATE SKIP LOCKED
      )
      UPDATE google_ads_sync_partitions partition
      SET
        status = 'leased',
        lease_owner = $4,
        lease_expires_at = now() + ($5 || ' minutes')::interval,
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
    `,
    [
      input.businessId,
      input.lane ?? null,
      Math.max(1, input.limit),
      input.workerId,
      String(input.leaseMinutes ?? 5),
    ]
  ) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: String(row.id),
    businessId: String(row.business_id),
    providerAccountId: String(row.provider_account_id),
    lane: String(row.lane) as GoogleAdsSyncLane,
    scope: String(row.scope) as GoogleAdsWarehouseScope,
    partitionDate: normalizeDate(row.partition_date),
    status: String(row.status) as GoogleAdsPartitionStatus,
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
  })) as GoogleAdsSyncPartitionRecord[];
}

export async function markGoogleAdsPartitionRunning(input: {
  partitionId: string;
  workerId: string;
}) {
  await runMigrations();
  const sql = getDb();
  await sql`
    UPDATE google_ads_sync_partitions
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

export async function completeGoogleAdsPartition(input: {
  partitionId: string;
  status: Extract<GoogleAdsPartitionStatus, "succeeded" | "failed" | "dead_letter" | "cancelled">;
  lastError?: string | null;
  retryDelayMinutes?: number;
}) {
  await runMigrations();
  const sql = getDb();
  await sql`
    UPDATE google_ads_sync_partitions
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

export async function heartbeatGoogleAdsPartitionLease(input: {
  partitionId: string;
  workerId: string;
  leaseMinutes?: number;
}) {
  await runMigrations();
  const sql = getDb();
  await sql`
    UPDATE google_ads_sync_partitions
    SET
      lease_owner = ${input.workerId},
      lease_expires_at = now() + (${input.leaseMinutes ?? 5} || ' minutes')::interval,
      updated_at = now()
    WHERE id = ${input.partitionId}
  `;
}

export async function cleanupGoogleAdsPartitionOrchestration(input: {
  businessId: string;
  staleLeaseMinutes?: number;
  staleRunMinutes?: number;
  staleLegacyMinutes?: number;
}) {
  await runMigrations();
  const sql = getDb();
  const staleThresholdMs = Math.max(1, input.staleLeaseMinutes ?? 8) * 60_000;
  const candidates = await sql`
    SELECT
      partition.id,
      partition.scope,
      partition.lane,
      partition.status,
      partition.attempt_count,
      partition.updated_at,
      partition.started_at,
      partition.lease_expires_at,
      checkpoint.checkpoint_scope,
      checkpoint.phase,
      checkpoint.page_index,
      checkpoint.attempt_count AS checkpoint_attempt_count,
      checkpoint.status AS checkpoint_status,
      COALESCE(checkpoint.progress_heartbeat_at, checkpoint.updated_at) AS progress_updated_at,
      checkpoint.poisoned_at,
      checkpoint.poison_reason,
      COALESCE(failures.same_phase_failures, 0) AS same_phase_failures,
      EXISTS (
        SELECT 1
        FROM google_ads_runner_leases lease
        WHERE lease.business_id = partition.business_id
          AND lease.lane = partition.lane
          AND lease.lease_expires_at > now()
      ) AS has_active_runner_lease
    FROM google_ads_sync_partitions partition
    LEFT JOIN LATERAL (
      SELECT *
      FROM google_ads_sync_checkpoints checkpoint
      WHERE checkpoint.partition_id = partition.id
      ORDER BY checkpoint.updated_at DESC
      LIMIT 1
    ) checkpoint ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS same_phase_failures
      FROM google_ads_sync_checkpoints failed
      WHERE failed.partition_id = partition.id
        AND failed.phase = checkpoint.phase
        AND failed.status = 'failed'
    ) failures ON TRUE
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
  const poisonDecisions: Array<
    ProviderReclaimDecision & { partitionId: string; checkpointScope: string | null }
  > = [];

  for (const row of candidates) {
    const partitionId = String(row.id);
    const progressMs = parseTimestampMs(row.progress_updated_at ?? row.updated_at);
    const leaseMs = parseTimestampMs(
      row.lease_expires_at ?? row.started_at ?? row.updated_at
    );
    const updatedMs = parseTimestampMs(row.updated_at);
    const hasRecentProgress =
      progressMs != null && now - progressMs <= staleThresholdMs;
    const hasActiveRunnerLease = Boolean(row.has_active_runner_lease);
    const samePhaseFailures = toNumber(row.same_phase_failures);
    const checkpointAttempts = toNumber(row.checkpoint_attempt_count);
    const checkpointScope =
      row.checkpoint_scope != null ? String(row.checkpoint_scope) : null;

    let decision: ProviderReclaimDecision;
    if (row.poisoned_at) {
      decision = {
        disposition: "poison_candidate",
        reasonCode: "poison_checkpoint_detected",
        detail: row.poison_reason
          ? String(row.poison_reason)
          : "Checkpoint already marked as poison candidate.",
      };
    } else if (samePhaseFailures >= 3 || checkpointAttempts >= 3) {
      decision = {
        disposition: "poison_candidate",
        reasonCode: "same_phase_reentry_limit",
        detail: `Checkpoint phase ${String(row.phase ?? "unknown")} repeatedly failed.`,
      };
    } else if (hasRecentProgress) {
      decision = {
        disposition: "alive_slow",
        reasonCode: "progress_recently_advanced",
        detail: "Recent checkpoint progress detected; keeping partition leased.",
      };
    } else if (hasActiveRunnerLease) {
      decision = {
        disposition: "alive_slow",
        reasonCode: "active_worker_lease_present",
        detail: "Runner lease is still active for this lane.",
      };
    } else if (
      leaseMs != null &&
      now - leaseMs > 0 &&
      updatedMs != null &&
      now - updatedMs > 60_000
    ) {
      decision = {
        disposition: "stalled_reclaimable",
        reasonCode: "worker_offline_no_progress",
        detail: "Lease expired and no recent runner/progress heartbeat remained.",
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
    if (decision.disposition === "poison_candidate") {
      poisonDecisions.push({ partitionId, checkpointScope, ...decision });
    }
  }

  const stalePartitionIds = stalledDecisions.map((row) => row.partitionId);
  if (stalePartitionIds.length > 0) {
    await sql`
      UPDATE google_ads_sync_partitions
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
        providerScope: "google_ads",
        businessId: input.businessId,
        partitionIds: [decision.partitionId],
        eventType: "reclaimed",
        disposition: decision.disposition,
        reasonCode: decision.reasonCode,
        detail: decision.detail,
      }).catch(() => null);
    }
  }

  const poisonPartitionIds = poisonDecisions.map((row) => row.partitionId);
  if (poisonPartitionIds.length > 0) {
    await sql`
      UPDATE google_ads_sync_partitions
      SET
        status = 'dead_letter',
        lease_owner = NULL,
        lease_expires_at = NULL,
        next_retry_at = NULL,
        last_error = COALESCE(last_error, 'poison checkpoint quarantined for manual recovery'),
        updated_at = now()
      WHERE id = ANY(${poisonPartitionIds}::uuid[])
    `;
    for (const decision of poisonDecisions) {
      await recordSyncReclaimEvents({
        providerScope: "google_ads",
        businessId: input.businessId,
        partitionIds: [decision.partitionId],
        checkpointScope: decision.checkpointScope,
        eventType: "poisoned",
        disposition: decision.disposition,
        reasonCode: decision.reasonCode,
        detail: decision.detail,
      }).catch(() => null);
    }
  }

  const duplicateLegacyIds = await sql`
    SELECT id
    FROM (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY business_id, provider_account_id, sync_type, scope, start_date, end_date, trigger_source
          ORDER BY updated_at DESC, triggered_at DESC, id DESC
        ) AS row_number
      FROM google_ads_sync_jobs
      WHERE business_id = ${input.businessId}
        AND status = 'running'
    ) ranked
    WHERE ranked.row_number > 1
    LIMIT 200
  ` as Array<Record<string, unknown>>;
  let duplicateLegacyCount = 0;
  if (duplicateLegacyIds.length > 0) {
    const rows = await sql`
      UPDATE google_ads_sync_jobs
      SET
        status = 'cancelled',
        last_error = COALESCE(last_error, 'legacy google ads sync job superseded by partition queue'),
        finished_at = now(),
        updated_at = now()
      WHERE id = ANY(${duplicateLegacyIds.map((row) => String(row.id))}::uuid[])
      RETURNING id
    ` as Array<Record<string, unknown>>;
    duplicateLegacyCount = rows.length;
  }

  const staleLegacyRows = await sql`
    UPDATE google_ads_sync_jobs
    SET
      status = 'failed',
      last_error = COALESCE(last_error, 'legacy google ads sync job expired automatically'),
      finished_at = now(),
      updated_at = now()
    WHERE business_id = ${input.businessId}
      AND status = 'running'
      AND started_at < now() - (${input.staleLegacyMinutes ?? 15} || ' minutes')::interval
    RETURNING id
  ` as Array<Record<string, unknown>>;

  const staleRunRows = await sql`
    UPDATE google_ads_sync_runs run
    SET
      status = 'failed',
      error_class = COALESCE(error_class, 'stale_run'),
      error_message = COALESCE(error_message, 'stale partition run closed automatically'),
      finished_at = COALESCE(finished_at, now()),
      duration_ms = COALESCE(
        duration_ms,
        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(started_at, created_at))) * 1000))::int
      ),
      updated_at = now()
    WHERE run.business_id = ${input.businessId}
      AND run.status = 'running'
      AND (
        COALESCE(run.started_at, run.created_at) < now() - (${input.staleRunMinutes ?? 12} || ' minutes')::interval
        OR EXISTS (
          SELECT 1
          FROM google_ads_sync_partitions partition
          WHERE partition.id = run.partition_id
            AND partition.status NOT IN ('leased', 'running')
        )
      )
    RETURNING run.id
  ` as Array<Record<string, unknown>>;

  return {
    stalePartitionCount: stalePartitionIds.length,
    aliveSlowCount: dispositionCounts.alive_slow,
    poisonCandidateCount: poisonPartitionIds.length,
    duplicatePartitionCount: 0,
    staleRunCount: staleRunRows.length,
    duplicateLegacyCount,
    staleLegacyCount: staleLegacyRows.length,
    reclaimReasons: {
      stalledReclaimable: stalledDecisions.map((row) => row.reasonCode),
      poisonCandidate: poisonDecisions.map((row) => row.reasonCode),
    },
  };
}

export async function getGoogleAdsPartitionDates(input: {
  businessId: string;
  providerAccountId?: string | null;
  lane?: GoogleAdsSyncLane | null;
  scope: GoogleAdsWarehouseScope;
  startDate: string;
  endDate: string;
  statuses?: GoogleAdsPartitionStatus[];
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT DISTINCT partition_date
    FROM google_ads_sync_partitions
    WHERE business_id = ${input.businessId}
      AND scope = ${input.scope}
      AND partition_date >= ${normalizeDate(input.startDate)}
      AND partition_date <= ${normalizeDate(input.endDate)}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND (${input.lane ?? null}::text IS NULL OR lane = ${input.lane ?? null})
      AND (
        COALESCE(array_length(${input.statuses ?? []}::text[], 1), 0) = 0
        OR status = ANY(${input.statuses ?? []}::text[])
      )
    ORDER BY partition_date DESC
  ` as Array<Record<string, unknown>>;

  return rows
    .map((row) => (row.partition_date ? normalizeDate(row.partition_date) : null))
    .filter((value): value is string => Boolean(value));
}

export async function createGoogleAdsSyncRun(input: GoogleAdsSyncRunRecord) {
  await runMigrations();
  const sql = getDb();
  await sql`
    UPDATE google_ads_sync_runs
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
    INSERT INTO google_ads_sync_runs (
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

export async function updateGoogleAdsSyncRun(input: {
  id: string;
  status: GoogleAdsSyncRunRecord["status"];
  rowCount?: number | null;
  durationMs?: number | null;
  errorClass?: string | null;
  errorMessage?: string | null;
  metaJson?: Record<string, unknown>;
  finishedAt?: string | null;
}) {
  await runMigrations();
  const sql = getDb();
  await sql`
    UPDATE google_ads_sync_runs
    SET
      status = ${input.status},
      row_count = COALESCE(${input.rowCount ?? null}, row_count),
      duration_ms = COALESCE(${input.durationMs ?? null}, duration_ms),
      error_class = COALESCE(${input.errorClass ?? null}, error_class),
      error_message = COALESCE(${input.errorMessage ?? null}, error_message),
      meta_json = COALESCE(${input.metaJson ? JSON.stringify(input.metaJson) : null}::jsonb, meta_json),
      finished_at = COALESCE(${input.finishedAt ?? null}, finished_at),
      updated_at = now()
    WHERE id = ${input.id}
  `;
}

export async function upsertGoogleAdsSyncState(input: GoogleAdsSyncStateRecord) {
  await runMigrations();
  const sql = getDb();
  await sql`
    INSERT INTO google_ads_sync_state (
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

export async function persistGoogleAdsRawSnapshot(input: GoogleAdsRawSnapshotRecord) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    INSERT INTO google_ads_raw_snapshots (
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

export async function upsertGoogleAdsSyncCheckpoint(input: GoogleAdsSyncCheckpointRecord) {
  await runMigrations();
  const sql = getDb();
  const checkpointHash =
    input.checkpointHash ??
    buildGoogleAdsSyncCheckpointHash({
      partitionId: input.partitionId,
      checkpointScope: input.checkpointScope,
      phase: input.phase,
      pageIndex: input.pageIndex,
      nextPageToken: input.nextPageToken ?? null,
      providerCursor: input.providerCursor ?? null,
    });
  const rows = await sql`
    INSERT INTO google_ads_sync_checkpoints (
      partition_id,
      business_id,
      provider_account_id,
      checkpoint_scope,
      is_paginated,
      phase,
      status,
      page_index,
      next_page_token,
      provider_cursor,
      raw_snapshot_ids,
      rows_fetched,
      rows_written,
      last_successful_entity_key,
      last_response_headers,
      checkpoint_hash,
      attempt_count,
      progress_heartbeat_at,
      retry_after_at,
      lease_owner,
      lease_expires_at,
      poisoned_at,
      poison_reason,
      replay_reason_code,
      replay_detail,
      started_at,
      finished_at,
      updated_at
    )
    VALUES (
      ${input.partitionId},
      ${input.businessId},
      ${input.providerAccountId},
      ${input.checkpointScope},
      ${input.isPaginated ?? false},
      ${input.phase},
      ${input.status},
      ${input.pageIndex},
      ${input.nextPageToken ?? null},
      ${input.providerCursor ?? null},
      ${JSON.stringify(input.rawSnapshotIds ?? [])}::jsonb,
      ${input.rowsFetched ?? 0},
      ${input.rowsWritten ?? 0},
      ${input.lastSuccessfulEntityKey ?? null},
      ${JSON.stringify(input.lastResponseHeaders ?? {})}::jsonb,
      ${checkpointHash},
      ${input.attemptCount},
      COALESCE(${input.progressHeartbeatAt ?? null}, now()),
      ${input.retryAfterAt ?? null},
      ${input.leaseOwner ?? null},
      ${input.leaseExpiresAt ?? null},
      ${input.poisonedAt ?? null},
      ${input.poisonReason ?? null},
      ${input.replayReasonCode ?? null},
      ${input.replayDetail ?? null},
      ${input.startedAt ?? null},
      ${input.finishedAt ?? null},
      now()
    )
    ON CONFLICT (partition_id, checkpoint_scope)
    DO UPDATE SET
      is_paginated = EXCLUDED.is_paginated,
      phase = EXCLUDED.phase,
      status = EXCLUDED.status,
      page_index = EXCLUDED.page_index,
      next_page_token = EXCLUDED.next_page_token,
      provider_cursor = EXCLUDED.provider_cursor,
      raw_snapshot_ids = EXCLUDED.raw_snapshot_ids,
      rows_fetched = EXCLUDED.rows_fetched,
      rows_written = EXCLUDED.rows_written,
      last_successful_entity_key = EXCLUDED.last_successful_entity_key,
      last_response_headers = EXCLUDED.last_response_headers,
      checkpoint_hash = EXCLUDED.checkpoint_hash,
      attempt_count = EXCLUDED.attempt_count,
      progress_heartbeat_at = COALESCE(EXCLUDED.progress_heartbeat_at, now()),
      retry_after_at = EXCLUDED.retry_after_at,
      lease_owner = EXCLUDED.lease_owner,
      lease_expires_at = EXCLUDED.lease_expires_at,
      poisoned_at = COALESCE(EXCLUDED.poisoned_at, google_ads_sync_checkpoints.poisoned_at),
      poison_reason = COALESCE(EXCLUDED.poison_reason, google_ads_sync_checkpoints.poison_reason),
      replay_reason_code = COALESCE(EXCLUDED.replay_reason_code, google_ads_sync_checkpoints.replay_reason_code),
      replay_detail = COALESCE(EXCLUDED.replay_detail, google_ads_sync_checkpoints.replay_detail),
      started_at = COALESCE(google_ads_sync_checkpoints.started_at, EXCLUDED.started_at, now()),
      finished_at = EXCLUDED.finished_at,
      updated_at = now()
    RETURNING id
  ` as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

export async function getGoogleAdsSyncCheckpoint(input: {
  partitionId: string;
  checkpointScope: string;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT *
    FROM google_ads_sync_checkpoints
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
    isPaginated: Boolean(row.is_paginated),
    phase: String(row.phase) as GoogleAdsSyncCheckpointRecord["phase"],
    status: String(row.status) as GoogleAdsSyncCheckpointRecord["status"],
    pageIndex: toNumber(row.page_index),
    nextPageToken: row.next_page_token ? String(row.next_page_token) : null,
    providerCursor: row.provider_cursor ? String(row.provider_cursor) : null,
    rawSnapshotIds: Array.isArray(row.raw_snapshot_ids)
      ? row.raw_snapshot_ids.map((value) => String(value))
      : [],
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
    progressHeartbeatAt: normalizeTimestamp(row.progress_heartbeat_at),
    retryAfterAt: normalizeTimestamp(row.retry_after_at),
    leaseOwner: row.lease_owner ? String(row.lease_owner) : null,
    leaseExpiresAt: normalizeTimestamp(row.lease_expires_at),
    poisonedAt: normalizeTimestamp(row.poisoned_at),
    poisonReason: row.poison_reason ? String(row.poison_reason) : null,
    replayReasonCode: row.replay_reason_code ? String(row.replay_reason_code) : null,
    replayDetail: row.replay_detail ? String(row.replay_detail) : null,
    startedAt: normalizeTimestamp(row.started_at),
    finishedAt: normalizeTimestamp(row.finished_at),
    createdAt: normalizeTimestamp(row.created_at) ?? undefined,
    updatedAt: normalizeTimestamp(row.updated_at) ?? undefined,
  } satisfies GoogleAdsSyncCheckpointRecord;
}

export async function listGoogleAdsRawSnapshotsForPartition(input: {
  partitionId: string;
  endpointName: string;
}) {
  await runMigrations();
  const sql = getDb();
  return (sql`
    SELECT
      id,
      checkpoint_id,
      page_index,
      payload_json,
      response_headers,
      provider_cursor,
      request_context,
      provider_http_status,
      status,
      fetched_at
    FROM google_ads_raw_snapshots
    WHERE partition_id = ${input.partitionId}
      AND endpoint_name = ${input.endpointName}
    ORDER BY COALESCE(page_index, 0) ASC, fetched_at ASC
  ` as unknown) as Array<{
    id: string;
    checkpoint_id: string | null;
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

export async function upsertGoogleAdsDailyRows(
  scope: GoogleAdsWarehouseScope,
  rows: GoogleAdsWarehouseDailyRow[]
) {
  if (rows.length === 0) return;
  await runMigrations();
  const sql = getDb();
  const table = tableNameForScope(scope);

  for (const row of rows) {
    await sql.query(
      `
        INSERT INTO ${table} (
          business_id,
          provider_account_id,
          date,
          account_timezone,
          account_currency,
          entity_key,
          entity_label,
          campaign_id,
          campaign_name,
          ad_group_id,
          ad_group_name,
          status,
          channel,
          classification,
          payload_json,
          spend,
          revenue,
          conversions,
          impressions,
          clicks,
          ctr,
          cpc,
          cpa,
          roas,
          conversion_rate,
          interaction_rate,
          source_snapshot_id,
          updated_at
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,now()
        )
        ON CONFLICT (business_id, provider_account_id, date, entity_key) DO UPDATE SET
          entity_label = EXCLUDED.entity_label,
          campaign_id = EXCLUDED.campaign_id,
          campaign_name = EXCLUDED.campaign_name,
          ad_group_id = EXCLUDED.ad_group_id,
          ad_group_name = EXCLUDED.ad_group_name,
          status = EXCLUDED.status,
          channel = EXCLUDED.channel,
          classification = EXCLUDED.classification,
          payload_json = EXCLUDED.payload_json,
          spend = EXCLUDED.spend,
          revenue = EXCLUDED.revenue,
          conversions = EXCLUDED.conversions,
          impressions = EXCLUDED.impressions,
          clicks = EXCLUDED.clicks,
          ctr = EXCLUDED.ctr,
          cpc = EXCLUDED.cpc,
          cpa = EXCLUDED.cpa,
          roas = EXCLUDED.roas,
          conversion_rate = EXCLUDED.conversion_rate,
          interaction_rate = EXCLUDED.interaction_rate,
          source_snapshot_id = EXCLUDED.source_snapshot_id,
          updated_at = now()
      `,
      [
        row.businessId,
        row.providerAccountId,
        normalizeDate(row.date),
        row.accountTimezone,
        row.accountCurrency,
        row.entityKey,
        row.entityLabel,
        row.campaignId,
        row.campaignName,
        row.adGroupId,
        row.adGroupName,
        row.status,
        row.channel,
        row.classification,
        JSON.stringify(row.payloadJson ?? {}),
        row.spend,
        row.revenue,
        row.conversions,
        row.impressions,
        row.clicks,
        row.ctr,
        row.cpc,
        row.cpa,
        row.roas,
        row.conversionRate,
        row.interactionRate,
        row.sourceSnapshotId,
      ]
    );
  }
}

export async function readGoogleAdsDailyRange(input: {
  scope: GoogleAdsWarehouseScope;
  businessId: string;
  providerAccountIds?: string[] | null;
  startDate: string;
  endDate: string;
}) {
  await runMigrations();
  const sql = getDb();
  const table = tableNameForScope(input.scope);
  const rows = await sql.query(
    `
      SELECT
        business_id,
        provider_account_id,
        date,
        account_timezone,
        account_currency,
        entity_key,
        entity_label,
        campaign_id,
        campaign_name,
        ad_group_id,
        ad_group_name,
        status,
        channel,
        classification,
        payload_json,
        spend,
        revenue,
        conversions,
        impressions,
        clicks,
        ctr,
        cpc,
        cpa,
        roas,
        conversion_rate,
        interaction_rate,
        source_snapshot_id,
        created_at,
        updated_at
      FROM ${table}
      WHERE business_id = $1
        AND date >= $2
        AND date <= $3
        AND ($4::text[] IS NULL OR provider_account_id = ANY($4::text[]))
      ORDER BY date ASC, updated_at DESC
    `,
    [
      input.businessId,
      normalizeDate(input.startDate),
      normalizeDate(input.endDate),
      input.providerAccountIds?.length ? input.providerAccountIds : null,
    ]
  ) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    businessId: String(row.business_id),
    providerAccountId: String(row.provider_account_id),
    date: normalizeDate(row.date),
    accountTimezone: String(row.account_timezone ?? "UTC"),
    accountCurrency: String(row.account_currency ?? "USD"),
    entityKey: String(row.entity_key),
    entityLabel: row.entity_label ? String(row.entity_label) : null,
    campaignId: row.campaign_id ? String(row.campaign_id) : null,
    campaignName: row.campaign_name ? String(row.campaign_name) : null,
    adGroupId: row.ad_group_id ? String(row.ad_group_id) : null,
    adGroupName: row.ad_group_name ? String(row.ad_group_name) : null,
    status: row.status ? String(row.status) : null,
    channel: row.channel ? String(row.channel) : null,
    classification: row.classification ? String(row.classification) : null,
    payloadJson: row.payload_json ?? {},
    spend: toNumber(row.spend),
    revenue: toNumber(row.revenue),
    conversions: toNumber(row.conversions),
    impressions: toNumber(row.impressions),
    clicks: toNumber(row.clicks),
    ctr: row.ctr == null ? null : toNumber(row.ctr),
    cpc: row.cpc == null ? null : toNumber(row.cpc),
    cpa: row.cpa == null ? null : toNumber(row.cpa),
    roas: toNumber(row.roas),
    conversionRate: row.conversion_rate == null ? null : toNumber(row.conversion_rate),
    interactionRate: row.interaction_rate == null ? null : toNumber(row.interaction_rate),
    sourceSnapshotId: row.source_snapshot_id ? String(row.source_snapshot_id) : null,
    createdAt: normalizeTimestamp(row.created_at) ?? undefined,
    updatedAt: normalizeTimestamp(row.updated_at) ?? undefined,
  })) as GoogleAdsWarehouseDailyRow[];
}

export async function readGoogleAdsAggregatedRange(input: {
  scope: GoogleAdsWarehouseScope;
  businessId: string;
  providerAccountIds?: string[] | null;
  startDate: string;
  endDate: string;
}) {
  await runMigrations();
  const sql = getDb();
  const table = tableNameForScope(input.scope);
  const payloadProjection = payloadProjectionSqlForScope(input.scope);
  const aggregateRows = await sql.query(
    `
      SELECT
        entity_key,
        SUM(spend) AS spend,
        SUM(revenue) AS revenue,
        SUM(conversions) AS conversions,
        SUM(impressions) AS impressions,
        SUM(clicks) AS clicks,
        MAX(updated_at) AS updated_at
      FROM ${table}
      WHERE business_id = $1
        AND date >= $2
        AND date <= $3
        AND ($4::text[] IS NULL OR provider_account_id = ANY($4::text[]))
      GROUP BY entity_key
      ORDER BY SUM(spend) DESC, MAX(updated_at) DESC
    `,
    [
      input.businessId,
      normalizeDate(input.startDate),
      normalizeDate(input.endDate),
      input.providerAccountIds?.length ? input.providerAccountIds : null,
    ]
  ) as Array<Record<string, unknown>>;

  const latestRows = await sql.query(
    `
      SELECT DISTINCT ON (entity_key)
        entity_key,
        entity_label,
        campaign_id,
        campaign_name,
        ad_group_id,
        ad_group_name,
        status,
        channel,
        classification,
        ${payloadProjection} AS payload_json,
        updated_at
      FROM ${table}
      WHERE business_id = $1
        AND date >= $2
        AND date <= $3
        AND ($4::text[] IS NULL OR provider_account_id = ANY($4::text[]))
      ORDER BY entity_key, updated_at DESC
    `,
    [
      input.businessId,
      normalizeDate(input.startDate),
      normalizeDate(input.endDate),
      input.providerAccountIds?.length ? input.providerAccountIds : null,
    ]
  ) as Array<Record<string, unknown>>;

  const latestByEntityKey = new Map(
    latestRows.map((row) => [String(row.entity_key), row] as const)
  );

  return aggregateRows.map((row) => {
    const latest = latestByEntityKey.get(String(row.entity_key)) ?? {};
    const spend = toNumber(row.spend);
    const revenue = toNumber(row.revenue);
    const conversions = toNumber(row.conversions);
    const impressions = toNumber(row.impressions);
    const clicks = toNumber(row.clicks);
    const payload = latest.payload_json && typeof latest.payload_json === "object"
      ? (latest.payload_json as Record<string, unknown>)
      : {};
    return {
      ...payload,
      id: String(payload.id ?? row.entity_key),
      name: String(payload.name ?? row.entity_label ?? row.entity_key),
      entityKey: String(row.entity_key),
      entityLabel: latest.entity_label ? String(latest.entity_label) : null,
      campaignId: latest.campaign_id ? String(latest.campaign_id) : null,
      campaignName: latest.campaign_name ? String(latest.campaign_name) : null,
      adGroupId: latest.ad_group_id ? String(latest.ad_group_id) : null,
      adGroupName: latest.ad_group_name ? String(latest.ad_group_name) : null,
      status: latest.status ? String(latest.status) : null,
      channel: latest.channel ? String(latest.channel) : null,
      classification: latest.classification ? String(latest.classification) : null,
      spend,
      revenue,
      conversions,
      impressions,
      clicks,
      roas: spend > 0 ? Number((revenue / spend).toFixed(2)) : 0,
      cpa: conversions > 0 ? Number((spend / conversions).toFixed(2)) : 0,
      ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
      cpc: clicks > 0 ? Number((spend / clicks).toFixed(2)) : null,
      conversionRate: clicks > 0 ? Number(((conversions / clicks) * 100).toFixed(2)) : null,
      updatedAt: normalizeTimestamp(row.updated_at),
    } as Record<string, unknown>;
  });
}

function payloadProjectionSqlForScope(scope: GoogleAdsWarehouseScope) {
  switch (scope) {
    case "campaign_daily":
      return `
        jsonb_strip_nulls(jsonb_build_object(
          'id', payload_json -> 'id',
          'name', payload_json -> 'name',
          'status', payload_json -> 'status',
          'channel', payload_json -> 'channel',
          'servingStatus', payload_json -> 'servingStatus',
          'dailyBudget', payload_json -> 'dailyBudget',
          'campaignBudgetResourceName', payload_json -> 'campaignBudgetResourceName',
          'budgetDeliveryMethod', payload_json -> 'budgetDeliveryMethod',
          'budgetExplicitlyShared', payload_json -> 'budgetExplicitlyShared',
          'impressionShare', payload_json -> 'impressionShare',
          'lostIsBudget', payload_json -> 'lostIsBudget',
          'lostIsRank', payload_json -> 'lostIsRank',
          'searchTopImpressionShare', payload_json -> 'searchTopImpressionShare',
          'searchAbsoluteTopImpressionShare', payload_json -> 'searchAbsoluteTopImpressionShare',
          'topImpressionPercentage', payload_json -> 'topImpressionPercentage',
          'absoluteTopImpressionPercentage', payload_json -> 'absoluteTopImpressionPercentage'
        ))
      `;
    case "search_term_daily":
      return `
        jsonb_strip_nulls(jsonb_build_object(
          'key', payload_json -> 'key',
          'searchTerm', payload_json -> 'searchTerm',
          'status', payload_json -> 'status',
          'campaignId', payload_json -> 'campaignId',
          'campaign', payload_json -> 'campaign',
          'campaignName', payload_json -> 'campaignName',
          'adGroupId', payload_json -> 'adGroupId',
          'adGroup', payload_json -> 'adGroup',
          'adGroupName', payload_json -> 'adGroupName',
          'intent', payload_json -> 'intent',
          'intentClass', payload_json -> 'intentClass',
          'isKeyword', payload_json -> 'isKeyword',
          'wasteFlag', payload_json -> 'wasteFlag',
          'keywordOpportunityFlag', payload_json -> 'keywordOpportunityFlag',
          'negativeKeywordFlag', payload_json -> 'negativeKeywordFlag',
          'clusterId', payload_json -> 'clusterId'
        ))
      `;
    case "product_daily":
      return `
        jsonb_strip_nulls(jsonb_build_object(
          'productId', payload_json -> 'productId',
          'productItemId', payload_json -> 'productItemId',
          'productTitle', payload_json -> 'productTitle',
          'itemId', payload_json -> 'itemId',
          'title', payload_json -> 'title',
          'merchantCenterId', payload_json -> 'merchantCenterId',
          'feedPrice', payload_json -> 'feedPrice',
          'campaignIds', payload_json -> 'campaignIds',
          'campaignNames', payload_json -> 'campaignNames',
          'contributionProxy', payload_json -> 'contributionProxy',
          'scaleState', payload_json -> 'scaleState',
          'underperformingState', payload_json -> 'underperformingState',
          'hiddenWinnerState', payload_json -> 'hiddenWinnerState',
          'statusLabel', payload_json -> 'statusLabel',
          'orders', payload_json -> 'orders'
        ))
      `;
    case "asset_daily":
      return `
        jsonb_strip_nulls(jsonb_build_object(
          'id', payload_json -> 'id',
          'assetId', payload_json -> 'assetId',
          'assetGroupId', payload_json -> 'assetGroupId',
          'assetGroupIdString', payload_json -> 'assetGroupIdString',
          'assetGroup', payload_json -> 'assetGroup',
          'assetGroupName', payload_json -> 'assetGroupName',
          'campaignId', payload_json -> 'campaignId',
          'campaign', payload_json -> 'campaign',
          'campaignName', payload_json -> 'campaignName',
          'fieldType', payload_json -> 'fieldType',
          'type', payload_json -> 'type',
          'assetType', payload_json -> 'assetType',
          'rawAssetType', payload_json -> 'rawAssetType',
          'name', payload_json -> 'name',
          'assetName', payload_json -> 'assetName',
          'text', payload_json -> 'text',
          'assetText', payload_json -> 'assetText',
          'imageUrl', payload_json -> 'imageUrl',
          'preview', payload_json -> 'preview',
          'videoId', payload_json -> 'videoId',
          'performanceLabel', payload_json -> 'performanceLabel',
          'hint', payload_json -> 'hint',
          'assetState', payload_json -> 'assetState',
          'wasteFlag', payload_json -> 'wasteFlag',
          'expandFlag', payload_json -> 'expandFlag'
        ))
      `;
    case "asset_group_daily":
      return `
        jsonb_strip_nulls(jsonb_build_object(
          'id', payload_json -> 'id',
          'assetGroupId', payload_json -> 'assetGroupId',
          'assetGroupName', payload_json -> 'assetGroupName',
          'campaignId', payload_json -> 'campaignId',
          'campaignName', payload_json -> 'campaignName',
          'status', payload_json -> 'status',
          'adStrength', payload_json -> 'adStrength',
          'finalUrls', payload_json -> 'finalUrls',
          'assetCountByType', payload_json -> 'assetCountByType',
          'missingAssetTypes', payload_json -> 'missingAssetTypes',
          'audienceSignals', payload_json -> 'audienceSignals',
          'searchThemesConfigured', payload_json -> 'searchThemesConfigured',
          'spendShare', payload_json -> 'spendShare',
          'revenueShare', payload_json -> 'revenueShare',
          'scaleState', payload_json -> 'scaleState',
          'weakState', payload_json -> 'weakState',
          'coverageRisk', payload_json -> 'coverageRisk',
          'messagingAlignmentScore', payload_json -> 'messagingAlignmentScore',
          'coverageScore', payload_json -> 'coverageScore',
          'assetCount', payload_json -> 'assetCount'
        ))
      `;
    case "geo_daily":
      return `
        jsonb_strip_nulls(jsonb_build_object(
          'geoId', payload_json -> 'geoId',
          'geoName', payload_json -> 'geoName',
          'geoState', payload_json -> 'geoState',
          'scaleFlag', payload_json -> 'scaleFlag',
          'reduceFlag', payload_json -> 'reduceFlag'
        ))
      `;
    case "device_daily":
      return `
        jsonb_strip_nulls(jsonb_build_object(
          'device', payload_json -> 'device',
          'deviceState', payload_json -> 'deviceState',
          'scaleFlag', payload_json -> 'scaleFlag',
          'weakFlag', payload_json -> 'weakFlag'
        ))
      `;
    case "audience_daily":
      return `
        jsonb_strip_nulls(jsonb_build_object(
          'audienceKey', payload_json -> 'audienceKey',
          'audienceNameBestEffort', payload_json -> 'audienceNameBestEffort',
          'audienceType', payload_json -> 'audienceType',
          'campaignId', payload_json -> 'campaignId',
          'campaignName', payload_json -> 'campaignName',
          'adGroupId', payload_json -> 'adGroupId',
          'adGroupName', payload_json -> 'adGroupName',
          'audienceState', payload_json -> 'audienceState',
          'weakSegmentFlag', payload_json -> 'weakSegmentFlag',
          'strongSegmentFlag', payload_json -> 'strongSegmentFlag'
        ))
      `;
    default:
      return "payload_json";
  }
}

export async function getGoogleAdsDailyCoverage(input: {
  scope: GoogleAdsWarehouseScope;
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  await runMigrations();
  const sql = getDb();
  const table = tableNameForScope(input.scope);
  const [rows, partitionRows] = await Promise.all([
    sql.query(
      `
        SELECT
          COUNT(DISTINCT date) AS completed_days,
          COALESCE(MAX(date), NULL) AS ready_through_date,
          COALESCE(MAX(updated_at), NULL) AS latest_updated_at,
          COUNT(*) AS total_rows
        FROM ${table}
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
        FROM google_ads_sync_partitions
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

export async function getGoogleAdsCoveredDates(input: {
  scope: GoogleAdsWarehouseScope;
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  await runMigrations();
  const sql = getDb();
  const table = tableNameForScope(input.scope);
  const [rows, partitionRows] = await Promise.all([
    sql.query(
      `
        SELECT DISTINCT date
        FROM ${table}
        WHERE business_id = $1
          AND date >= $2
          AND date <= $3
          AND ($4::text IS NULL OR provider_account_id = $4)
        ORDER BY date DESC
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
        SELECT DISTINCT partition_date AS date
        FROM google_ads_sync_partitions
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

  return [...rows, ...partitionRows]
    .map((row) => (row.date ? normalizeDate(row.date) : null))
    .filter((value): value is string => Boolean(value));
}

export async function getGoogleAdsQueueHealth(input: { businessId: string }) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'queued') AS queue_depth,
      COUNT(*) FILTER (WHERE status IN ('leased', 'running')) AS leased_partitions,
      COUNT(*) FILTER (WHERE lane = 'core' AND status = 'queued') AS core_queue_depth,
      COUNT(*) FILTER (WHERE lane = 'core' AND status IN ('leased', 'running')) AS core_leased_partitions,
      COUNT(*) FILTER (WHERE lane = 'extended' AND status = 'queued') AS extended_queue_depth,
      COUNT(*) FILTER (WHERE lane = 'extended' AND status IN ('leased', 'running')) AS extended_leased_partitions,
      COUNT(*) FILTER (WHERE lane = 'maintenance' AND status = 'queued') AS maintenance_queue_depth,
      COUNT(*) FILTER (WHERE lane = 'maintenance' AND status IN ('leased', 'running')) AS maintenance_leased_partitions,
      COUNT(*) FILTER (WHERE status = 'dead_letter') AS dead_letter_partitions,
      MIN(partition_date) FILTER (WHERE status = 'queued') AS oldest_queued_partition,
      MAX(updated_at) FILTER (WHERE lane = 'core') AS latest_core_activity_at,
      MAX(updated_at) FILTER (WHERE lane = 'extended') AS latest_extended_activity_at,
      MAX(updated_at) FILTER (WHERE lane = 'maintenance') AS latest_maintenance_activity_at
    FROM google_ads_sync_partitions
    WHERE business_id = ${input.businessId}
  ` as Array<Record<string, unknown>>;
  const row = rows[0] ?? {};
  return {
    queueDepth: toNumber(row.queue_depth),
    leasedPartitions: toNumber(row.leased_partitions),
    coreQueueDepth: toNumber(row.core_queue_depth),
    coreLeasedPartitions: toNumber(row.core_leased_partitions),
    extendedQueueDepth: toNumber(row.extended_queue_depth),
    extendedLeasedPartitions: toNumber(row.extended_leased_partitions),
    maintenanceQueueDepth: toNumber(row.maintenance_queue_depth),
    maintenanceLeasedPartitions: toNumber(row.maintenance_leased_partitions),
    deadLetterPartitions: toNumber(row.dead_letter_partitions),
    oldestQueuedPartition: row.oldest_queued_partition
      ? normalizeDate(row.oldest_queued_partition)
      : null,
    latestCoreActivityAt: normalizeTimestamp(row.latest_core_activity_at),
    latestExtendedActivityAt: normalizeTimestamp(row.latest_extended_activity_at),
    latestMaintenanceActivityAt: normalizeTimestamp(row.latest_maintenance_activity_at),
  };
}

export async function getGoogleAdsPartitionHealth(input: {
  businessId: string;
  providerAccountId?: string | null;
  scope?: GoogleAdsWarehouseScope | null;
  lane?: GoogleAdsSyncLane | null;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'queued') AS queue_depth,
      COUNT(*) FILTER (WHERE status IN ('leased', 'running')) AS leased_partitions,
      COUNT(*) FILTER (WHERE status = 'dead_letter') AS dead_letter_partitions,
      MIN(partition_date) FILTER (WHERE status = 'queued') AS oldest_queued_partition,
      MAX(updated_at) AS latest_activity_at
    FROM google_ads_sync_partitions
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND (${input.scope ?? null}::text IS NULL OR scope = ${input.scope ?? null})
      AND (${input.lane ?? null}::text IS NULL OR lane = ${input.lane ?? null})
  ` as Array<Record<string, unknown>>;
  const row = rows[0] ?? {};
  return {
    queueDepth: toNumber(row.queue_depth),
    leasedPartitions: toNumber(row.leased_partitions),
    deadLetterPartitions: toNumber(row.dead_letter_partitions),
    oldestQueuedPartition: row.oldest_queued_partition
      ? normalizeDate(row.oldest_queued_partition)
      : null,
    latestActivityAt: normalizeTimestamp(row.latest_activity_at),
  };
}

export async function getGoogleAdsCheckpointHealth(input: {
  businessId: string;
  providerAccountId?: string | null;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      checkpoint_scope,
      is_paginated,
      phase,
      status,
      page_index,
      COALESCE(progress_heartbeat_at, updated_at) AS progress_updated_at,
      poisoned_at,
      poison_reason,
      COUNT(*) FILTER (WHERE status = 'failed') OVER ()::int AS checkpoint_failures
    FROM google_ads_sync_checkpoints
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
  const updatedAt = normalizeTimestamp(row.progress_updated_at);
  return {
    latestCheckpointScope: row.checkpoint_scope ? String(row.checkpoint_scope) : null,
    latestCheckpointPhase: row.phase ? String(row.phase) : null,
    latestCheckpointStatus: row.status ? String(row.status) : null,
    latestCheckpointUpdatedAt: updatedAt,
    checkpointLagMinutes: computeCheckpointLagMinutes(updatedAt),
    lastSuccessfulPageIndex: toNumber(row.page_index),
    resumeCapable:
      !row.poisoned_at &&
      row.status != null &&
      ["pending", "running", "failed"].includes(String(row.status)),
    checkpointFailures: toNumber(row.checkpoint_failures),
  };
}

export async function replayGoogleAdsDeadLetterPartitions(input: {
  businessId: string;
  scope?: GoogleAdsWarehouseScope | null;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    UPDATE google_ads_sync_partitions
    SET
      status = 'queued',
      lease_owner = NULL,
      lease_expires_at = NULL,
      next_retry_at = NULL,
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

export async function releaseGoogleAdsPoisonedPartitions(input: {
  businessId: string;
  scope?: GoogleAdsWarehouseScope | null;
}) {
  await runMigrations();
  const sql = getDb();
  const partitions = await sql`
    WITH released_checkpoints AS (
      UPDATE google_ads_sync_checkpoints checkpoint
      SET
        poisoned_at = NULL,
        poison_reason = NULL,
        replay_reason_code = 'quarantine_release',
        replay_detail = 'Quarantine released by admin action.',
        updated_at = now()
      FROM google_ads_sync_partitions partition
      WHERE checkpoint.partition_id = partition.id
        AND partition.business_id = ${input.businessId}
        AND partition.status = 'dead_letter'
        AND checkpoint.poisoned_at IS NOT NULL
        AND (${input.scope ?? null}::text IS NULL OR partition.scope = ${input.scope ?? null})
      RETURNING checkpoint.partition_id
    )
    UPDATE google_ads_sync_partitions partition
    SET
      status = 'failed',
      lease_owner = NULL,
      lease_expires_at = NULL,
      next_retry_at = NULL,
      last_error = COALESCE(partition.last_error, 'poison quarantine released; awaiting replay'),
      updated_at = now()
    WHERE partition.id IN (SELECT partition_id FROM released_checkpoints)
    RETURNING partition.id, partition.lane, partition.scope, partition.partition_date
  ` as Array<Record<string, unknown>>;

  return partitions.map((row) => ({
    id: String(row.id),
    lane: String(row.lane),
    scope: String(row.scope),
    partitionDate: normalizeDate(row.partition_date),
  }));
}

export async function forceReplayGoogleAdsPoisonedPartitions(input: {
  businessId: string;
  scope?: GoogleAdsWarehouseScope | null;
}) {
  await runMigrations();
  const sql = getDb();
  const partitions = await sql`
    WITH released_checkpoints AS (
      UPDATE google_ads_sync_checkpoints checkpoint
      SET
        poisoned_at = NULL,
        poison_reason = NULL,
        replay_reason_code = 'manual_replay',
        replay_detail = 'Manual replay requested from admin sync health.',
        updated_at = now()
      FROM google_ads_sync_partitions partition
      WHERE checkpoint.partition_id = partition.id
        AND partition.business_id = ${input.businessId}
        AND partition.status = 'dead_letter'
        AND checkpoint.poisoned_at IS NOT NULL
        AND (${input.scope ?? null}::text IS NULL OR partition.scope = ${input.scope ?? null})
      RETURNING checkpoint.partition_id
    )
    UPDATE google_ads_sync_partitions partition
    SET
      status = 'queued',
      lease_owner = NULL,
      lease_expires_at = NULL,
      next_retry_at = NULL,
      last_error = NULL,
      updated_at = now()
    WHERE partition.id IN (SELECT partition_id FROM released_checkpoints)
    RETURNING partition.id, partition.lane, partition.scope, partition.partition_date
  ` as Array<Record<string, unknown>>;

  return partitions.map((row) => ({
    id: String(row.id),
    lane: String(row.lane),
    scope: String(row.scope),
    partitionDate: normalizeDate(row.partition_date),
  }));
}

export async function getGoogleAdsSyncState(input: {
  businessId: string;
  providerAccountId?: string | null;
  scope: GoogleAdsWarehouseScope;
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
    FROM google_ads_sync_state
    WHERE business_id = ${input.businessId}
      AND scope = ${input.scope}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
    ORDER BY updated_at DESC
  ` as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    businessId: String(row.business_id),
    providerAccountId: String(row.provider_account_id),
    scope: String(row.scope) as GoogleAdsWarehouseScope,
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
  })) as GoogleAdsSyncStateRecord[];
}

export async function getLatestGoogleAdsSyncHealth(input: {
  businessId: string;
  providerAccountId?: string | null;
}) {
  await runMigrations();
  const sql = getDb();
  const [runRows, partitionRows] = await Promise.all([
    sql`
      SELECT
        id,
        provider_account_id,
        CASE
          WHEN lane = 'maintenance' THEN 'incremental_recent'
          ELSE 'initial_backfill'
        END AS sync_type,
        scope,
        partition_date AS start_date,
        partition_date AS end_date,
        source AS trigger_source,
        created_at AS triggered_at,
        status,
        error_message AS last_error,
        NULL::double precision AS progress_percent,
        finished_at,
        started_at,
        updated_at
      FROM google_ads_sync_runs
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
      FROM google_ads_sync_partitions
      WHERE business_id = ${input.businessId}
        AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      ORDER BY updated_at DESC
      LIMIT 1
    `.catch(() => []) as Promise<Array<Record<string, unknown>>>,
  ]);
  return runRows[0] ?? partitionRows[0] ?? null;
}

export async function expireStaleGoogleAdsSyncJobs(input: {
  businessId: string;
  timeoutMinutes?: number;
}) {
  // Legacy-only: retained to neutralize pre-partition job records during migration.
  await runMigrations();
  const sql = getDb();
  await sql`
    UPDATE google_ads_sync_jobs
    SET
      status = 'failed',
      last_error = COALESCE(last_error, 'stale sync job expired automatically'),
      finished_at = now(),
      updated_at = now()
    WHERE business_id = ${input.businessId}
      AND status = 'running'
      AND started_at < now() - (${input.timeoutMinutes ?? 90} || ' minutes')::interval
  `;
}

export async function cleanupGoogleAdsObsoleteSyncJobs(input: {
  businessId: string;
  stalePriorityMinutes?: number;
  staleBackgroundMinutes?: number;
}) {
  // Legacy-only: retained for cleanup/debug visibility. Queue/status truth must not depend on this table.
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    WITH cancelled_runtime AS (
      UPDATE google_ads_sync_jobs
      SET
        status = 'cancelled',
        last_error = COALESCE(last_error, 'legacy runtime sync was retired automatically'),
        finished_at = now(),
        updated_at = now()
      WHERE business_id = ${input.businessId}
        AND status = 'running'
        AND trigger_source = 'request_runtime'
      RETURNING id
    ),
    cancelled_unsupported_priority AS (
      UPDATE google_ads_sync_jobs
      SET
        status = 'cancelled',
        last_error = COALESCE(last_error, 'selected date preparation was limited to core scopes automatically'),
        finished_at = now(),
        updated_at = now()
      WHERE business_id = ${input.businessId}
        AND status = 'running'
        AND trigger_source = 'selected_range_priority'
        AND scope NOT IN ('campaign_daily', 'account_daily')
      RETURNING id
    ),
    cancelled_unsupported_background_initial AS (
      UPDATE google_ads_sync_jobs
      SET
        status = 'cancelled',
        last_error = COALESCE(last_error, 'historical backfill was limited to core scopes automatically'),
        finished_at = now(),
        updated_at = now()
      WHERE business_id = ${input.businessId}
        AND status = 'running'
        AND trigger_source = 'background_initial'
        AND scope NOT IN ('campaign_daily', 'account_daily')
      RETURNING id
    ),
    cancelled_priority_during_historical AS (
      UPDATE google_ads_sync_jobs
      SET
        status = 'cancelled',
        last_error = COALESCE(last_error, 'selected date preparation yielded to historical backfill automatically'),
        finished_at = now(),
        updated_at = now()
      WHERE business_id = ${input.businessId}
        AND status = 'running'
        AND trigger_source = 'selected_range_priority'
        AND EXISTS (
          SELECT 1
          FROM google_ads_sync_jobs blocker
          WHERE blocker.business_id = ${input.businessId}
            AND blocker.status = 'running'
            AND blocker.trigger_source IN ('background_initial', 'background_recent', 'background_repair', 'background_today')
        )
      RETURNING id
    ),
    failed_stale_priority AS (
      UPDATE google_ads_sync_jobs
      SET
        status = 'failed',
        last_error = COALESCE(last_error, 'selected date preparation expired automatically'),
        finished_at = now(),
        updated_at = now()
      WHERE business_id = ${input.businessId}
        AND status = 'running'
        AND trigger_source = 'selected_range_priority'
        AND started_at < now() - (${input.stalePriorityMinutes ?? 10} || ' minutes')::interval
      RETURNING id
    ),
    failed_stale_background AS (
      UPDATE google_ads_sync_jobs
      SET
        status = 'failed',
        last_error = COALESCE(last_error, 'background sync expired automatically'),
        finished_at = now(),
        updated_at = now()
      WHERE business_id = ${input.businessId}
        AND status = 'running'
        AND trigger_source IN ('background_initial', 'background_recent', 'background_repair', 'background_today')
        AND started_at < now() - (${input.staleBackgroundMinutes ?? 5} || ' minutes')::interval
      RETURNING id
    ),
    deduped_running AS (
      UPDATE google_ads_sync_jobs job
      SET
        status = 'failed',
        last_error = COALESCE(job.last_error, 'duplicate running sync job cleaned up automatically'),
        finished_at = now(),
        updated_at = now()
      FROM (
        SELECT id
        FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY business_id, provider_account_id, sync_type, scope, start_date, end_date, trigger_source
              ORDER BY updated_at DESC, triggered_at DESC, id DESC
            ) AS row_number
          FROM google_ads_sync_jobs
          WHERE business_id = ${input.businessId}
            AND status = 'running'
        ) ranked
        WHERE ranked.row_number > 1
      ) duplicates
      WHERE job.id = duplicates.id
      RETURNING job.id
    )
    SELECT
      (SELECT COUNT(*) FROM cancelled_runtime) AS cancelled_runtime_count,
      (SELECT COUNT(*) FROM cancelled_unsupported_priority) AS cancelled_unsupported_priority_count,
      (SELECT COUNT(*) FROM cancelled_unsupported_background_initial) AS cancelled_unsupported_background_initial_count,
      (SELECT COUNT(*) FROM cancelled_priority_during_historical) AS cancelled_priority_during_historical_count,
      (SELECT COUNT(*) FROM failed_stale_priority) AS failed_stale_priority_count,
      (SELECT COUNT(*) FROM failed_stale_background) AS failed_stale_background_count,
      (SELECT COUNT(*) FROM deduped_running) AS deduped_running_count
  ` as Array<{
    cancelled_runtime_count?: string | number | null;
    cancelled_unsupported_priority_count?: string | number | null;
    cancelled_unsupported_background_initial_count?: string | number | null;
    cancelled_priority_during_historical_count?: string | number | null;
    failed_stale_priority_count?: string | number | null;
    failed_stale_background_count?: string | number | null;
    deduped_running_count?: string | number | null;
  }>;

  return {
    cancelledRuntimeCount: toNumber(rows[0]?.cancelled_runtime_count ?? 0),
    cancelledUnsupportedPriorityCount: toNumber(
      rows[0]?.cancelled_unsupported_priority_count ?? 0
    ),
    cancelledUnsupportedBackgroundInitialCount: toNumber(
      rows[0]?.cancelled_unsupported_background_initial_count ?? 0
    ),
    cancelledPriorityDuringHistoricalCount: toNumber(
      rows[0]?.cancelled_priority_during_historical_count ?? 0
    ),
    failedStalePriorityCount: toNumber(rows[0]?.failed_stale_priority_count ?? 0),
    failedStaleBackgroundCount: toNumber(rows[0]?.failed_stale_background_count ?? 0),
    dedupedRunningCount: toNumber(rows[0]?.deduped_running_count ?? 0),
  };
}

export async function getGoogleAdsBlockedSyncDates(input: {
  businessId: string;
  scope: GoogleAdsWarehouseScope;
  triggerSources: string[];
  runningLookbackMinutes?: number;
  failedCooldownMinutes?: number;
}) {
  // Legacy-only helper for older sync job semantics.
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT DISTINCT start_date
    FROM google_ads_sync_jobs
    WHERE business_id = ${input.businessId}
      AND scope = ${input.scope}
      AND trigger_source = ANY(${input.triggerSources}::text[])
      AND (
        (status = 'running' AND started_at > now() - (${input.runningLookbackMinutes ?? 30} || ' minutes')::interval)
        OR
        (status = 'failed' AND updated_at > now() - (${input.failedCooldownMinutes ?? 10} || ' minutes')::interval)
      )
    ORDER BY start_date DESC
  ` as Array<{ start_date?: string | null }>;

  return rows
    .map((row) => (row.start_date ? String(row.start_date).slice(0, 10) : null))
    .filter((value): value is string => Boolean(value));
}

export async function hasBlockingGoogleAdsSyncJob(input: {
  businessId: string;
  syncTypes: string[];
  excludeTriggerSources?: string[];
  lookbackMinutes?: number;
}) {
  // Legacy-only helper for older manual/debug sync entrypoints.
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT id
    FROM google_ads_sync_jobs
    WHERE business_id = ${input.businessId}
      AND status = 'running'
      AND sync_type = ANY(${input.syncTypes})
      AND (COALESCE(array_length(${input.excludeTriggerSources ?? []}::text[], 1), 0) = 0
        OR trigger_source <> ALL(${input.excludeTriggerSources ?? []}::text[]))
      AND started_at > now() - (${input.lookbackMinutes ?? 90} || ' minutes')::interval
    LIMIT 1
  ` as Array<{ id: string }>;
  return rows.length > 0;
}

export async function resetGoogleAdsState() {
  await runMigrations();
  const sql = getDb();
  await sql`DELETE FROM provider_reporting_snapshots WHERE provider = 'google_ads' OR provider = 'google_ads_gaql'`;
  await sql`DELETE FROM provider_sync_jobs WHERE provider = 'google_ads'`;
  await sql`DELETE FROM provider_account_assignments WHERE provider = 'google'`;
  await sql`DELETE FROM provider_account_snapshots WHERE provider = 'google'`;
  await sql`DELETE FROM google_ads_product_daily`;
  await sql`DELETE FROM google_ads_device_daily`;
  await sql`DELETE FROM google_ads_geo_daily`;
  await sql`DELETE FROM google_ads_audience_daily`;
  await sql`DELETE FROM google_ads_asset_daily`;
  await sql`DELETE FROM google_ads_asset_group_daily`;
  await sql`DELETE FROM google_ads_search_term_daily`;
  await sql`DELETE FROM google_ads_keyword_daily`;
  await sql`DELETE FROM google_ads_ad_daily`;
  await sql`DELETE FROM google_ads_ad_group_daily`;
  await sql`DELETE FROM google_ads_campaign_daily`;
  await sql`DELETE FROM google_ads_account_daily`;
  await sql`DELETE FROM google_ads_raw_snapshots`;
  await sql`DELETE FROM google_ads_sync_runs`;
  await sql`DELETE FROM google_ads_sync_state`;
  await sql`DELETE FROM google_ads_sync_partitions`;
  await sql`DELETE FROM google_ads_runner_leases`;
  await sql`DELETE FROM google_ads_sync_jobs`;
  await sql`
    UPDATE integrations
    SET
      status = 'disconnected',
      access_token = NULL,
      refresh_token = NULL,
      token_expires_at = NULL,
      error_message = NULL,
      metadata = '{}'::jsonb,
      disconnected_at = now(),
      updated_at = now()
    WHERE provider = 'google'
  `;
}
