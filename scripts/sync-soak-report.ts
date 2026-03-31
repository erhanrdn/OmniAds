import { loadEnvConfig } from "@next/env";
import { getAdminOperationsHealth } from "@/lib/admin-operations-health";
import { getSyncRunbook } from "@/lib/sync/runbooks";

loadEnvConfig(process.cwd());

function readThreshold(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

async function main() {
  const snapshot = await getAdminOperationsHealth();
  const sync = snapshot.syncHealth;
  const summary = sync.summary;

  const thresholds = {
    maxStaleRuns24h: readThreshold("SYNC_SOAK_MAX_STALE_RUNS_24H", 0),
    maxLeaseConflicts24h: readThreshold("SYNC_SOAK_MAX_LEASE_CONFLICTS_24H", 0),
    maxSkippedActiveLeaseRecoveries24h: readThreshold(
      "SYNC_SOAK_MAX_SKIPPED_ACTIVE_LEASE_24H",
      5
    ),
    maxQueueDepth: readThreshold("SYNC_SOAK_MAX_QUEUE_DEPTH", 25),
    maxDeadLetters: readThreshold("SYNC_SOAK_MAX_DEAD_LETTERS", 0),
    maxCriticalIssues: readThreshold("SYNC_SOAK_MAX_CRITICAL_ISSUES", 0),
  };

  const criticalIssues = sync.issues.filter((issue) => issue.severity === "critical");
  const unresolvedRunbooks = sync.issues
    .filter((issue) => issue.runbookKey)
    .filter((issue) => !getSyncRunbook(issue.runbookKey));

  const checks = [
    {
      key: "worker_online",
      ok: Boolean(summary.workerOnline),
      actual: Boolean(summary.workerOnline),
      threshold: true,
    },
    {
      key: "meta_stale_runs_24h",
      ok: (summary.metaStaleRunCount24h ?? 0) <= thresholds.maxStaleRuns24h,
      actual: summary.metaStaleRunCount24h ?? 0,
      threshold: thresholds.maxStaleRuns24h,
    },
    {
      key: "google_lease_conflicts_24h",
      ok: (summary.googleAdsLeaseConflictRuns24h ?? 0) <= thresholds.maxLeaseConflicts24h,
      actual: summary.googleAdsLeaseConflictRuns24h ?? 0,
      threshold: thresholds.maxLeaseConflicts24h,
    },
    {
      key: "skipped_active_lease_recoveries_24h",
      ok:
        (summary.googleAdsSkippedActiveLeaseRecoveries ?? 0) +
          (summary.metaSkippedActiveLeaseRecoveries ?? 0) <=
        thresholds.maxSkippedActiveLeaseRecoveries24h,
      actual:
        (summary.googleAdsSkippedActiveLeaseRecoveries ?? 0) +
        (summary.metaSkippedActiveLeaseRecoveries ?? 0),
      threshold: thresholds.maxSkippedActiveLeaseRecoveries24h,
    },
    {
      key: "queue_depth",
      ok:
        (summary.googleAdsQueueDepth ?? 0) + (summary.metaQueueDepth ?? 0) <=
        thresholds.maxQueueDepth,
      actual: (summary.googleAdsQueueDepth ?? 0) + (summary.metaQueueDepth ?? 0),
      threshold: thresholds.maxQueueDepth,
    },
    {
      key: "dead_letters",
      ok:
        (summary.googleAdsDeadLetterPartitions ?? 0) + (summary.metaDeadLetterPartitions ?? 0) <=
        thresholds.maxDeadLetters,
      actual:
        (summary.googleAdsDeadLetterPartitions ?? 0) + (summary.metaDeadLetterPartitions ?? 0),
      threshold: thresholds.maxDeadLetters,
    },
    {
      key: "critical_issue_count",
      ok: criticalIssues.length <= thresholds.maxCriticalIssues,
      actual: criticalIssues.length,
      threshold: thresholds.maxCriticalIssues,
    },
    {
      key: "runbook_resolution",
      ok: unresolvedRunbooks.length === 0,
      actual: unresolvedRunbooks.length,
      threshold: 0,
    },
  ];

  const failedChecks = checks.filter((check) => !check.ok);
  const output = {
    outcome: failedChecks.length === 0 ? "pass" : "fail",
    checkedAt: new Date().toISOString(),
    thresholds,
    checks,
    issueCount: sync.issues.length,
    criticalIssueCount: criticalIssues.length,
    unresolvedRunbookKeys: unresolvedRunbooks.map((issue) => issue.runbookKey),
    topIssue: summary.topIssue ?? null,
  };

  console.log(JSON.stringify(output, null, 2));
  if (failedChecks.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
