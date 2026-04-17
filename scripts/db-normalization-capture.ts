import path from "node:path";
import { spawnSync } from "node:child_process";
import { getDbRuntimeDiagnostics, getDbWithTimeout } from "@/lib/db";
import {
  buildNormalizationRunDir,
  captureHostMemorySnapshot,
  getOptionalCliValue,
  loadTrackedTablesFromBaselineSql,
  normalizeDate,
  normalizeTimestamp,
  parseCliArgs,
  runTsxScriptJson,
  splitSqlStatements,
  writeJsonFile,
} from "./db-normalization-support";
import { configureOperationalScriptRuntime, withOperationalStartupLogsSilenced } from "./_operational-runtime";

type BenchmarkBusinessSelection = {
  primaryBusinessId: string | null;
  primaryBusinessName: string | null;
  strategy: "all_providers" | "best_effort" | "none";
  metaBusinessId: string | null;
  googleBusinessId: string | null;
  shopifyBusinessId: string | null;
  range30Start: string | null;
  range30End: string | null;
  range90Start: string | null;
  range90End: string | null;
};

type ReadExplainPlanSummary = {
  name: string;
  planningTimeMs: number | null;
  executionTimeMs: number | null;
  sharedHitBlocks: number | null;
  sharedReadBlocks: number | null;
  planRows: number | null;
  totalCost: number | null;
  error?: string | null;
};

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function describeScenarioError(error: unknown) {
  if (error instanceof Error) {
    return error.message.replace(/\s+/g, " ").trim();
  }
  return String(error).replace(/\s+/g, " ").trim();
}

function buildArtifactPath(baseDir: string, fileName: string) {
  return path.join(baseDir, fileName);
}

async function captureOptionalBackupSnapshot(command: string | null) {
  if (!command) return null;
  const result = spawnSync(command, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    shell: true,
  });
  return {
    command,
    ok: result.status === 0,
    exitCode: result.status,
    stdout: result.stdout?.trim() || null,
    stderr: result.stderr?.trim() || null,
  };
}

