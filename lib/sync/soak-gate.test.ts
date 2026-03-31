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
  });
});
