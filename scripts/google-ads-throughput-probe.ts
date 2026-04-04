import { writeFile } from "node:fs/promises";
import { getDb } from "@/lib/db";
import { configureOperationalScriptRuntime } from "./_operational-runtime";

type ProbeArgs = {
  outPath: string | null;
};

function parseArgs(argv: string[]): ProbeArgs {
  let outPath: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if ((current === "--out" || current === "-o") && argv[index + 1]) {
      outPath = argv[index + 1] ?? null;
      index += 1;
    }
  }

  return { outPath };
}

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

type CountRow = { count: unknown };
type ThroughputRow = {
  scope: unknown;
  succeeded_partition_count: unknown;
  run_count: unknown;
  median_run_duration_ms: unknown;
  p95_run_duration_ms: unknown;
};
type SignalRow = Record<string, unknown>;
type HeartbeatRow = Record<string, unknown>;

async function main() {
  configureOperationalScriptRuntime();
  const args = parseArgs(process.argv.slice(2));
  const sql = getDb();
  const businesses = [
    ["Grandmix", "5dbc7147-f051-4681-a4d6-20617170074f"],
    ["IwaStore", "f8a3b5ac-588c-462f-8702-11cd24ff3cd2"],
    ["TheSwaf", "172d0ab8-495b-4679-a4c6-ffa404c389d3"],
  ] as const;

  const payload = {
    capturedAt: new Date().toISOString(),
    businesses: {} as Record<
      string,
      {
        businessId: string;
        runningRunsUnderTerminalParents: number;
        terminalParentRunningCheckpoints: number;
        duplicateRunningRunsPerPartition: number;
        staleRunningPartitions: number;
        staleRunningCheckpoints: number;
        throughputByScope: Array<{
          scope: string;
          succeededPartitionCount: number;
          runCount: number;
          medianRunDurationMs: number | null;
          p95RunDurationMs: number | null;
        }>;
      }
    >,
    workerHeartbeat: [] as Array<Record<string, unknown>>,
    recentSignals: [] as Array<Record<string, unknown>>,
  };

  for (const [label, businessId] of businesses) {
    const [
      runningUnderTerminal,
      terminalCheckpoints,
      duplicateRuns,
      stalePartitions,
      staleCheckpoints,
      throughputRows,
    ] = await Promise.all([
      sql`
        SELECT COUNT(*)::int AS count
        FROM google_ads_sync_runs run
        JOIN google_ads_sync_partitions partition ON partition.id = run.partition_id
        WHERE run.business_id = ${businessId}
          AND run.status = 'running'
          AND partition.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
      `,
      sql`
        SELECT COUNT(*)::int AS count
        FROM google_ads_sync_checkpoints checkpoint
        JOIN google_ads_sync_partitions partition ON partition.id = checkpoint.partition_id
        WHERE checkpoint.business_id = ${businessId}
          AND checkpoint.status = 'running'
          AND partition.status IN ('succeeded', 'failed', 'dead_letter', 'cancelled')
      `,
      sql`
        SELECT COUNT(*)::int AS count
        FROM (
          SELECT partition_id
          FROM google_ads_sync_runs
          WHERE business_id = ${businessId}
            AND status = 'running'
          GROUP BY partition_id
          HAVING COUNT(*) > 1
        ) duplicate_runs
      `,
      sql`
        SELECT COUNT(*)::int AS count
        FROM google_ads_sync_partitions
        WHERE business_id = ${businessId}
          AND status = 'running'
          AND updated_at < now() - interval '30 minutes'
      `,
      sql`
        SELECT COUNT(*)::int AS count
        FROM google_ads_sync_checkpoints
        WHERE business_id = ${businessId}
          AND status = 'running'
          AND updated_at < now() - interval '15 minutes'
      `,
      sql`
        WITH recent_partitions AS (
          SELECT scope, business_id, status
          FROM google_ads_sync_partitions
          WHERE business_id = ${businessId}
            AND finished_at >= now() - interval '2 hours'
        ),
        recent_runs AS (
          SELECT scope, business_id, duration_ms
          FROM google_ads_sync_runs
          WHERE business_id = ${businessId}
            AND finished_at >= now() - interval '2 hours'
            AND duration_ms IS NOT NULL
        )
        SELECT
          scope,
          COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded_partition_count,
          COUNT(recent_runs.duration_ms)::int AS run_count,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY recent_runs.duration_ms) AS median_run_duration_ms,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY recent_runs.duration_ms) AS p95_run_duration_ms
        FROM recent_partitions
        LEFT JOIN recent_runs USING (scope, business_id)
        GROUP BY scope
        ORDER BY scope
      `,
    ]);
    const runningUnderTerminalRows = runningUnderTerminal as CountRow[];
    const terminalCheckpointRows = terminalCheckpoints as CountRow[];
    const duplicateRunRows = duplicateRuns as CountRow[];
    const stalePartitionRows = stalePartitions as CountRow[];
    const staleCheckpointRows = staleCheckpoints as CountRow[];
    const throughputResultRows = throughputRows as ThroughputRow[];

    payload.businesses[label] = {
      businessId,
      runningRunsUnderTerminalParents: toNumber(
        runningUnderTerminalRows[0]?.count,
      ),
      terminalParentRunningCheckpoints: toNumber(
        terminalCheckpointRows[0]?.count,
      ),
      duplicateRunningRunsPerPartition: toNumber(duplicateRunRows[0]?.count),
      staleRunningPartitions: toNumber(stalePartitionRows[0]?.count),
      staleRunningCheckpoints: toNumber(staleCheckpointRows[0]?.count),
      throughputByScope: throughputResultRows.map((row) => ({
        scope: String(row.scope),
        succeededPartitionCount: toNumber(row.succeeded_partition_count),
        runCount: toNumber(row.run_count),
        medianRunDurationMs:
          row.median_run_duration_ms == null
            ? null
            : toNumber(row.median_run_duration_ms),
        p95RunDurationMs:
          row.p95_run_duration_ms == null
            ? null
            : toNumber(row.p95_run_duration_ms),
      })),
    };
  }

  payload.workerHeartbeat = (await sql`
    SELECT
      worker_id,
      provider_scope,
      status,
      last_business_id,
      last_heartbeat_at,
      ROUND(EXTRACT(EPOCH FROM (now() - last_heartbeat_at)) / 60.0, 2) AS heartbeat_age_minutes
    FROM sync_worker_heartbeats
    WHERE provider_scope IN ('google_ads', 'all')
    ORDER BY last_heartbeat_at DESC
    LIMIT 4
  `) as HeartbeatRow[];

  payload.recentSignals = (await sql`
    WITH recent_runs AS (
      SELECT updated_at, error_class, error_message, meta_json
      FROM google_ads_sync_runs
      WHERE updated_at >= now() - interval '2 hours'
    ),
    classified AS (
      SELECT
        CASE
          WHEN COALESCE(error_class, '') = 'lease_conflict'
            OR COALESCE(error_message, '') ILIKE '%lost ownership before%'
            OR COALESCE(error_message, '') ILIKE '%superseded by a newer worker%'
            THEN 'lease_conflict_or_completion_denied'
          WHEN COALESCE(error_class, '') = 'stale_run'
            OR COALESCE(meta_json->>'closureReason', '') = 'lane_stale_threshold_exceeded'
            THEN 'stale_auto_close'
          WHEN COALESCE(meta_json->>'decisionCaller', '') IN (
            'cleanupGoogleAdsPartitionOrchestration',
            'backfillGoogleAdsRunningRunsForTerminalPartition'
          )
            THEN 'cleanup_or_repair_closure'
          ELSE NULL
        END AS signal_class,
        updated_at
      FROM recent_runs
    )
    SELECT signal_class, COUNT(*)::int AS count, MAX(updated_at) AS latest_seen_at
    FROM classified
    WHERE signal_class IS NOT NULL
    GROUP BY signal_class
    ORDER BY count DESC, latest_seen_at DESC
  `) as SignalRow[];

  const text = JSON.stringify(payload, null, 2);
  if (args.outPath) {
    await writeFile(args.outPath, text, "utf8");
  }
  process.stdout.write(text);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