async function selectBenchmarkBusiness() {
  const sql = getDbWithTimeout(60_000);
  const rows = await sql.query<Record<string, unknown>>(
    `
      WITH meta_stats AS (
        SELECT business_id, COUNT(*)::bigint AS row_count, MAX(date)::date AS latest_date
        FROM meta_account_daily
        GROUP BY business_id
      ),
      google_stats AS (
        SELECT business_id, COUNT(*)::bigint AS row_count, MAX(date)::date AS latest_date
        FROM google_ads_account_daily
        GROUP BY business_id
      ),
      shopify_stats AS (
        SELECT business_id, COUNT(*)::bigint AS row_count, MAX(COALESCE(order_created_date_local, order_created_at::date))::date AS latest_date
        FROM shopify_orders
        GROUP BY business_id
      )
      SELECT
        b.id::text AS business_id,
        b.name AS business_name,
        COALESCE(meta_stats.row_count, 0) AS meta_rows,
        meta_stats.latest_date::text AS meta_latest_date,
        COALESCE(google_stats.row_count, 0) AS google_rows,
        google_stats.latest_date::text AS google_latest_date,
        COALESCE(shopify_stats.row_count, 0) AS shopify_rows,
        shopify_stats.latest_date::text AS shopify_latest_date
      FROM businesses b
      LEFT JOIN meta_stats ON meta_stats.business_id = b.id::text
      LEFT JOIN google_stats ON google_stats.business_id = b.id::text
      LEFT JOIN shopify_stats ON shopify_stats.business_id = b.id::text
      ORDER BY
        LEAST(
          CASE WHEN meta_stats.row_count IS NULL THEN 0 ELSE meta_stats.row_count END,
          CASE WHEN google_stats.row_count IS NULL THEN 0 ELSE google_stats.row_count END,
          CASE WHEN shopify_stats.row_count IS NULL THEN 0 ELSE shopify_stats.row_count END
        ) DESC,
        (COALESCE(meta_stats.row_count, 0) + COALESCE(google_stats.row_count, 0) + COALESCE(shopify_stats.row_count, 0)) DESC,
        b.id ASC
    `,
  );

  const normalizedRows = rows.map((row) => ({
    businessId: String(row.business_id ?? ""),
    businessName: String(row.business_name ?? ""),
    metaRows: toNumber(row.meta_rows),
    metaLatestDate: normalizeDate(row.meta_latest_date),
    googleRows: toNumber(row.google_rows),
    googleLatestDate: normalizeDate(row.google_latest_date),
    shopifyRows: toNumber(row.shopify_rows),
    shopifyLatestDate: normalizeDate(row.shopify_latest_date),
  }));

  const allProviderCandidate =
    normalizedRows.find((row) => row.metaRows > 0 && row.googleRows > 0 && row.shopifyRows > 0) ?? null;
  const bestEffortCandidate =
    allProviderCandidate ??
    normalizedRows.find((row) => row.metaRows + row.googleRows + row.shopifyRows > 0) ??
    null;

  const metaBusinessId =
    normalizedRows
      .filter((row) => row.metaRows > 0)
      .sort((left, right) => right.metaRows - left.metaRows)[0]?.businessId ?? null;
  const googleBusinessId =
    normalizedRows
      .filter((row) => row.googleRows > 0)
      .sort((left, right) => right.googleRows - left.googleRows)[0]?.businessId ?? null;
  const shopifyBusinessId =
    normalizedRows
      .filter((row) => row.shopifyRows > 0)
      .sort((left, right) => right.shopifyRows - left.shopifyRows)[0]?.businessId ?? null;

  const selected = bestEffortCandidate;
  if (!selected) {
    return {
      primaryBusinessId: null,
      primaryBusinessName: null,
      strategy: "none",
      metaBusinessId,
      googleBusinessId,
      shopifyBusinessId,
      range30Start: null,
      range30End: null,
      range90Start: null,
      range90End: null,
    } satisfies BenchmarkBusinessSelection;
  }

  const candidateDates = [
    selected.metaLatestDate,
    selected.googleLatestDate,
    selected.shopifyLatestDate,
  ].filter((value): value is string => Boolean(value));
  const range90End = candidateDates.sort()[0] ?? null;
  if (!range90End) {
    return {
      primaryBusinessId: selected.businessId,
      primaryBusinessName: selected.businessName,
      strategy: allProviderCandidate ? "all_providers" : "best_effort",
      metaBusinessId,
      googleBusinessId,
      shopifyBusinessId,
      range30Start: null,
      range30End: null,
      range90Start: null,
      range90End: null,
    } satisfies BenchmarkBusinessSelection;
  }

  const range90StartDate = new Date(`${range90End}T00:00:00Z`);
  range90StartDate.setUTCDate(range90StartDate.getUTCDate() - 89);
  const range30StartDate = new Date(`${range90End}T00:00:00Z`);
  range30StartDate.setUTCDate(range30StartDate.getUTCDate() - 29);

  return {
    primaryBusinessId: selected.businessId,
    primaryBusinessName: selected.businessName,
    strategy: allProviderCandidate ? "all_providers" : "best_effort",
    metaBusinessId,
    googleBusinessId,
    shopifyBusinessId,
    range30Start: range30StartDate.toISOString().slice(0, 10),
    range30End: range90End,
    range90Start: range90StartDate.toISOString().slice(0, 10),
    range90End,
  } satisfies BenchmarkBusinessSelection;
}

