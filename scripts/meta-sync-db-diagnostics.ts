import { writeFile } from "node:fs/promises";
import { getDbRuntimeDiagnostics, getDbWithTimeout } from "@/lib/db";
import {
  configureOperationalScriptRuntime,
  runOperationalMigrationsIfEnabled,
  withOperationalStartupLogsSilenced,
} from "./_operational-runtime";

type ParsedArgs = {
  businessId: string | null;
  outPath: string | null;
};

const META_RELATIONS = [
  "meta_sync_jobs",
  "meta_sync_partitions",
  "meta_sync_runs",
  "meta_sync_checkpoints",
  "meta_sync_state",
  "sync_runner_leases",
  "sync_worker_heartbeats",
  "sync_reclaim_events",
  "meta_raw_snapshots",
  "meta_account_daily",
  "meta_campaign_daily",
  "meta_adset_daily",
  "meta_ad_daily",
  "meta_creative_daily",
  "meta_authoritative_source_manifests",
  "meta_authoritative_slice_versions",
  "meta_authoritative_publication_pointers",
] as const;

function parseArgs(argv: string[]): ParsedArgs {
  let businessId: string | null = null;
  let outPath: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if ((current === "--business" || current === "-b") && argv[index + 1]) {
      businessId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if ((current === "--out" || current === "-o") && argv[index + 1]) {
      outPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (!current?.startsWith("-") && !businessId) {
      businessId = current;
    }
  }

  return { businessId, outPath };
}

function toIso(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : text;
}

function toDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  return text.length >= 10 ? text.slice(0, 10) : text;
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function main() {
  const runtime = configureOperationalScriptRuntime();
  const args = parseArgs(process.argv.slice(2));

  const payload = await withOperationalStartupLogsSilenced(async () => {
    await runOperationalMigrationsIfEnabled(runtime);

    const businessFilter = args.businessId ?? null;
    const sql = getDbWithTimeout(60_000);

    const metaQueueSummary = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'queued')::int AS queue_depth,
        COUNT(*) FILTER (WHERE status IN ('leased', 'running'))::int AS leased_partitions,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS retryable_failed_partitions,
        COUNT(*) FILTER (WHERE status = 'dead_letter')::int AS dead_letter_partitions,
        COUNT(*) FILTER (
          WHERE status IN ('leased', 'running')
            AND lease_expires_at <= now()
        )::int AS stale_leases,
        MIN(partition_date) FILTER (WHERE status = 'queued') AS oldest_queued_partition,
        MAX(updated_at) AS latest_activity_at
      FROM meta_sync_partitions
      WHERE (${businessFilter}::text IS NULL OR business_id = ${businessFilter})
    `;

    const [
      backlogByBusiness,
      runnerLeases,
      recentReclaims,
      workerHeartbeats,
      pgStatActivitySummary,
      longTransactions,
      blockedLocks,
      relationSizes,
      indexSizes,
      pgStatStatementsEnabledRows,
    ] = await Promise.all([
      sql`
        SELECT
          partition.business_id,
          business.name AS business_name,
          COUNT(*) FILTER (WHERE partition.status = 'queued')::int AS queue_depth,
          COUNT(*) FILTER (WHERE partition.status IN ('leased', 'running'))::int AS leased_partitions,
          COUNT(*) FILTER (WHERE partition.status = 'failed')::int AS retryable_failed_partitions,
          COUNT(*) FILTER (WHERE partition.status = 'dead_letter')::int AS dead_letter_partitions,
          MIN(partition.partition_date) FILTER (WHERE partition.status = 'queued') AS oldest_queued_partition,
          MAX(partition.updated_at) AS latest_activity_at
        FROM meta_sync_partitions partition
        LEFT JOIN businesses business
          ON business.id::text = partition.business_id
        WHERE (${businessFilter}::text IS NULL OR partition.business_id = ${businessFilter})
        GROUP BY partition.business_id, business.name
        ORDER BY queue_depth DESC, leased_partitions DESC, partition.business_id ASC
        LIMIT 12
      `,
      sql`
        SELECT
          business_id,
          lease_owner,
          lease_expires_at,
          updated_at
        FROM sync_runner_leases
        WHERE provider_scope = 'meta'
          AND lease_expires_at > now()
          AND (${businessFilter}::text IS NULL OR business_id = ${businessFilter})
        ORDER BY lease_expires_at DESC
        LIMIT 20
      `,
      sql`
        SELECT
          business_id,
          event_type,
          COUNT(*)::int AS count,
          MAX(created_at) AS latest_at
        FROM sync_reclaim_events
        WHERE provider_scope = 'meta'
          AND created_at >= now() - interval '24 hours'
          AND (${businessFilter}::text IS NULL OR business_id = ${businessFilter})
        GROUP BY business_id, event_type
        ORDER BY count DESC, business_id ASC, event_type ASC
      `,
      sql`
        SELECT
          worker_id,
          provider_scope,
          status,
          last_heartbeat_at,
          last_business_id
        FROM sync_worker_heartbeats
        WHERE provider_scope IN ('meta', 'all')
        ORDER BY last_heartbeat_at DESC
        LIMIT 12
      `,
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
            AND now() - xact_start > interval '5 minutes'
          ORDER BY xact_start ASC
          LIMIT 10
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
            LEFT(regexp_replace(blocked_activity.query, '\\s+', ' ', 'g'), 160) AS blocked_query,
            LEFT(regexp_replace(blocker_activity.query, '\\s+', ' ', 'g'), 160) AS blocker_query
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
          LIMIT 10
        `,
      ),
      sql.query(
        `
          SELECT
            stat.relname AS relation_name,
            stat.n_live_tup::bigint AS live_rows,
            pg_size_pretty(pg_total_relation_size(stat.relid)) AS total_size,
            pg_size_pretty(pg_relation_size(stat.relid)) AS table_size,
            pg_size_pretty(pg_total_relation_size(stat.relid) - pg_relation_size(stat.relid)) AS index_size
          FROM pg_stat_user_tables stat
          WHERE stat.relname = ANY($1::text[])
          ORDER BY pg_total_relation_size(stat.relid) DESC
        `,
        [Array.from(META_RELATIONS)],
      ),
      sql.query(
        `
          SELECT
            table_stat.relname AS relation_name,
            index_stat.indexrelname AS index_name,
            pg_size_pretty(pg_relation_size(index_stat.indexrelid)) AS index_size,
            index_stat.idx_scan::bigint AS idx_scan
          FROM pg_stat_user_indexes index_stat
          JOIN pg_stat_user_tables table_stat
            ON table_stat.relid = index_stat.relid
          WHERE table_stat.relname = ANY($1::text[])
          ORDER BY pg_relation_size(index_stat.indexrelid) DESC
          LIMIT 20
        `,
        [Array.from(META_RELATIONS)],
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
    ]);

    let pgStatStatements:
      | {
          enabled: boolean;
          topStatements: Array<Record<string, unknown>>;
          error: string | null;
        }
      | null = null;
    try {
      const enabled = Boolean(pgStatStatementsEnabledRows[0]?.enabled);
      if (!enabled) {
        pgStatStatements = {
          enabled: false,
          topStatements: [],
          error: null,
        };
      } else {
        const rows = await sql.query(
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
            WHERE query ILIKE '%meta_sync_%'
               OR query ILIKE '%meta\\_%daily%' ESCAPE '\\'
               OR query ILIKE '%sync_runner_leases%'
               OR query ILIKE '%sync_worker_heartbeats%'
            ORDER BY total_exec_time DESC
            LIMIT 10
          `,
        );
        pgStatStatements = {
          enabled: true,
          topStatements: rows,
          error: null,
        };
      }
    } catch (error) {
      pgStatStatements = {
        enabled: true,
        topStatements: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const queueRow = metaQueueSummary[0] ?? {};
    return {
      capturedAt: new Date().toISOString(),
      businessId: businessFilter,
      dbRuntime: getDbRuntimeDiagnostics(),
      metaQueue: {
        queueDepth: toNumber(queueRow.queue_depth),
        leasedPartitions: toNumber(queueRow.leased_partitions),
        retryableFailedPartitions: toNumber(queueRow.retryable_failed_partitions),
        deadLetterPartitions: toNumber(queueRow.dead_letter_partitions),
        staleLeases: toNumber(queueRow.stale_leases),
        oldestQueuedPartition: toDate(queueRow.oldest_queued_partition),
        latestActivityAt: toIso(queueRow.latest_activity_at),
      },
      backlogByBusiness: backlogByBusiness.map((row) => ({
        businessId: String(row.business_id),
        businessName: row.business_name ? String(row.business_name) : null,
        queueDepth: toNumber(row.queue_depth),
        leasedPartitions: toNumber(row.leased_partitions),
        retryableFailedPartitions: toNumber(row.retryable_failed_partitions),
        deadLetterPartitions: toNumber(row.dead_letter_partitions),
        oldestQueuedPartition: toDate(row.oldest_queued_partition),
        latestActivityAt: toIso(row.latest_activity_at),
      })),
      leaseAndReclaim: {
        activeRunnerLeases: runnerLeases.map((row) => ({
          businessId: String(row.business_id),
          leaseOwner: String(row.lease_owner),
          leaseExpiresAt: toIso(row.lease_expires_at),
          updatedAt: toIso(row.updated_at),
        })),
        recentReclaimEvents24h: recentReclaims.map((row) => ({
          businessId: String(row.business_id),
          eventType: String(row.event_type),
          count: toNumber(row.count),
          latestAt: toIso(row.latest_at),
        })),
        workerHeartbeats: workerHeartbeats.map((row) => ({
          workerId: String(row.worker_id),
          providerScope: String(row.provider_scope),
          status: String(row.status),
          lastHeartbeatAt: toIso(row.last_heartbeat_at),
          lastBusinessId: row.last_business_id ? String(row.last_business_id) : null,
        })),
      },
      pgStatActivity: {
        summary: pgStatActivitySummary.map((row) => ({
          applicationName: row.application_name ? String(row.application_name) : "",
          state: row.state ? String(row.state) : "unknown",
          waitEventType: row.wait_event_type ? String(row.wait_event_type) : "",
          waitEvent: row.wait_event ? String(row.wait_event) : "",
          connectionCount: toNumber(row.connection_count),
        })),
        longTransactions: longTransactions.map((row) => ({
          pid: toNumber(row.pid),
          applicationName: row.application_name ? String(row.application_name) : "",
          state: row.state ? String(row.state) : "unknown",
          xactAge: row.xact_age ? String(row.xact_age) : null,
          queryAge: row.query_age ? String(row.query_age) : null,
          waitEventType: row.wait_event_type ? String(row.wait_event_type) : "",
          waitEvent: row.wait_event ? String(row.wait_event) : "",
          query: row.query ? String(row.query) : "",
        })),
        blockedLocks: blockedLocks.map((row) => ({
          blockedPid: toNumber(row.blocked_pid),
          blockedApplicationName: row.blocked_application_name
            ? String(row.blocked_application_name)
            : "",
          blockerPid: toNumber(row.blocker_pid),
          blockerApplicationName: row.blocker_application_name
            ? String(row.blocker_application_name)
            : "",
          blockedQueryAge: row.blocked_query_age ? String(row.blocked_query_age) : null,
          blockedQuery: row.blocked_query ? String(row.blocked_query) : "",
          blockerQuery: row.blocker_query ? String(row.blocker_query) : "",
        })),
      },
      pgStatStatements,
      storage: {
        relations: relationSizes.map((row) => ({
          relationName: String(row.relation_name),
          liveRows: toNumber(row.live_rows),
          totalSize: row.total_size ? String(row.total_size) : "0 bytes",
          tableSize: row.table_size ? String(row.table_size) : "0 bytes",
          indexSize: row.index_size ? String(row.index_size) : "0 bytes",
        })),
        indexes: indexSizes.map((row) => ({
          relationName: String(row.relation_name),
          indexName: String(row.index_name),
          indexSize: row.index_size ? String(row.index_size) : "0 bytes",
          idxScan: toNumber(row.idx_scan),
        })),
      },
    };
  });

  const output = JSON.stringify(payload, null, 2);
  if (args.outPath) {
    await writeFile(args.outPath, `${output}\n`, "utf8");
  }
  console.log(output);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
