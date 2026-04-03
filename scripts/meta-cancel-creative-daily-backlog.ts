import { loadEnvConfig } from "@next/env";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

loadEnvConfig(process.cwd());

const REASON =
  "creative_daily sync disabled after moving creative scoring to the live/snapshot path";

async function main() {
  const businessId = process.argv[2]?.trim() || null;

  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    WITH candidate_partitions AS (
      SELECT
        id,
        business_id,
        provider_account_id,
        status AS previous_status
      FROM meta_sync_partitions
      WHERE scope = 'creative_daily'
        AND (${businessId}::text IS NULL OR business_id = ${businessId})
        AND status IN ('queued', 'leased', 'running', 'failed', 'dead_letter')
    ),
    cancelled_partitions AS (
      UPDATE meta_sync_partitions partition
      SET
        status = 'cancelled',
        lease_owner = NULL,
        lease_expires_at = NULL,
        next_retry_at = NULL,
        last_error = COALESCE(partition.last_error, ${REASON}),
        finished_at = COALESCE(partition.finished_at, now()),
        updated_at = now()
      FROM candidate_partitions candidate
      WHERE partition.id = candidate.id
      RETURNING
        partition.id,
        candidate.business_id,
        candidate.provider_account_id,
        candidate.previous_status
    ),
    terminated_checkpoints AS (
      UPDATE meta_sync_checkpoints checkpoint
      SET
        status = CASE
          WHEN partition.status = 'succeeded' THEN 'succeeded'
          ELSE 'cancelled'
        END,
        finished_at = COALESCE(checkpoint.finished_at, now()),
        updated_at = now()
      FROM meta_sync_partitions partition
      WHERE checkpoint.partition_id = partition.id
        AND checkpoint.checkpoint_scope = 'creative_daily'
        AND (${businessId}::text IS NULL OR checkpoint.business_id = ${businessId})
        AND checkpoint.status IN ('pending', 'running')
        AND partition.status IN ('succeeded', 'cancelled')
      RETURNING checkpoint.id
    ),
    cancelled_runs AS (
      UPDATE meta_sync_runs run
      SET
        status = 'cancelled',
        error_class = COALESCE(run.error_class, 'deprecated_scope'),
        error_message = COALESCE(run.error_message, ${REASON}),
        finished_at = COALESCE(run.finished_at, now()),
        duration_ms = COALESCE(
          run.duration_ms,
          GREATEST(
            0,
            FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(run.started_at, run.updated_at, now()))) * 1000)
          )::int
        ),
        updated_at = now()
      FROM cancelled_partitions partition
      WHERE run.partition_id = partition.id
        AND run.status = 'running'
      RETURNING run.id
    ),
    grouped AS (
      SELECT
        business_id,
        provider_account_id,
        previous_status,
        COUNT(*)::int AS cancelled_partition_count
      FROM cancelled_partitions
      GROUP BY business_id, provider_account_id, previous_status
    )
    SELECT json_build_object(
      'businessId', ${businessId}::text,
      'cancelledPartitions', COALESCE((SELECT SUM(cancelled_partition_count)::int FROM grouped), 0),
      'terminatedCheckpoints', (SELECT COUNT(*)::int FROM terminated_checkpoints),
      'cancelledRuns', (SELECT COUNT(*)::int FROM cancelled_runs),
      'byAccountAndStatus', COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'businessId', business_id,
              'providerAccountId', provider_account_id,
              'previousStatus', previous_status,
              'count', cancelled_partition_count
            )
            ORDER BY business_id, provider_account_id, previous_status
          )
          FROM grouped
        ),
        '[]'::json
      ),
      'remainingActiveCreativeDailyPartitions',
      (
        SELECT COUNT(*)::int
        FROM meta_sync_partitions
        WHERE scope = 'creative_daily'
          AND (${businessId}::text IS NULL OR business_id = ${businessId})
          AND status IN ('queued', 'leased', 'running', 'failed', 'dead_letter')
      ),
      'remainingRunningCreativeDailyCheckpoints',
      (
        SELECT COUNT(*)::int
        FROM meta_sync_checkpoints
        WHERE checkpoint_scope = 'creative_daily'
          AND (${businessId}::text IS NULL OR business_id = ${businessId})
          AND status IN ('pending', 'running')
      )
    ) AS summary
  ` as Array<{ summary: unknown }>;

  console.log(JSON.stringify(rows[0]?.summary ?? null, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
