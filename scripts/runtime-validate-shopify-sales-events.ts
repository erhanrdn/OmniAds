import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import { getDb } from "@/lib/db";
import {
  acquireSyncRunnerLease,
  getSyncRunnerLeaseHealth,
  releaseSyncRunnerLease,
  renewSyncRunnerLease,
} from "@/lib/sync/worker-health";

type RecentTargetsMode = "orders" | "returns" | "both";

function parseArgs(argv: string[]) {
  const [businessId, ...flags] = argv;
  if (!businessId) {
    throw new Error(
      "usage: node --env-file=.env.local --import tsx scripts/runtime-validate-shopify-sales-events.ts <businessId> [--recent-targets=orders|returns|both] [--materialize=0|1] [--use-runner-lease=0|1] [--poll-seconds=10] [--base-wait-seconds=120] [--extended-wait-seconds=120]",
    );
  }

  const valueFor = (name: string) =>
    flags.find((flag) => flag.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
  const booleanFor = (name: string, fallback: boolean) => {
    const raw = valueFor(name);
    if (raw == null) return fallback;
    return raw === "1" || raw === "true";
  };
  const numberFor = (name: string, fallback: number) => {
    const raw = valueFor(name);
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  const recentTargets = (valueFor("recent-targets") ?? "orders") as RecentTargetsMode;
  if (!["orders", "returns", "both"].includes(recentTargets)) {
    throw new Error(`invalid --recent-targets value: ${recentTargets}`);
  }

  return {
    businessId,
    recentTargets,
    materializeOverviewState: booleanFor("materialize", false),
    useRunnerLease: booleanFor("use-runner-lease", true),
    pollSeconds: numberFor("poll-seconds", 10),
    baseWaitSeconds: numberFor("base-wait-seconds", 120),
    extendedWaitSeconds: numberFor("extended-wait-seconds", 120),
  };
}

function parsePhaseMarkers(text: string) {
  const phases: string[] = [];
  for (const regex of [/phase:\s'([^']+)'/g, /phase:\s"([^"]+)"/g]) {
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(text)) !== null) {
      phases.push(match[1]);
    }
  }
  return phases;
}

function isKnownSuccessfulPhase(phase: string | null) {
  if (!phase) return false;
  return (
    phase.endsWith("_succeeded") ||
    phase.endsWith("_completed")
  );
}

function appendTail<T>(items: T[], item: T, maxSize = 200) {
  items.push(item);
  if (items.length > maxSize) {
    items.splice(0, items.length - maxSize);
  }
}

function buildRecentTargets(mode: RecentTargetsMode) {
  return {
    orders: mode === "orders" || mode === "both",
    returns: mode === "returns" || mode === "both",
  };
}

async function getTrackedSnapshot(input: {
  businessId: string;
  providerDateRangeKey: string;
  startDate: string;
  endDate: string;
}) {
  const sql = getDb();
  const [providerRows, servingRows, reconciliationRows, syncRows] = (await Promise.all([
    sql`
      SELECT COUNT(*)::int AS row_count, MAX(updated_at)::text AS max_updated_at
      FROM provider_reporting_snapshots
      WHERE business_id = ${input.businessId}
        AND report_type = 'overview_shopify_orders_aggregate_v6'
        AND date_range_key = ${input.providerDateRangeKey}
    `,
    sql`
      SELECT COUNT(*)::int AS row_count, MAX(updated_at)::text AS max_updated_at
      FROM shopify_serving_state
      WHERE business_id = ${input.businessId}
        AND canary_key = ${`overview_shopify:${input.startDate}:${input.endDate}:shop_local`}
    `,
    sql`
      SELECT COUNT(*)::int AS row_count, MAX(recorded_at)::text AS max_recorded_at
      FROM shopify_reconciliation_runs
      WHERE business_id = ${input.businessId}
        AND start_date = ${input.startDate}::date
        AND end_date = ${input.endDate}::date
    `,
    sql`
      SELECT
        sync_target,
        latest_sync_status,
        latest_sync_started_at::text,
        latest_successful_sync_at::text,
        cursor_timestamp::text,
        cursor_value,
        updated_at::text,
        last_result_summary
      FROM shopify_sync_state
      WHERE business_id = ${input.businessId}
        AND sync_target IN ('commerce_orders_recent', 'commerce_returns_recent')
      ORDER BY sync_target
    `,
  ])) as [
    Array<Record<string, unknown>>,
    Array<Record<string, unknown>>,
    Array<Record<string, unknown>>,
    Array<Record<string, unknown>>,
  ];

  return {
    takenAt: new Date().toISOString(),
    providerRecent7d: providerRows[0] ?? null,
    servingStateRecent: servingRows[0] ?? null,
    reconciliationRecent: reconciliationRows[0] ?? null,
    syncState: (syncRows as Array<Record<string, unknown>>).map((row) => ({
      syncTarget: row.sync_target,
      latestSyncStatus: row.latest_sync_status,
      latestSyncStartedAt: row.latest_sync_started_at,
      latestSuccessfulSyncAt: row.latest_successful_sync_at,
      cursorTimestamp: row.cursor_timestamp,
      cursorValue: row.cursor_value,
      updatedAt: row.updated_at,
      triggerReason:
        row.last_result_summary &&
        typeof row.last_result_summary === "object" &&
        "triggerReason" in row.last_result_summary
          ? (row.last_result_summary as Record<string, unknown>).triggerReason
          : null,
      recentTargets:
        row.last_result_summary &&
        typeof row.last_result_summary === "object" &&
        "recentTargets" in row.last_result_summary
          ? (row.last_result_summary as Record<string, unknown>).recentTargets
          : null,
    })),
  };
}

