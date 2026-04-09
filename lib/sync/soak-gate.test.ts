import { describe, expect, it } from "vitest";
import { evaluateSyncSoakHealth } from "@/lib/sync/soak-gate";

describe("evaluateSyncSoakHealth", () => {
  it("fails when critical issues or unresolved runbooks exceed the gate", () => {
    const result = evaluateSyncSoakHealth(
      {
        summary: {
          impactedBusinesses: 1,
          runningJobs: 0,
          stuckJobs: 0,
          failedJobs24h: 0,
          activeCooldowns: 0,
          successJobs24h: 0,
          topIssue: "critical",
          workerOnline: true,
          googleAdsQueueDepth: 1,
          metaQueueDepth: 0,
          googleAdsDeadLetterPartitions: 0,
          metaDeadLetterPartitions: 0,
          googleAdsLeaseConflictRuns24h: 0,
          metaStaleRunCount24h: 0,
          googleAdsSkippedActiveLeaseRecoveries: 0,
          metaSkippedActiveLeaseRecoveries: 0,
        },
        issues: [
          {
            businessId: "biz",
            businessName: "Biz",
            provider: "google_ads",
            reportType: "lease_conflict_runs",
            severity: "critical",
            runbookKey: "google_ads:lease_conflict",
            status: "failed",
            detail: "critical",
            triggeredAt: null,
            completedAt: null,
          },
          {
            businessId: "biz",
            businessName: "Biz",
            provider: "meta",
            reportType: "stale_runs",
            severity: "high",
            runbookKey: "meta:missing_runbook",
            status: "failed",
            detail: "missing runbook",
            triggeredAt: null,
            completedAt: null,
          },
        ],
      },
      {
        maxStaleRuns24h: 0,
        maxLeaseConflicts24h: 0,
        maxSkippedActiveLeaseRecoveries24h: 5,
        maxQueueDepth: 25,
        maxDeadLetters: 0,
        maxCriticalIssues: 0,
      }
    );

    expect(result.outcome).toBe("fail");
    expect(result.releaseReadiness).toBe("blocked");
    expect(result.blockingChecks.map((check) => check.key)).toEqual([
      "critical_issue_count",
      "runbook_resolution",
    ]);
    expect(result.checks.find((check) => check.key === "critical_issue_count")?.ok).toBe(false);
    expect(result.checks.find((check) => check.key === "runbook_resolution")?.ok).toBe(false);
    expect(result.unresolvedRunbookKeys).toEqual(["meta:missing_runbook"]);
  });

  it("passes when thresholds and runbook resolution are satisfied", () => {
    const result = evaluateSyncSoakHealth(
      {
        summary: {
          impactedBusinesses: 0,
          runningJobs: 0,
          stuckJobs: 0,
          failedJobs24h: 0,
          activeCooldowns: 0,
          successJobs24h: 0,
          topIssue: null,
          workerOnline: true,
          googleAdsQueueDepth: 2,
          metaQueueDepth: 1,
          googleAdsDeadLetterPartitions: 0,
          metaDeadLetterPartitions: 0,
          googleAdsLeaseConflictRuns24h: 0,
          metaStaleRunCount24h: 0,
          googleAdsSkippedActiveLeaseRecoveries: 2,
          metaSkippedActiveLeaseRecoveries: 1,
        },
        issues: [],
      },
      {
        maxStaleRuns24h: 0,
        maxLeaseConflicts24h: 0,
        maxSkippedActiveLeaseRecoveries24h: 5,
        maxQueueDepth: 25,
        maxDeadLetters: 0,
        maxCriticalIssues: 0,
      }
    );

    expect(result.outcome).toBe("pass");
    expect(result.releaseReadiness).toBe("publishable");
    expect(result.blockingChecks).toEqual([]);
  });

  it("ignores actively progressing queue backlog when calculating soak queue depth", () => {
    const result = evaluateSyncSoakHealth(
      {
        summary: {
          impactedBusinesses: 2,
          runningJobs: 0,
          stuckJobs: 0,
          failedJobs24h: 0,
          activeCooldowns: 0,
          successJobs24h: 0,
          topIssue: null,
          workerOnline: true,
          googleAdsQueueDepth: 120,
          metaQueueDepth: 80,
          googleAdsDeadLetterPartitions: 0,
          metaDeadLetterPartitions: 0,
          googleAdsLeaseConflictRuns24h: 0,
          metaStaleRunCount24h: 0,
          googleAdsSkippedActiveLeaseRecoveries: 0,
          metaSkippedActiveLeaseRecoveries: 0,
        },
        issues: [],
        googleAdsBusinesses: [
          {
            businessId: "biz-g",
            businessName: "Grandmix",
            queueDepth: 120,
            leasedPartitions: 9,
            deadLetterPartitions: 0,
            oldestQueuedPartition: null,
            latestPartitionActivityAt: new Date().toISOString(),
            campaignCompletedDays: 10,
            searchTermCompletedDays: 10,
            productCompletedDays: 10,
            progressState: "partial_progressing",
          },
        ],
        metaBusinesses: [
          {
            businessId: "biz-m",
            businessName: "TheSwaf",
            queueDepth: 80,
            leasedPartitions: 4,
            retryableFailedPartitions: 0,
            staleLeasePartitions: 0,
            deadLetterPartitions: 0,
            stateRowCount: 2,
            todayAccountRows: 1,
            todayAdsetRows: 1,
            currentDayReference: null,
            oldestQueuedPartition: null,
            latestPartitionActivityAt: new Date().toISOString(),
            accountCompletedDays: 14,
            adsetCompletedDays: 14,
            creativeCompletedDays: 14,
            progressState: "partial_progressing",
          },
        ],
      },
      {
        maxStaleRuns24h: 0,
        maxLeaseConflicts24h: 0,
        maxSkippedActiveLeaseRecoveries24h: 5,
        maxQueueDepth: 25,
        maxDeadLetters: 0,
        maxCriticalIssues: 0,
      },
    );

    expect(result.outcome).toBe("pass");
    expect(result.checks.find((check) => check.key === "queue_depth")?.actual).toBe(0);
  });

  it("fails when blocked backlog exceeds the soak queue threshold", () => {
    const result = evaluateSyncSoakHealth(
      {
        summary: {
          impactedBusinesses: 1,
          runningJobs: 0,
          stuckJobs: 0,
          failedJobs24h: 0,
          activeCooldowns: 0,
          successJobs24h: 0,
          topIssue: "blocked backlog",
          workerOnline: true,
          googleAdsQueueDepth: 40,
          metaQueueDepth: 0,
          googleAdsDeadLetterPartitions: 0,
          metaDeadLetterPartitions: 0,
          googleAdsLeaseConflictRuns24h: 0,
          metaStaleRunCount24h: 0,
          googleAdsSkippedActiveLeaseRecoveries: 0,
          metaSkippedActiveLeaseRecoveries: 0,
        },
        issues: [],
        googleAdsBusinesses: [
          {
            businessId: "biz-g",
            businessName: "Blocked Co",
            queueDepth: 40,
            leasedPartitions: 0,
            deadLetterPartitions: 0,
            oldestQueuedPartition: null,
            latestPartitionActivityAt: new Date(Date.now() - 30 * 60_000).toISOString(),
            campaignCompletedDays: 10,
            searchTermCompletedDays: 0,
            productCompletedDays: 0,
            reclaimCandidateCount: 1,
            progressState: "partial_stuck",
          },
        ],
      },
      {
        maxStaleRuns24h: 0,
        maxLeaseConflicts24h: 0,
        maxSkippedActiveLeaseRecoveries24h: 5,
        maxQueueDepth: 25,
        maxDeadLetters: 0,
        maxCriticalIssues: 0,
      },
    );

    expect(result.outcome).toBe("fail");
    expect(result.checks.find((check) => check.key === "queue_depth")?.actual).toBe(40);
  });
});
