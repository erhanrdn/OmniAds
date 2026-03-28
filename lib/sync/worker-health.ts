import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

function normalizeTimestamp(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  const parsed = new Date(text);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  return text;
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

export async function getSyncWorkerHealthSummary() {
  await runMigrations();
  const sql = getDb();
  const [summaryRows, workerRows] = await Promise.all([
    sql`
      SELECT
        COUNT(*) FILTER (WHERE last_heartbeat_at > now() - interval '2 minutes')::int AS online_workers,
        COUNT(*)::int AS worker_instances,
        MAX(last_heartbeat_at) AS last_heartbeat_at
      FROM sync_worker_heartbeats
    ` as Promise<Array<Record<string, unknown>>>,
    sql`
      SELECT
        worker_id,
        instance_type,
        provider_scope,
        status,
        last_heartbeat_at,
        last_business_id,
        last_partition_id
      FROM sync_worker_heartbeats
      ORDER BY last_heartbeat_at DESC
    ` as Promise<Array<Record<string, unknown>>>,
  ]);
  const summary = summaryRows[0] ?? {};
  return {
    onlineWorkers: Number(summary.online_workers ?? 0),
    workerInstances: Number(summary.worker_instances ?? 0),
    lastHeartbeatAt: normalizeTimestamp(summary.last_heartbeat_at),
    workers: workerRows.map((row) => ({
      workerId: String(row.worker_id),
      instanceType: String(row.instance_type),
      providerScope: String(row.provider_scope),
      status: String(row.status),
      lastHeartbeatAt: normalizeTimestamp(row.last_heartbeat_at),
      lastBusinessId: row.last_business_id ? String(row.last_business_id) : null,
      lastPartitionId: row.last_partition_id ? String(row.last_partition_id) : null,
    })),
  };
}