async function getWriterActivities(runId: string) {
  const sql = getDb();
  const activities = (await sql.query(
    `
      SELECT
        pid,
        state,
        wait_event_type,
        wait_event,
        query_start::text,
        xact_start::text,
        backend_start::text,
        LEFT(query, 1000) AS query
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND query ILIKE $1
      ORDER BY query_start DESC
    `,
    [`%run_id=${runId}%`],
  )) as Array<Record<string, unknown>>;

  const rows = [];
  for (const activity of activities) {
    const pid = Number(activity.pid ?? 0);
    const blockingRows = (await sql.query(
      "SELECT pg_blocking_pids($1) AS blocking_pids",
      [pid],
    )) as Array<Record<string, unknown>>;
    const blockingPids = Array.isArray(blockingRows[0]?.blocking_pids)
      ? (blockingRows[0]?.blocking_pids as unknown[]).map((value) => Number(value)).filter(Number.isFinite)
      : [];

    const blockingActivities = [];
    for (const blockingPid of blockingPids) {
      const rowsForBlockingPid = (await sql.query(
        `
          SELECT
            pid,
            state,
            wait_event_type,
            wait_event,
            query_start::text,
            xact_start::text,
            LEFT(query, 1000) AS query
          FROM pg_stat_activity
          WHERE pid = $1
        `,
        [blockingPid],
      )) as Array<Record<string, unknown>>;
      if (rowsForBlockingPid[0]) {
        blockingActivities.push(rowsForBlockingPid[0]);
      }
    }

    const lockRows = (await sql.query(
      `
        SELECT
          l.locktype,
          l.mode,
          l.granted,
          CASE
            WHEN l.relation IS NULL THEN NULL
            ELSE l.relation::regclass::text
          END AS relation_name
        FROM pg_locks l
        WHERE l.pid = $1
        ORDER BY l.granted ASC, relation_name ASC NULLS LAST, l.mode ASC
      `,
      [pid],
    )) as Array<Record<string, unknown>>;

    const blockingLockRows = [];
    for (const blockingPid of blockingPids) {
      const rowsForBlockingPid = (await sql.query(
        `
          SELECT
            l.locktype,
            l.mode,
            l.granted,
            CASE
              WHEN l.relation IS NULL THEN NULL
              ELSE l.relation::regclass::text
            END AS relation_name
          FROM pg_locks l
          WHERE l.pid = $1
          ORDER BY l.granted ASC, relation_name ASC NULLS LAST, l.mode ASC
        `,
        [blockingPid],
      )) as Array<Record<string, unknown>>;
      blockingLockRows.push({
        pid: blockingPid,
        locks: rowsForBlockingPid,
      });
    }

    rows.push({
      pid,
      state: activity.state ?? null,
      waitEventType: activity.wait_event_type ?? null,
      waitEvent: activity.wait_event ?? null,
      queryStart: activity.query_start ?? null,
      xactStart: activity.xact_start ?? null,
      backendStart: activity.backend_start ?? null,
      query: activity.query ?? null,
      blockingPids,
      blockingActivities,
      locks: lockRows,
      blockingLocks: blockingLockRows,
    });
  }

  return rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const recentTargets = buildRecentTargets(args.recentTargets);
  const startDate = "2026-04-03";
  const endDate = "2026-04-09";
  const runId = `shopify_rtval_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const leaseOwner = `runtime_validation:shopify_sales_events:${runId}`;
  const useRunnerLease = args.useRunnerLease;
  const providerScope = "shopify";
  const providerDateRangeKey = `${startDate}:${endDate}`;
  const childConfig = {
    allowHistorical: false,
    recentWindowDays: 7,
    materializeOverviewState: args.materializeOverviewState,
    triggerReason: "runtime_validation",
    runtimeValidationRunId: runId,
    recentTargets,
  };

  let renewalTimer: NodeJS.Timeout | null = null;
  let leaseAcquired = false;

  try {
    if (useRunnerLease) {
      leaseAcquired = await acquireSyncRunnerLease({
        businessId: args.businessId,
        providerScope,
        leaseOwner,
        leaseMinutes: 10,
      });
      if (!leaseAcquired) {
        throw new Error(`Failed to acquire ${providerScope} runner lease for ${args.businessId}.`);
      }
      renewalTimer = setInterval(() => {
        void renewSyncRunnerLease({
          businessId: args.businessId,
          providerScope,
          leaseOwner,
          leaseMinutes: 10,
        }).catch(() => false);
      }, 60_000);
      renewalTimer.unref?.();
    }

    const before = await getTrackedSnapshot({
      businessId: args.businessId,
      providerDateRangeKey,
      startDate,
      endDate,
    });
    const leaseHealthBefore = useRunnerLease
      ? await getSyncRunnerLeaseHealth({
          businessId: args.businessId,
          providerScope,
        })
      : null;

    const childCode = `const mod = await import('./lib/sync/shopify-sync.ts'); const result = await mod.default.syncShopifyCommerceReports('${args.businessId}', ${JSON.stringify(
      childConfig,
    )}); console.log(JSON.stringify(result, null, 2));`;
    const command = [
      process.execPath,
      "--env-file=.env.local",
      "--import",
      "tsx",
      "-e",
      childCode,
    ];
    const child = spawn(command[0], command.slice(1), {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let lastStdoutAt: string | null = null;
    let lastStderrAt: string | null = null;
    let lastStdoutLine: string | null = null;
    let lastStderrLine: string | null = null;
    let lastStdoutMarker: string | null = null;
    let lastStderrMarker: string | null = null;
    let lastStdoutMarkerAt: string | null = null;
    let lastStderrMarkerAt: string | null = null;
    const stdoutTail: Array<{ at: string; line: string }> = [];
    const stderrTail: Array<{ at: string; line: string }> = [];

    const consumeBufferedLines = (
      channel: "stdout" | "stderr",
      value: string,
    ) => {
      const at = new Date().toISOString();
      const segments = value.split("\n");
      const completeLines = segments.slice(0, -1);
      const remainder = segments.at(-1) ?? "";
      for (const rawLine of completeLines) {
        const line = rawLine.replace(/\r$/, "");
        if (!line) continue;
        const match = /phase:\s'([^']+)'|phase:\s"([^"]+)"/.exec(line);
        if (channel === "stdout") {
          lastStdoutAt = at;
          lastStdoutLine = line;
          appendTail(stdoutTail, { at, line });
          if (match) {
            lastStdoutMarker = match[1] ?? match[2] ?? null;
            lastStdoutMarkerAt = at;
          }
        } else {
          lastStderrAt = at;
          lastStderrLine = line;
          appendTail(stderrTail, { at, line });
          if (match) {
            lastStderrMarker = match[1] ?? match[2] ?? null;
            lastStderrMarkerAt = at;
          }
        }
      }
      return remainder;
    };
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      stdoutBuffer += text;
      stdoutBuffer = consumeBufferedLines("stdout", stdoutBuffer);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      stderrBuffer += text;
      stderrBuffer = consumeBufferedLines("stderr", stderrBuffer);
    });

    let exitCode: number | null = null;
    let exitSignal: NodeJS.Signals | null = null;
    const exitPromise = new Promise<void>((resolve) => {
      child.on("exit", (code, signal) => {
        exitCode = code;
        exitSignal = signal;
        resolve();
      });
    });

    const pollIntervalMs = args.pollSeconds * 1000;
    const totalPolls = Math.floor((args.baseWaitSeconds + args.extendedWaitSeconds) / args.pollSeconds);
    const basePolls = Math.floor(args.baseWaitSeconds / args.pollSeconds);
    const polls: Array<Record<string, unknown>> = [];
    let termination = "completed_within_base_wait";
    let extensionStartedAt: string | null = null;
    const startTime = new Date().toISOString();

    for (let pollIndex = 1; pollIndex <= totalPolls; pollIndex += 1) {
      await sleep(pollIntervalMs);
      const [snapshot, writerActivities] = await Promise.all([
        getTrackedSnapshot({
          businessId: args.businessId,
          providerDateRangeKey,
          startDate,
          endDate,
        }),
        getWriterActivities(runId),
      ]);
      polls.push({
        pollIndex,
        takenAt: new Date().toISOString(),
        snapshot,
        writerActivities,
      });
      if (exitCode !== null || exitSignal !== null) {
        break;
      }
      if (pollIndex === basePolls) {
        extensionStartedAt = new Date().toISOString();
        termination = "extended_wait_started";
      }
    }

    if (exitCode === null && exitSignal === null) {
      termination = "terminated_after_extended_wait";
      child.kill("SIGINT");
      await Promise.race([exitPromise, sleep(10_000)]);
      if (exitCode === null && exitSignal === null) {
        termination = "killed_after_sigint_timeout";
        child.kill("SIGKILL");
        await exitPromise;
      }
    } else if (extensionStartedAt) {
      termination = "completed_within_extended_wait";
    }

    await exitPromise;

    if (stdoutBuffer.trim()) {
      const at = new Date().toISOString();
      lastStdoutAt = at;
      lastStdoutLine = stdoutBuffer.trimEnd();
      appendTail(stdoutTail, { at, line: stdoutBuffer.trimEnd() });
      const match = /phase:\s'([^']+)'|phase:\s"([^"]+)"/.exec(stdoutBuffer);
      if (match) {
        lastStdoutMarker = match[1] ?? match[2] ?? null;
        lastStdoutMarkerAt = at;
      }
    }
    if (stderrBuffer.trim()) {
      const at = new Date().toISOString();
      lastStderrAt = at;
      lastStderrLine = stderrBuffer.trimEnd();
      appendTail(stderrTail, { at, line: stderrBuffer.trimEnd() });
      const match = /phase:\s'([^']+)'|phase:\s"([^"]+)"/.exec(stderrBuffer);
      if (match) {
        lastStderrMarker = match[1] ?? match[2] ?? null;
        lastStderrMarkerAt = at;
      }
    }

    const [after, leaseHealthAfter] = await Promise.all([
      getTrackedSnapshot({
        businessId: args.businessId,
        providerDateRangeKey,
        startDate,
        endDate,
      }),
      useRunnerLease
        ? getSyncRunnerLeaseHealth({
            businessId: args.businessId,
            providerScope,
          })
        : Promise.resolve(null),
    ]);

    const combinedOutput = `${stdout}\n${stderr}`;
    const phaseMarkers = parsePhaseMarkers(combinedOutput);
    const endTime = new Date().toISOString();
    const endTimeMs = Date.parse(endTime);
    const lastOutputAt = lastStderrAt ?? lastStdoutAt;
    const silenceAfterLastOutputSeconds =
      lastOutputAt != null ? Math.max(0, Math.round((endTimeMs - Date.parse(lastOutputAt)) / 1000)) : null;
    const childBecameSilentAfterKnownSuccessfulPhase =
      termination !== "completed_within_base_wait" &&
      termination !== "completed_within_extended_wait" &&
      isKnownSuccessfulPhase(lastStdoutMarker) &&
      lastStdoutMarkerAt != null &&
      Math.max(0, endTimeMs - Date.parse(lastStdoutMarkerAt)) >= pollIntervalMs;

    console.log(
      JSON.stringify(
        {
          command,
          useRunnerLease,
          providerScope,
          leaseOwner: useRunnerLease ? leaseOwner : null,
          runId,
          caseConfig: childConfig,
          startTime,
          endTime,
          totalWaitSeconds: Math.round(
            (endTimeMs - Date.parse(startTime)) / 1000,
          ),
          termination,
          extensionStartedAt,
          exitCode,
          exitSignal,
          lastPhaseMarker: phaseMarkers.at(-1) ?? null,
          lastStdoutMarker,
          lastStdoutMarkerAt,
          lastStderrMarker,
          lastStderrMarkerAt,
          lastStdoutLine,
          lastStdoutAt,
          lastStderrLine,
          lastStderrAt,
          lastOutputAt,
          silenceAfterLastOutputSeconds,
          childBecameSilentAfterKnownSuccessfulPhase,
          phaseMarkers,
          before,
          after,
          leaseHealthBefore,
          leaseHealthAfter,
          polls,
          stdoutTail,
          stderrTail,
        },
        null,
        2,
      ),
    );
  } finally {
    if (renewalTimer) {
      clearInterval(renewalTimer);
    }
    if (leaseAcquired) {
      await releaseSyncRunnerLease({
        businessId: args.businessId,
        providerScope,
        leaseOwner,
      }).catch(() => null);
    }
  }
}

void main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
