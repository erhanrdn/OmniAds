import { getAdminOperationsHealth, type AdminSyncHealthPayload } from "@/lib/admin-operations-health";
import { getSyncRunbook } from "@/lib/sync/runbooks";

export interface SyncSoakThresholds {
  maxStaleRuns24h: number;
  maxLeaseConflicts24h: number;
  maxSkippedActiveLeaseRecoveries24h: number;
  maxQueueDepth: number;
  maxDeadLetters: number;
  maxCriticalIssues: number;
}

export interface SyncSoakCheckResult {
  key: string;
  ok: boolean;
  actual: number | boolean;
  threshold: number | boolean;
}

export interface SyncSoakEvaluation {
  outcome: "pass" | "fail";
  checkedAt: string;
  thresholds: SyncSoakThresholds;
  checks: SyncSoakCheckResult[];
  blockingChecks: SyncSoakCheckResult[];
  issueCount: number;
  criticalIssueCount: number;
  unresolvedRunbookKeys: string[];
  topIssue: string | null;
  releaseReadiness: "publishable" | "blocked";
  summary: string;
}

function countBlockingBacklog(sync: AdminSyncHealthPayload) {
  const googleBlockedQueueDepth = (sync.googleAdsBusinesses ?? [])
    .filter(
      (business) =>
        business.progressState === "partial_stuck" ||
        business.deadLetterPartitions > 0 ||
        (business.reclaimCandidateCount ?? 0) > 0 ||
        (business.poisonedCheckpointCount ?? 0) > 0 ||
        (business.leaseConflictRuns24h ?? 0) > 0 ||
        (business.integrityBlockedCount ?? 0) > 0,
    )
    .reduce((sum, business) => sum + business.queueDepth, 0);
  const metaBlockedQueueDepth = (sync.metaBusinesses ?? [])
    .filter(
      (business) =>
        business.progressState === "partial_stuck" ||
        business.deadLetterPartitions > 0 ||
        business.staleLeasePartitions > 0 ||
        (business.reclaimCandidateCount ?? 0) > 0 ||
        (business.staleRunCount24h ?? 0) > 0 ||
        (business.integrityBlockedCount ?? 0) > 0 ||
        (business.d1FinalizeNonTerminalCount ?? 0) > 0,
    )
    .reduce((sum, business) => sum + business.queueDepth, 0);

  return googleBlockedQueueDepth + metaBlockedQueueDepth;
}

export function readSyncSoakThresholds(env: NodeJS.ProcessEnv = process.env): SyncSoakThresholds {
  const readThreshold = (name: string, fallback: number) => {
    const raw = env[name];
    if (!raw) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };

  return {
    maxStaleRuns24h: readThreshold("SYNC_SOAK_MAX_STALE_RUNS_24H", 0),
    maxLeaseConflicts24h: readThreshold("SYNC_SOAK_MAX_LEASE_CONFLICTS_24H", 0),
    maxSkippedActiveLeaseRecoveries24h: readThreshold("SYNC_SOAK_MAX_SKIPPED_ACTIVE_LEASE_24H", 5),
    maxQueueDepth: readThreshold("SYNC_SOAK_MAX_QUEUE_DEPTH", 25),
    maxDeadLetters: readThreshold("SYNC_SOAK_MAX_DEAD_LETTERS", 0),
    maxCriticalIssues: readThreshold("SYNC_SOAK_MAX_CRITICAL_ISSUES", 0),
  };
}

export function evaluateSyncSoakHealth(
  sync: AdminSyncHealthPayload,
  thresholds: SyncSoakThresholds = readSyncSoakThresholds()
): SyncSoakEvaluation {
  const summary = sync.summary;
  const criticalIssues = sync.issues.filter((issue) => issue.severity === "critical");
  const blockingBacklogDepth = countBlockingBacklog(sync);
  const unresolvedRunbooks = sync.issues
    .filter((issue) => issue.runbookKey)
    .filter((issue) => !getSyncRunbook(issue.runbookKey))
    .map((issue) => issue.runbookKey!) ;

  const checks: SyncSoakCheckResult[] = [
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
      ok: blockingBacklogDepth <= thresholds.maxQueueDepth,
      actual: blockingBacklogDepth,
      threshold: thresholds.maxQueueDepth,
    },
    {
      key: "dead_letters",
      ok:
        (summary.googleAdsDeadLetterPartitions ?? 0) + (summary.metaDeadLetterPartitions ?? 0) <=
        thresholds.maxDeadLetters,
      actual: (summary.googleAdsDeadLetterPartitions ?? 0) + (summary.metaDeadLetterPartitions ?? 0),
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

  const blockingChecks = checks.filter((check) => !check.ok);
  const outcome = blockingChecks.length === 0 ? "pass" : "fail";

  return {
    outcome,
    checkedAt: new Date().toISOString(),
    thresholds,
    checks,
    blockingChecks,
    issueCount: sync.issues.length,
    criticalIssueCount: criticalIssues.length,
    unresolvedRunbookKeys: unresolvedRunbooks,
    topIssue: summary.topIssue ?? null,
    releaseReadiness: outcome === "pass" ? "publishable" : "blocked",
    summary:
      outcome === "pass"
        ? "Sync soak gate passed."
        : `Sync soak gate failed: ${blockingChecks.map((check) => check.key).join(", ")}`,
  };
}

export async function runSyncSoakGate(
  thresholds: SyncSoakThresholds = readSyncSoakThresholds()
): Promise<{
  health: Awaited<ReturnType<typeof getAdminOperationsHealth>>;
  result: SyncSoakEvaluation;
}> {
  const health = await getAdminOperationsHealth();
  return {
    health,
    result: evaluateSyncSoakHealth(health.syncHealth, thresholds),
  };
}