async function captureExplainPlan(name: string, queryText: string, params: unknown[]) {
  const sql = getDbWithTimeout(60_000);
  try {
    const rows = await sql.query<{ "QUERY PLAN": unknown }>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${queryText}`,
      params,
    );
    const envelope = rows[0]?.["QUERY PLAN"] as Array<Record<string, unknown>> | undefined;
    const root = envelope?.[0] ?? {};
    const plan = (root.Plan ?? {}) as Record<string, unknown>;
    return {
      name,
      planningTimeMs:
        typeof root["Planning Time"] === "number" ? Number(root["Planning Time"].toFixed(2)) : null,
      executionTimeMs:
        typeof root["Execution Time"] === "number" ? Number(root["Execution Time"].toFixed(2)) : null,
      sharedHitBlocks: toNumber(plan["Shared Hit Blocks"] ?? root["Shared Hit Blocks"]) || null,
      sharedReadBlocks: toNumber(plan["Shared Read Blocks"] ?? root["Shared Read Blocks"]) || null,
      planRows: toNumber(plan["Plan Rows"]) || null,
      totalCost: toNumber(plan["Total Cost"]) || null,
    } satisfies ReadExplainPlanSummary;
  } catch (error) {
    return {
      name,
      planningTimeMs: null,
      executionTimeMs: null,
      sharedHitBlocks: null,
      sharedReadBlocks: null,
      planRows: null,
      totalCost: null,
      error: describeScenarioError(error),
    } satisfies ReadExplainPlanSummary;
  }
}

async function captureReadExplainPlans(selection: BenchmarkBusinessSelection) {
  if (!selection.primaryBusinessId || !selection.range30Start || !selection.range30End) {
    return [];
  }

  const businessId = selection.primaryBusinessId;
  const startDate = selection.range30Start;
  const endDate = selection.range30End;

  return [
    await captureExplainPlan(
      "projection_overview_30d",
      `
        SELECT date::date, SUM(spend)::numeric, SUM(revenue)::numeric, SUM(purchases)::numeric
        FROM platform_overview_daily_summary
        WHERE business_id = $1
          AND date >= $2::date
          AND date <= $3::date
        GROUP BY date
        ORDER BY date
      `,
      [businessId, startDate, endDate],
    ),
    await captureExplainPlan(
      "meta_account_daily_30d",
      `
        SELECT date::date, SUM(spend)::numeric, SUM(revenue)::numeric, SUM(conversions)::numeric
        FROM meta_account_daily
        WHERE business_id = $1
          AND date >= $2::date
          AND date <= $3::date
        GROUP BY date
        ORDER BY date
      `,
      [businessId, startDate, endDate],
    ),
    await captureExplainPlan(
      "google_account_daily_30d",
      `
        SELECT date::date, SUM(spend)::numeric, SUM(revenue)::numeric, SUM(conversions)::numeric
        FROM google_ads_account_daily
        WHERE business_id = $1
          AND date >= $2::date
          AND date <= $3::date
        GROUP BY date
        ORDER BY date
      `,
      [businessId, startDate, endDate],
    ),
    await captureExplainPlan(
      "shopify_orders_30d",
      `
        SELECT COALESCE(order_created_date_local, order_created_at::date) AS day,
               SUM(total_price)::numeric,
               COUNT(*)::bigint
        FROM shopify_orders
        WHERE business_id = $1
          AND COALESCE(order_created_date_local, order_created_at::date) >= $2::date
          AND COALESCE(order_created_date_local, order_created_at::date) <= $3::date
        GROUP BY day
        ORDER BY day
      `,
      [businessId, startDate, endDate],
    ),
  ];
}

async function captureDatabaseState(trackedTables: Array<{ family: string; tableName: string }>) {
  const sql = getDbWithTimeout(60_000);
  const tableNames = trackedTables.map((entry) => entry.tableName);

  const [
    configRows,
    databaseSizeRows,
    relationSizeRows,
    tableStatsRows,
    indexStatsRows,
    cacheHitRows,
    pgActivityRows,
    longTransactionRows,
    blockedLockRows,
    pgStatStatementsEnabledRows,
    columnShapeRows,
  ] = await Promise.all([
    sql.query(
      `
        SELECT
          name,
          setting,
          unit,
          short_desc,
          source
        FROM pg_settings
        WHERE name = ANY($1::text[])
        ORDER BY name
      `,
      [[
        "shared_buffers",
        "effective_cache_size",
        "work_mem",
        "maintenance_work_mem",
        "max_connections",
        "checkpoint_timeout",
        "max_wal_size",
        "shared_preload_libraries",
        "autovacuum",
        "autovacuum_naptime",
        "autovacuum_vacuum_scale_factor",
        "autovacuum_analyze_scale_factor",
      ]],
    ),
    sql.query(
      `
        SELECT
          current_database() AS database_name,
          pg_database_size(current_database())::bigint AS database_size_bytes
      `,
    ),
    sql.query(
      `
        SELECT
          c.relname AS table_name,
          pg_relation_size(c.oid)::bigint AS table_size_bytes,
          (pg_total_relation_size(c.oid) - pg_relation_size(c.oid))::bigint AS index_size_bytes,
          pg_total_relation_size(c.oid)::bigint AS total_size_bytes
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relname = ANY($1::text[])
        ORDER BY pg_total_relation_size(c.oid) DESC, c.relname ASC
      `,
      [tableNames],
    ),
    sql.query(
      `
        SELECT
          relname AS table_name,
          n_live_tup::bigint AS live_rows,
          n_dead_tup::bigint AS dead_rows,
          seq_scan::bigint,
          seq_tup_read::bigint,
          idx_scan::bigint,
          idx_tup_fetch::bigint,
          last_analyze,
          last_autoanalyze,
          last_vacuum,
          last_autovacuum
        FROM pg_stat_user_tables
        WHERE relname = ANY($1::text[])
        ORDER BY relname ASC
      `,
      [tableNames],
    ),
    sql.query(
      `
        SELECT
          table_stat.relname AS table_name,
          index_stat.indexrelname AS index_name,
          index_stat.idx_scan::bigint AS idx_scan,
          pg_relation_size(index_stat.indexrelid)::bigint AS index_size_bytes
        FROM pg_stat_user_indexes index_stat
        JOIN pg_stat_user_tables table_stat
          ON table_stat.relid = index_stat.relid
        WHERE table_stat.relname = ANY($1::text[])
        ORDER BY table_stat.relname ASC, index_stat.idx_scan DESC, index_stat.indexrelname ASC
      `,
      [tableNames],
    ),
    sql.query(
      `
        SELECT
          relname AS table_name,
          heap_blks_read::bigint,
          heap_blks_hit::bigint,
          idx_blks_read::bigint,
          idx_blks_hit::bigint
        FROM pg_statio_user_tables
        WHERE relname = ANY($1::text[])
        ORDER BY relname ASC
      `,
      [tableNames],
    ),
    sql.query(
      `
        SELECT
          COALESCE(application_name, '') AS application_name,
          COALESCE(state, 'unknown') AS state,
          COALESCE(wait_event_type, '') AS wait_event_type,
          COALESCE(wait_event, '') AS wait_event,
          COUNT(*)::int AS connection_count
        FROM pg_stat_activity
        WHERE datname = current_database()
        GROUP BY application_name, state, wait_event_type, wait_event
        ORDER BY connection_count DESC, application_name ASC
      `,
    ),
    sql.query(
      `
        SELECT
          pid,
          COALESCE(application_name, '') AS application_name,
          state,
          now() - xact_start AS xact_age,
          now() - query_start AS query_age,
          COALESCE(wait_event_type, '') AS wait_event_type,
          COALESCE(wait_event, '') AS wait_event,
          LEFT(regexp_replace(query, '\\s+', ' ', 'g'), 220) AS query
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND xact_start IS NOT NULL
          AND now() - xact_start > interval '2 minutes'
        ORDER BY xact_start ASC
        LIMIT 20
      `,
    ),
    sql.query(
      `
        SELECT
          blocked_activity.pid AS blocked_pid,
          COALESCE(blocked_activity.application_name, '') AS blocked_application_name,
          blocker_activity.pid AS blocker_pid,
          COALESCE(blocker_activity.application_name, '') AS blocker_application_name,
          now() - blocked_activity.query_start AS blocked_query_age,
          LEFT(regexp_replace(blocked_activity.query, '\\s+', ' ', 'g'), 180) AS blocked_query,
          LEFT(regexp_replace(blocker_activity.query, '\\s+', ' ', 'g'), 180) AS blocker_query
        FROM pg_locks blocked_lock
        JOIN pg_stat_activity blocked_activity
          ON blocked_activity.pid = blocked_lock.pid
        JOIN pg_locks blocker_lock
          ON blocker_lock.locktype = blocked_lock.locktype
         AND blocker_lock.database IS NOT DISTINCT FROM blocked_lock.database
         AND blocker_lock.relation IS NOT DISTINCT FROM blocked_lock.relation
         AND blocker_lock.page IS NOT DISTINCT FROM blocked_lock.page
         AND blocker_lock.tuple IS NOT DISTINCT FROM blocked_lock.tuple
         AND blocker_lock.virtualxid IS NOT DISTINCT FROM blocked_lock.virtualxid
         AND blocker_lock.transactionid IS NOT DISTINCT FROM blocked_lock.transactionid
         AND blocker_lock.classid IS NOT DISTINCT FROM blocked_lock.classid
         AND blocker_lock.objid IS NOT DISTINCT FROM blocked_lock.objid
         AND blocker_lock.objsubid IS NOT DISTINCT FROM blocked_lock.objsubid
         AND blocker_lock.pid <> blocked_lock.pid
        JOIN pg_stat_activity blocker_activity
          ON blocker_activity.pid = blocker_lock.pid
        WHERE NOT blocked_lock.granted
          AND blocker_lock.granted
        ORDER BY blocked_activity.query_start ASC
        LIMIT 20
      `,
    ),
    sql.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM pg_extension
          WHERE extname = 'pg_stat_statements'
        ) AS enabled
      `,
    ),
    sql.query(
      `
        SELECT
          table_name,
          data_type,
          udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
      `,
    ),
  ]);

  const relationSizeByTable = new Map(
    (relationSizeRows as Array<Record<string, unknown>>).map((row) => [
      String(row.table_name ?? ""),
      row,
    ]),
  );
  const familySizeTotals = trackedTables.reduce<Record<string, { tableSizeBytes: number; indexSizeBytes: number; totalSizeBytes: number }>>(
    (accumulator, entry) => {
      const row = relationSizeByTable.get(entry.tableName);
      if (!accumulator[entry.family]) {
        accumulator[entry.family] = {
          tableSizeBytes: 0,
          indexSizeBytes: 0,
          totalSizeBytes: 0,
        };
      }
      accumulator[entry.family].tableSizeBytes += toNumber(row?.table_size_bytes);
      accumulator[entry.family].indexSizeBytes += toNumber(row?.index_size_bytes);
      accumulator[entry.family].totalSizeBytes += toNumber(row?.total_size_bytes);
      return accumulator;
    },
    {},
  );

  const columnFamilyByTable = new Map(
    trackedTables.map((entry) => [entry.tableName, entry.family] as const),
  );
  const columnShapeSummary = (columnShapeRows as Array<Record<string, unknown>>).reduce<
    Record<string, { jsonbColumns: number; textArrayColumns: number }>
  >((accumulator, row) => {
    const tableName = String(row.table_name ?? "");
    const family = columnFamilyByTable.get(tableName) ?? "untracked";
    if (!accumulator[family]) {
      accumulator[family] = { jsonbColumns: 0, textArrayColumns: 0 };
    }
    if (String(row.data_type ?? "").toLowerCase() === "jsonb") {
      accumulator[family].jsonbColumns += 1;
    }
    if (String(row.udt_name ?? "").toLowerCase() === "_text") {
      accumulator[family].textArrayColumns += 1;
    }
    return accumulator;
  }, {});

  let pgStatStatementsTop: Array<Record<string, unknown>> | null = null;
  const pgStatStatementsEnabled = Boolean(
    (pgStatStatementsEnabledRows as Array<Record<string, unknown>>)[0]?.enabled,
  );
  if (pgStatStatementsEnabled) {
    pgStatStatementsTop = await sql.query(
      `
        SELECT
          queryid::text AS query_id,
          calls::bigint AS calls,
          ROUND(total_exec_time::numeric, 2) AS total_exec_time_ms,
          ROUND(mean_exec_time::numeric, 2) AS mean_exec_time_ms,
          rows::bigint AS rows,
          shared_blks_hit::bigint AS shared_blks_hit,
          shared_blks_read::bigint AS shared_blks_read,
          LEFT(regexp_replace(query, '\\s+', ' ', 'g'), 220) AS query
        FROM pg_stat_statements
        ORDER BY total_exec_time DESC
        LIMIT 25
      `,
    ) as Array<Record<string, unknown>>;
  }

  return {
    runtime: getDbRuntimeDiagnostics(),
    postgresConfig: configRows,
    databaseSize: databaseSizeRows[0] ?? null,
    relationSizes: relationSizeRows,
    familySizeTotals,
    tableStats: tableStatsRows,
    indexStats: indexStatsRows,
    cacheHitStats: cacheHitRows,
    connectionSummary: pgActivityRows,
    longTransactions: longTransactionRows,
    blockedLocks: blockedLockRows,
    pgStatStatements: {
      enabled: pgStatStatementsEnabled,
      topQueries: pgStatStatementsTop,
    },
    columnShapeSummary,
  };
}

