import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import type {
  ProviderReclaimDisposition,
  ProviderReclaimReasonCode,
} from "@/lib/sync/provider-orchestration";

function normalizeTimestamp(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  const parsed = new Date(text);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  return text;
}

function normalizeMetaJson(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function getMetaBusinessIds(metaJson: Record<string, unknown> | null) {
  const ids = new Set<string>();
  const currentBusinessId = metaJson?.currentBusinessId;
  if (typeof currentBusinessId === "string" && currentBusinessId.trim()) {
    ids.add(currentBusinessId.trim());
  }
  const batchBusinessIds = metaJson?.batchBusinessIds;
  if (Array.isArray(batchBusinessIds)) {
    for (const entry of batchBusinessIds) {
      if (typeof entry === "string" && entry.trim()) ids.add(entry.trim());
    }
  }
  return Array.from(ids);
}

export function selectProviderWorkerForBusiness(input: {
  businessId: string;
  activeLeaseOwner?: string | null;
  workers?: Array<{
    workerId: string;
    workerFreshnessState?: "online" | "stale" | "stopped";
    lastBusinessId: string | null;
    lastConsumedBusinessId?: string | null;
    metaJson?: Record<string, unknown> | null;
  }>;
}) {
  const workers = input.workers ?? [];
  return (
    workers.find((worker) => worker.workerId === (input.activeLeaseOwner ?? "")) ??
    workers.find((worker) => worker.lastConsumedBusinessId === input.businessId) ??
    workers.find((worker) => worker.lastBusinessId === input.businessId) ??
    workers.find((worker) => getMetaBusinessIds(worker.metaJson ?? null).includes(input.businessId)) ??
    workers[0] ??
    null
  );
}

export async function heartbeatSyncWorker(input: {
  workerId: string;
  instanceType: string;
  providerScope: string;
  status: "starting" | "idle" | "running" | "stopping" | "stopped";
  lastBusinessId?: string | null;
  lastPartitionId?: string | null;
  metaJson?: Record<string, unknown>;
}) {
  await runMigrations();
  const sql = getDb();
  await sql`
    INSERT INTO sync_worker_heartbeats (
      worker_id,
      instance_type,
      provider_scope,
      status,
      last_heartbeat_at,
      last_business_id,
      last_partition_id,
      meta_json,
      updated_at
    )
    VALUES (
      ${input.workerId},
      ${input.instanceType},
      ${input.providerScope},
      ${input.status},
      now(),
      ${input.lastBusinessId ?? null},
      ${input.lastPartitionId ?? null},
      ${JSON.stringify(input.metaJson ?? {})}::jsonb,
      now()
    )
    ON CONFLICT (worker_id) DO UPDATE SET
      instance_type = EXCLUDED.instance_type,
      provider_scope = EXCLUDED.provider_scope,
      status = EXCLUDED.status,
      last_heartbeat_at = now(),
      last_business_id = EXCLUDED.last_business_id,
      last_partition_id = EXCLUDED.last_partition_id,
      meta_json = EXCLUDED.meta_json,
      updated_at = now()
  `;
}

export async function acquireSyncRunnerLease(input: {
  businessId: string;
  providerScope: string;
  leaseOwner: string;
  leaseMinutes: number;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    INSERT INTO sync_runner_leases (
      business_id,
      provider_scope,
      lease_owner,
      lease_expires_at,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.providerScope},
      ${input.leaseOwner},
      now() + (${Math.max(1, input.leaseMinutes)} || ' minutes')::interval,
      now()
    )
    ON CONFLICT (business_id, provider_scope) DO UPDATE SET
      lease_owner = CASE
        WHEN sync_runner_leases.lease_expires_at <= now() OR sync_runner_leases.lease_owner = ${input.leaseOwner}
          THEN EXCLUDED.lease_owner
        ELSE sync_runner_leases.lease_owner
      END,
      lease_expires_at = CASE
        WHEN sync_runner_leases.lease_expires_at <= now() OR sync_runner_leases.lease_owner = ${input.leaseOwner}
          THEN EXCLUDED.lease_expires_at
        ELSE sync_runner_leases.lease_expires_at
      END,
      updated_at = now()
    RETURNING lease_owner
  ` as Array<{ lease_owner: string }>;
  return rows[0]?.lease_owner === input.leaseOwner;
}

export async function releaseSyncRunnerLease(input: {
  businessId: string;
  providerScope: string;
  leaseOwner: string;
}) {
  await runMigrations();
  const sql = getDb();
  await sql`
    DELETE FROM sync_runner_leases
    WHERE business_id = ${input.businessId}
      AND provider_scope = ${input.providerScope}
      AND lease_owner = ${input.leaseOwner}
  `;
}

export async function getSyncRunnerLeaseHealth(input: {
  businessId: string;
  providerScope: string;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE lease_expires_at > now())::int AS active_leases,
      MAX(lease_expires_at) AS latest_lease_expires_at,
      MAX(updated_at) AS latest_lease_updated_at,
      MAX(lease_owner) FILTER (WHERE lease_expires_at > now()) AS active_lease_owner,
      BOOL_OR(lease_expires_at > now()) AS has_active_lease
    FROM sync_runner_leases
    WHERE business_id = ${input.businessId}
      AND provider_scope = ${input.providerScope}
  ` as Array<Record<string, unknown>>;
  const row = rows[0] ?? {};
  return {
    activeLeases: Number(row.active_leases ?? 0),
    hasActiveLease: Boolean(row.has_active_lease),
    latestLeaseExpiresAt: normalizeTimestamp(row.latest_lease_expires_at),
    latestLeaseUpdatedAt: normalizeTimestamp(row.latest_lease_updated_at),
    activeLeaseOwner: row.active_lease_owner ? String(row.active_lease_owner) : null,
  };
}

export async function getSyncWorkerHealthSummary(input?: {
  providerScopes?: string[];
  onlineWindowMinutes?: number;
}) {
  await runMigrations();
  const sql = getDb();
  const providerScopes =
    input?.providerScopes
      ?.map((scope) => String(scope).trim())
      .filter(Boolean) ?? [];
  const onlineWindowMinutes = Math.max(1, input?.onlineWindowMinutes ?? 2);
  const [summaryRows, workerRows] = await Promise.all([
    sql`
      SELECT
        COUNT(*) FILTER (
          WHERE last_heartbeat_at > now() - (${String(onlineWindowMinutes)} || ' minutes')::interval
        )::int AS online_workers,
        COUNT(*)::int AS worker_instances,
        MAX(last_heartbeat_at) AS last_heartbeat_at
      FROM sync_worker_heartbeats
      WHERE (
        COALESCE(array_length(${providerScopes}::text[], 1), 0) = 0
        OR provider_scope = ANY(${providerScopes}::text[])
      )
    ` as Promise<Array<Record<string, unknown>>>,
    sql`
      SELECT
        worker_id,
        instance_type,
        provider_scope,
        status,
        last_heartbeat_at,
        last_business_id,
        last_partition_id,
        meta_json
      FROM sync_worker_heartbeats
      WHERE (
        COALESCE(array_length(${providerScopes}::text[], 1), 0) = 0
        OR provider_scope = ANY(${providerScopes}::text[])
      )
      ORDER BY last_heartbeat_at DESC
    ` as Promise<Array<Record<string, unknown>>>,
  ]);
  const summary = summaryRows[0] ?? {};
  const nowMs = Date.now();
  const staleThresholdMs = onlineWindowMinutes * 60_000;
  return {
    onlineWorkers: Number(summary.online_workers ?? 0),
    workerInstances: Number(summary.worker_instances ?? 0),
    lastHeartbeatAt: normalizeTimestamp(summary.last_heartbeat_at),
    lastProgressHeartbeatAt: null,
    workers: workerRows.map((row) => {
      const metaJson = normalizeMetaJson(row.meta_json);
      return {
      workerFreshnessState:
        String(row.status) === "stopped"
          ? ("stopped" as const)
          : (() => {
              const heartbeatAt = normalizeTimestamp(row.last_heartbeat_at);
              if (!heartbeatAt) return "stale" as const;
              return nowMs - new Date(heartbeatAt).getTime() <= staleThresholdMs
                ? ("online" as const)
                : ("stale" as const);
            })(),
      workerId: String(row.worker_id),
      instanceType: String(row.instance_type),
      providerScope: String(row.provider_scope),
      status: String(row.status),
      lastHeartbeatAt: normalizeTimestamp(row.last_heartbeat_at),
      lastBusinessId: row.last_business_id ? String(row.last_business_id) : null,
      lastPartitionId: row.last_partition_id ? String(row.last_partition_id) : null,
      lastConsumedBusinessId:
        typeof metaJson?.currentBusinessId === "string" &&
        metaJson.currentBusinessId.trim().length > 0
          ? metaJson.currentBusinessId.trim()
          : row.last_business_id
            ? String(row.last_business_id)
            : null,
      lastConsumeOutcome:
        typeof metaJson?.consumeOutcome === "string" ? metaJson.consumeOutcome : null,
      lastConsumeFinishedAt:
        typeof metaJson?.consumeFinishedAt === "string"
          ? metaJson.consumeFinishedAt
          : null,
      metaJson,
    };
    }),
  };
}

export function evaluateProviderWorkerHealth(input: {
  onlineWorkers: number;
  lastHeartbeatAt: string | null;
  runnerLeaseActive: boolean;
  staleThresholdMs: number;
  nowMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();
  const heartbeatAgeMs =
    input.lastHeartbeatAt != null
      ? Math.max(0, nowMs - new Date(input.lastHeartbeatAt).getTime())
      : null;
  const hasFreshHeartbeat =
    input.onlineWorkers > 0 ||
    (heartbeatAgeMs != null && heartbeatAgeMs <= Math.max(1, input.staleThresholdMs));
  return {
    workerHealthy: hasFreshHeartbeat || input.runnerLeaseActive,
    heartbeatAgeMs,
    runnerLeaseActive: input.runnerLeaseActive,
    hasFreshHeartbeat,
  };
}

export async function getProviderWorkerHealthState(input: {
  businessId: string;
  providerScope: "google_ads" | "meta";
  staleThresholdMs: number;
}) {
  const [health, leaseHealth] = await Promise.all([
    getSyncWorkerHealthSummary({
      providerScopes: [input.providerScope],
      onlineWindowMinutes: Math.max(1, Math.floor(input.staleThresholdMs / 60_000)),
    }).catch(() => null),
    getSyncRunnerLeaseHealth({
      businessId: input.businessId,
      providerScope: input.providerScope,
    }).catch(() => null),
  ]);
  const evaluated = evaluateProviderWorkerHealth({
    onlineWorkers: health?.onlineWorkers ?? 0,
    lastHeartbeatAt: health?.lastHeartbeatAt ?? null,
    runnerLeaseActive: Boolean(leaseHealth?.hasActiveLease),
    staleThresholdMs: input.staleThresholdMs,
  });
  const matchingWorker = selectProviderWorkerForBusiness({
    businessId: input.businessId,
    activeLeaseOwner: leaseHealth?.activeLeaseOwner ?? null,
    workers: health?.workers,
  });
  return {
    providerScope: input.providerScope,
    workerHealthy: evaluated.workerHealthy,
    heartbeatAgeMs: evaluated.heartbeatAgeMs,
    runnerLeaseActive: evaluated.runnerLeaseActive,
    hasFreshHeartbeat: evaluated.hasFreshHeartbeat,
    ownerWorkerId: leaseHealth?.activeLeaseOwner ?? null,
    lastHeartbeatAt: health?.lastHeartbeatAt ?? null,
    latestLeaseUpdatedAt: leaseHealth?.latestLeaseUpdatedAt ?? null,
    workerFreshnessState: matchingWorker?.workerFreshnessState ?? null,
    currentBusinessId:
      matchingWorker?.metaJson && typeof matchingWorker.metaJson.currentBusinessId === "string"
        ? matchingWorker.metaJson.currentBusinessId
        : matchingWorker?.lastConsumedBusinessId ?? null,
    lastConsumedBusinessId: matchingWorker?.lastConsumedBusinessId ?? null,
    consumeStage:
      matchingWorker?.metaJson && typeof matchingWorker.metaJson.consumeStage === "string"
        ? matchingWorker.metaJson.consumeStage
        : null,
    batchBusinessIds: getMetaBusinessIds(matchingWorker?.metaJson ?? null),
    workerMeta: matchingWorker?.metaJson ?? null,
  };
}

export async function recordSyncReclaimEvents(input: {
  providerScope: string;
  businessId: string;
  partitionIds: string[];
  checkpointScope?: string | null;
  eventType: "reclaimed" | "poisoned";
  disposition?: ProviderReclaimDisposition | null;
  reasonCode?: ProviderReclaimReasonCode | null;
  detail?: string | null;
}) {
  if (input.partitionIds.length === 0) return;
  await runMigrations();
  const sql = getDb();
  for (const partitionId of input.partitionIds) {
    await sql`
      INSERT INTO sync_reclaim_events (
        provider_scope,
        business_id,
        partition_id,
        checkpoint_scope,
        event_type,
        disposition,
        reason_code,
        detail
      )
      VALUES (
        ${input.providerScope},
        ${input.businessId},
        ${partitionId},
        ${input.checkpointScope ?? null},
        ${input.eventType},
        ${input.disposition ?? null},
        ${input.reasonCode ?? null},
        ${input.detail ?? null}
      )
    `;
  }
}
