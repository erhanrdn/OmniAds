import { writeFile } from "node:fs/promises";
import { getDbWithTimeout } from "@/lib/db";
import { classifyMetaDrainState } from "@/lib/meta-sync-benchmark";
import {
  configureOperationalScriptRuntime,
  runOperationalMigrationsIfEnabled,
  withOperationalStartupLogsSilenced,
} from "./_operational-runtime";

type ParsedArgs = {
  businessId: string | null;
  outPath: string | null;
  windowMinutes: number;
};

function parseArgs(argv: string[]): ParsedArgs {
  let businessId: string | null = null;
  let outPath: string | null = null;
  let windowMinutes = 15;

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
    if ((current === "--window-minutes" || current === "-w") && argv[index + 1]) {
      const parsed = Number(argv[index + 1]);
      windowMinutes = Number.isFinite(parsed) && parsed > 0 ? parsed : windowMinutes;
      index += 1;
      continue;
    }
    if (!current?.startsWith("-") && !businessId) {
      businessId = current;
    }
  }

  return { businessId, outPath, windowMinutes };
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

    const sql = getDbWithTimeout(60_000);
    const rows = await sql.query(
      `
        WITH recent_reclaims AS (
          SELECT
            business_id,
            COUNT(*) FILTER (WHERE event_type = 'reclaimed')::int AS reclaimed_last_window,
            COUNT(*) FILTER (WHERE event_type = 'skipped_active_lease')::int AS skipped_active_lease_last_window
          FROM sync_reclaim_events
          WHERE provider_scope = 'meta'
            AND created_at >= now() - ($1::int || ' minutes')::interval
          GROUP BY business_id
        )
        SELECT
          partition.business_id,
          business.name AS business_name,
          COUNT(*) FILTER (WHERE partition.status = 'queued')::int AS queue_depth,
          COUNT(*) FILTER (WHERE partition.status IN ('leased', 'running'))::int AS leased_partitions,
          COUNT(*) FILTER (WHERE partition.status = 'failed')::int AS retryable_failed_partitions,
          COUNT(*) FILTER (WHERE partition.status = 'dead_letter')::int AS dead_letter_partitions,
          COUNT(*) FILTER (
            WHERE partition.status = 'succeeded'
              AND partition.finished_at >= now() - ($1::int || ' minutes')::interval
          )::int AS completed_last_window,
          COUNT(*) FILTER (
            WHERE partition.status = 'cancelled'
              AND partition.finished_at >= now() - ($1::int || ' minutes')::interval
          )::int AS cancelled_last_window,
          COUNT(*) FILTER (
            WHERE partition.status = 'dead_letter'
              AND partition.finished_at >= now() - ($1::int || ' minutes')::interval
          )::int AS dead_lettered_last_window,
          COUNT(*) FILTER (
            WHERE partition.created_at >= now() - ($1::int || ' minutes')::interval
          )::int AS created_last_window,
          COUNT(*) FILTER (
            WHERE partition.status = 'failed'
              AND partition.updated_at >= now() - ($1::int || ' minutes')::interval
          )::int AS failed_last_window,
          MIN(partition.partition_date) FILTER (WHERE partition.status = 'queued') AS oldest_queued_partition,
          MAX(partition.updated_at) AS latest_activity_at,
          COALESCE(reclaims.reclaimed_last_window, 0)::int AS reclaimed_last_window,
          COALESCE(reclaims.skipped_active_lease_last_window, 0)::int AS skipped_active_lease_last_window
        FROM meta_sync_partitions partition
        LEFT JOIN businesses business
          ON business.id::text = partition.business_id
        LEFT JOIN recent_reclaims reclaims
          ON reclaims.business_id = partition.business_id
        WHERE ($2::text IS NULL OR partition.business_id = $2)
        GROUP BY partition.business_id, business.name, reclaims.reclaimed_last_window, reclaims.skipped_active_lease_last_window
        ORDER BY queue_depth DESC, leased_partitions DESC, partition.business_id ASC
        LIMIT 20
      `,
      [args.windowMinutes, args.businessId],
    );

    const businesses = rows.map((row) => {
      const normalized = {
        businessId: String(row.business_id),
        businessName: row.business_name ? String(row.business_name) : null,
        queueDepth: toNumber(row.queue_depth),
        leasedPartitions: toNumber(row.leased_partitions),
        retryableFailedPartitions: toNumber(row.retryable_failed_partitions),
        deadLetterPartitions: toNumber(row.dead_letter_partitions),
        completedLastWindow: toNumber(row.completed_last_window),
        cancelledLastWindow: toNumber(row.cancelled_last_window),
        deadLetteredLastWindow: toNumber(row.dead_lettered_last_window),
        createdLastWindow: toNumber(row.created_last_window),
        failedLastWindow: toNumber(row.failed_last_window),
        oldestQueuedPartition: toDate(row.oldest_queued_partition),
        latestActivityAt: toIso(row.latest_activity_at),
        reclaimedLastWindow: toNumber(row.reclaimed_last_window),
        skippedActiveLeaseLastWindow: toNumber(row.skipped_active_lease_last_window),
        windowMinutes: args.windowMinutes,
      };
      const netDrainEstimate =
        normalized.completedLastWindow +
        normalized.cancelledLastWindow +
        normalized.deadLetteredLastWindow -
        normalized.createdLastWindow;
      return {
        ...normalized,
        netDrainEstimate,
        drainState: classifyMetaDrainState({
          queueDepth: normalized.queueDepth,
          leasedPartitions: normalized.leasedPartitions,
          completedLastWindow: normalized.completedLastWindow,
          createdLastWindow: normalized.createdLastWindow,
          latestActivityAt: normalized.latestActivityAt,
          windowMinutes: args.windowMinutes,
        }),
      };
    });

    const overallLatestActivityAt =
      businesses
        .map((business) => business.latestActivityAt)
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => left.localeCompare(right))
        .at(-1) ?? null;
    const overallOldestQueuedPartition =
      businesses
        .map((business) => business.oldestQueuedPartition)
        .filter((value): value is string => Boolean(value))
        .sort((left, right) => left.localeCompare(right))[0] ?? null;

    const summary = businesses.reduce(
      (acc, business) => ({
        queueDepth: acc.queueDepth + business.queueDepth,
        leasedPartitions: acc.leasedPartitions + business.leasedPartitions,
        retryableFailedPartitions:
          acc.retryableFailedPartitions + business.retryableFailedPartitions,
        deadLetterPartitions: acc.deadLetterPartitions + business.deadLetterPartitions,
        completedLastWindow: acc.completedLastWindow + business.completedLastWindow,
        createdLastWindow: acc.createdLastWindow + business.createdLastWindow,
        reclaimedLastWindow: acc.reclaimedLastWindow + business.reclaimedLastWindow,
        skippedActiveLeaseLastWindow:
          acc.skippedActiveLeaseLastWindow + business.skippedActiveLeaseLastWindow,
        netDrainEstimate: acc.netDrainEstimate + business.netDrainEstimate,
      }),
      {
        queueDepth: 0,
        leasedPartitions: 0,
        retryableFailedPartitions: 0,
        deadLetterPartitions: 0,
        completedLastWindow: 0,
        createdLastWindow: 0,
        reclaimedLastWindow: 0,
        skippedActiveLeaseLastWindow: 0,
        netDrainEstimate: 0,
      },
    );

    return {
      capturedAt: new Date().toISOString(),
      businessId: args.businessId,
      windowMinutes: args.windowMinutes,
      summary: {
        ...summary,
        oldestQueuedPartition: overallOldestQueuedPartition,
        latestActivityAt: overallLatestActivityAt,
        drainState: classifyMetaDrainState({
          queueDepth: summary.queueDepth,
          leasedPartitions: summary.leasedPartitions,
          completedLastWindow: summary.completedLastWindow,
          createdLastWindow: summary.createdLastWindow,
          latestActivityAt: overallLatestActivityAt,
          windowMinutes: args.windowMinutes,
        }),
      },
      businesses,
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