async function captureBaselineSqlResults(repoRoot: string) {
  const { sqlText } = loadTrackedTablesFromBaselineSql(repoRoot);
  const statements = splitSqlStatements(sqlText);
  const sql = getDbWithTimeout(60_000);
  const results = [];

  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index] ?? "";
    try {
      const rows = await sql.query(statement);
      results.push({
        index: index + 1,
        rowCount: rows.length,
        rows: rows.slice(0, 250),
        truncated: rows.length > 250,
      });
    } catch (error) {
      results.push({
        index: index + 1,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

async function main() {
  configureOperationalScriptRuntime();
  const parsed = parseCliArgs(process.argv.slice(2));
  const stage = getOptionalCliValue(parsed, "stage", "before") ?? "before";
  const runDir = buildNormalizationRunDir({
    runDir: getOptionalCliValue(parsed, "run-dir", null) ?? undefined,
  });
  const outDir =
    getOptionalCliValue(parsed, "out-dir", null) ??
    path.join(runDir, stage);
  const includeReadBenchmark = getOptionalCliValue(parsed, "include-read-benchmark", "true") !== "false";
  const includeWriteBenchmark = parsed.flags.has("include-write-benchmark") || getOptionalCliValue(parsed, "include-write-benchmark", "false") === "true";
  const backupCommand = getOptionalCliValue(parsed, "backup-command");
  const repoRoot = process.cwd();

  const capture = await withOperationalStartupLogsSilenced(async () => {
    const hostMemory = await captureHostMemorySnapshot();
    const { trackedTables } = loadTrackedTablesFromBaselineSql(repoRoot);
    const benchmarkSelection = await selectBenchmarkBusiness();
    const [databaseState, baselineSqlResults, backupSnapshot] = await Promise.all([
      captureDatabaseState(trackedTables),
      captureBaselineSqlResults(repoRoot),
      captureOptionalBackupSnapshot(backupCommand),
    ]);

    const readExplainPlans = await captureReadExplainPlans(benchmarkSelection);

    const readBenchmarkPromise =
      includeReadBenchmark &&
      benchmarkSelection.primaryBusinessId &&
      benchmarkSelection.range30Start &&
      benchmarkSelection.range30End &&
      benchmarkSelection.range90Start &&
      benchmarkSelection.range90End
        ? runTsxScriptJson<Record<string, unknown>>("scripts/overview-benchmark.ts", [
            "--businessId",
            benchmarkSelection.primaryBusinessId,
            "--range30Start",
            benchmarkSelection.range30Start,
            "--range30End",
            benchmarkSelection.range30End,
            "--range90Start",
            benchmarkSelection.range90Start,
            "--range90End",
            benchmarkSelection.range90End,
            "--iterations30",
            "3",
            "--iterations90",
            "3",
            "--trendIterations",
            "5",
          ])
        : null;

    const writeBenchmarkPromise = includeWriteBenchmark
      ? runTsxScriptJson<Record<string, unknown>>("scripts/db-write-benchmark.ts", [
          "--iterations",
          "3",
        ])
      : null;

    const [readBenchmark, writeBenchmark] = await Promise.all([
      readBenchmarkPromise,
      writeBenchmarkPromise,
    ]);

    return {
      capturedAt: new Date().toISOString(),
      stage,
      runDir,
      artifactDir: outDir,
      hostMemory,
      benchmarkSelection,
      databaseState,
      baselineSqlResults,
      readExplainPlans,
      readBenchmark,
      writeBenchmark,
      backupSnapshot,
    };
  });

  await writeJsonFile(buildArtifactPath(outDir, "capture.json"), capture);
  console.log(JSON.stringify(capture, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
