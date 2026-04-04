import { loadEnvConfig } from "@next/env";
import { getDb } from "@/lib/db";

loadEnvConfig(process.cwd());

type ReportRow = Record<string, unknown>;

function normalizeTimestamp(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

async function main() {
  const businessId = process.argv[2]?.trim() || null;
  const sql = getDb();

  const [groupedRows, sampleRows, workerRows, latestRows] = (await Promise.all([
    sql`
      WITH leaked AS (
        SELECT
          partition.id AS partition_id,
          partition.status AS partition_status,
          run.id AS run_id,
          run.lane,
          run.scope,
          CASE
            WHEN run.meta_json->'runLeakObservability'->>'callerRunIdMatchedLatestRunningRunId' = 'true'
              THEN 'matched'
            WHEN run.meta_json->'runLeakObservability'->>'callerRunIdMatchedLatestRunningRunId' = 'false'
              THEN 'mismatched'
            ELSE 'unknown'
          END AS caller_run_id_match_bucket
        FROM meta_sync_runs run
        JOIN meta_sync_partitions partition
          ON partition.id = run.partition_id
        WHERE run.status = 'running'
          AND partition.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
          AND (${businessId}::uuid IS NULL OR partition.business_id = ${businessId}::uuid)
      )
      SELECT
        lane,
        scope,
        caller_run_id_match_bucket,
        COUNT(*)::int AS row_count
      FROM leaked
      GROUP BY lane, scope, caller_run_id_match_bucket
      ORDER BY lane, scope, caller_run_id_match_bucket
    `,
    sql`
      SELECT
        partition.id AS partition_id,
        partition.status AS partition_status,
        partition.finished_at AS partition_finished_at,
        run.id AS run_id,
        run.worker_id,
        run.lane,
        run.scope,
        run.created_at AS run_created_at,
        run.updated_at AS run_updated_at,
        run.meta_json->'runLeakObservability'->>'callerRunId' AS caller_run_id,
        run.meta_json->'runLeakObservability'->>'recoveredRunId' AS recovered_run_id,
        run.meta_json->'runLeakObservability'->>'latestRunningRunId' AS latest_running_run_id,
        run.meta_json->'runLeakObservability'->>'callerRunIdMatchedLatestRunningRunId'
          AS caller_run_id_matched_latest_running_run_id,
        run.meta_json->'runLeakObservability'->>'pathKind' AS path_kind,
        run.meta_json->'runLeakObservability'->>'partitionStatus' AS observed_partition_status,
        run.meta_json->'runLeakObservability'->>'runStatusBefore' AS observed_run_status_before,
        run.meta_json->'runLeakObservability'->>'runStatusAfter' AS observed_run_status_after,
        run.meta_json->'runLeakObservability'->>'observedAt' AS observed_at
      FROM meta_sync_runs run
      JOIN meta_sync_partitions partition
        ON partition.id = run.partition_id
      WHERE run.status = 'running'
        AND partition.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
        AND (${businessId}::uuid IS NULL OR partition.business_id = ${businessId}::uuid)
      ORDER BY run.updated_at DESC
      LIMIT 20
    `,
    sql`
      SELECT
        partition.status AS partition_status,
        run.worker_id,
        COUNT(*)::int AS row_count,
        MAX(run.updated_at) AS latest_run_updated_at
      FROM meta_sync_runs run
      JOIN meta_sync_partitions partition
        ON partition.id = run.partition_id
      WHERE run.status = 'running'
        AND partition.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
        AND (${businessId}::uuid IS NULL OR partition.business_id = ${businessId}::uuid)
      GROUP BY partition.status, run.worker_id
      ORDER BY row_count DESC, partition.status, run.worker_id
    `,
    sql`
      SELECT
        partition.id AS partition_id,
        partition.status AS partition_status,
        partition.lane,
        partition.scope,
        partition.finished_at AS partition_finished_at,
        run.id AS run_id,
        run.worker_id,
        run.created_at AS run_created_at,
        run.updated_at AS run_updated_at
      FROM meta_sync_runs run
      JOIN meta_sync_partitions partition
        ON partition.id = run.partition_id
      WHERE run.status = 'running'
        AND partition.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
        AND (${businessId}::uuid IS NULL OR partition.business_id = ${businessId}::uuid)
      ORDER BY run.updated_at DESC
      LIMIT 20
    `,
  ])) as [ReportRow[], ReportRow[], ReportRow[], ReportRow[]];

  console.log(
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        businessId,
        groupedByLaneScopeAndCallerRunIdMatch: groupedRows,
        sampleRows: sampleRows.map((row) => ({
          ...row,
          partition_finished_at: normalizeTimestamp(row.partition_finished_at),
          run_created_at: normalizeTimestamp(row.run_created_at),
          run_updated_at: normalizeTimestamp(row.run_updated_at),
          observed_at: normalizeTimestamp(row.observed_at),
        })),
        groupedByWorkerAndParentStatus: workerRows.map((row) => ({
          ...row,
          latest_run_updated_at: normalizeTimestamp(row.latest_run_updated_at),
        })),
        latestRows: latestRows.map((row) => ({
          ...row,
          partition_finished_at: normalizeTimestamp(row.partition_finished_at),
          run_created_at: normalizeTimestamp(row.run_created_at),
          run_updated_at: normalizeTimestamp(row.run_updated_at),
        })),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
