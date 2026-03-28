import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface SyncRetentionSummary {
  googleRawSnapshotsDeleted: number;
  googleCheckpointsDeleted: number;
  metaRawSnapshotsDeleted: number;
  metaCheckpointsDeleted: number;
  reclaimEventsDeleted: number;
}

async function execCount(query: Promise<unknown>) {
  const rows = await query;
  const first = Array.isArray(rows) ? rows[0] : null;
  const raw = (first as { count?: number | string } | undefined)?.count ?? 0;
  const count = typeof raw === "string" ? Number(raw) : Number(raw);
  return Number.isFinite(count) ? count : 0;
}

export async function pruneSyncLifecycleData(input?: {
  rawRetentionDays?: number;
  checkpointRetentionDays?: number;
  reclaimEventRetentionDays?: number;
}) {
  await runMigrations();
  const sql = getDb();
  const rawRetentionDays = input?.rawRetentionDays ?? envNumber("SYNC_RAW_RETENTION_DAYS", 7);
  const checkpointRetentionDays =
    input?.checkpointRetentionDays ?? envNumber("SYNC_CHECKPOINT_RETENTION_DAYS", 14);
  const reclaimEventRetentionDays =
    input?.reclaimEventRetentionDays ?? envNumber("SYNC_RECLAIM_EVENT_RETENTION_DAYS", 30);

  const googleRawSnapshotsDeleted = await execCount(sql`
    WITH deleted AS (
      DELETE FROM google_ads_raw_snapshots snapshot
      USING google_ads_sync_partitions partition
      WHERE snapshot.partition_id = partition.id
        AND partition.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
        AND snapshot.fetched_at < now() - (${String(rawRetentionDays)} || ' days')::interval
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM deleted
  `);

  const metaRawSnapshotsDeleted = await execCount(sql`
    WITH deleted AS (
      DELETE FROM meta_raw_snapshots snapshot
      USING meta_sync_partitions partition
      WHERE snapshot.partition_id = partition.id
        AND partition.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
        AND snapshot.fetched_at < now() - (${String(rawRetentionDays)} || ' days')::interval
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM deleted
  `);

  const googleCheckpointsDeleted = await execCount(sql`
    WITH deleted AS (
      DELETE FROM google_ads_sync_checkpoints checkpoint
      USING google_ads_sync_partitions partition
      WHERE checkpoint.partition_id = partition.id
        AND partition.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
        AND checkpoint.updated_at < now() - (${String(checkpointRetentionDays)} || ' days')::interval
        AND NOT EXISTS (
          SELECT 1
          FROM google_ads_raw_snapshots snapshot
          WHERE snapshot.checkpoint_id = checkpoint.id
        )
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM deleted
  `);

  const metaCheckpointsDeleted = await execCount(sql`
    WITH deleted AS (
      DELETE FROM meta_sync_checkpoints checkpoint
      USING meta_sync_partitions partition
      WHERE checkpoint.partition_id = partition.id
        AND partition.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
        AND checkpoint.updated_at < now() - (${String(checkpointRetentionDays)} || ' days')::interval
        AND NOT EXISTS (
          SELECT 1
          FROM meta_raw_snapshots snapshot
          WHERE snapshot.checkpoint_id = checkpoint.id
        )
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM deleted
  `);

  const reclaimEventsDeleted = await execCount(sql`
    WITH deleted AS (
      DELETE FROM sync_reclaim_events
      WHERE created_at < now() - (${String(reclaimEventRetentionDays)} || ' days')::interval
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM deleted
  `);

  return {
    googleRawSnapshotsDeleted,
    googleCheckpointsDeleted,
    metaRawSnapshotsDeleted,
    metaCheckpointsDeleted,
    reclaimEventsDeleted,
  } satisfies SyncRetentionSummary;
}
