import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sync/soak-gate", () => ({
  runSyncSoakGate: vi.fn(),
}));

vi.mock("@/lib/meta-sync-benchmark", () => ({
  collectMetaSyncReadinessSnapshot: vi.fn(),
}));

vi.mock("@/lib/sync/runtime-contract", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sync/runtime-contract")>();
  return {
    ...actual,
    getRuntimeRegistryStatus: vi.fn(),
  };
});

const soakGate = await import("@/lib/sync/soak-gate");
const benchmark = await import("@/lib/meta-sync-benchmark");
const runtimeContract = await import("@/lib/sync/runtime-contract");
const releaseGates = await import("@/lib/sync/release-gates");

describe("sync release gates", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv, NODE_ENV: "test" };
    process.env.SYNC_DEPLOY_GATE_MODE = "block";
    process.env.SYNC_RELEASE_GATE_MODE = "measure_only";
    vi.mocked(runtimeContract.getRuntimeRegistryStatus).mockResolvedValue({
      sampledAt: "2026-04-15T00:00:00.000Z",
      buildId: "dev-build",
      freshnessWindowMinutes: 10,
      contractValid: true,
      serviceHealth: {
        web: null,
        worker: null,
      },
      webPresent: true,
      workerPresent: true,
      dbFingerprintMatch: true,
      configFingerprintMatch: true,
      issues: [],
    });
    vi.mocked(soakGate.runSyncSoakGate).mockResolvedValue({
      health: {} as never,
      result: {
        outcome: "pass",
        checkedAt: "2026-04-15T00:00:00.000Z",
        thresholds: {
          maxStaleRuns24h: 0,
          maxLeaseConflicts24h: 0,
          maxSkippedActiveLeaseRecoveries24h: 5,
          maxQueueDepth: 25,
          maxDeadLetters: 0,
          maxCriticalIssues: 0,
        },
        checks: [],
        blockingChecks: [],
        issueCount: 0,
        criticalIssueCount: 0,
        unresolvedRunbookKeys: [],
        topIssue: null,
        releaseReadiness: "publishable",
        summary: "ok",
      },
    } as never);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("blocks deploy gate when runtime contract evidence fails under block mode", async () => {
    vi.mocked(runtimeContract.getRuntimeRegistryStatus).mockResolvedValue({
      sampledAt: "2026-04-15T00:00:00.000Z",
      buildId: "dev-build",
      freshnessWindowMinutes: 10,
      contractValid: false,
      serviceHealth: {
        web: null,
        worker: null,
      },
      webPresent: true,
      workerPresent: true,
      dbFingerprintMatch: false,
      configFingerprintMatch: true,
      issues: ["Web and worker DB fingerprints do not match."],
    });

    const verdict = await releaseGates.evaluateDeployGate({ persist: false });

    expect(verdict.baseResult).toBe("fail");
    expect(verdict.verdict).toBe("blocked");
    expect(verdict.blockerClass).toBe("runtime_contract_invalid");
  });

  it("marks release gate misconfigured when the canary set is empty", async () => {
    delete process.env.SYNC_RELEASE_CANARY_BUSINESSES;

    const verdict = await releaseGates.evaluateReleaseGate({ persist: false });

    expect(verdict.baseResult).toBe("misconfigured");
    expect(verdict.verdict).toBe("misconfigured");
    expect(verdict.blockerClass).toBe("misconfigured");
  });

  it("keeps failing canaries read-only under measure_only mode", async () => {
    process.env.SYNC_RELEASE_CANARY_BUSINESSES = "172d0ab8-495b-4679-a4c6-ffa404c389d3";
    vi.mocked(benchmark.collectMetaSyncReadinessSnapshot).mockResolvedValue({
      businessId: "172d0ab8-495b-4679-a4c6-ffa404c389d3",
      businessName: "TheSwaf",
      capturedAt: "2026-04-15T00:00:00.000Z",
      windows: {
        recent: { startDate: "2026-04-09", endDate: "2026-04-15", totalDays: 7 },
        priority: { startDate: "2026-04-13", endDate: "2026-04-15", totalDays: 3 },
        recentWindowMinutes: 15,
      },
      latestSync: null,
      operator: {
        progressState: "partial_stuck",
        activityState: "stalled",
        stallFingerprints: ["checkpoint_not_advancing"],
        repairBacklog: 0,
        validationFailures24h: 0,
        lastSuccessfulPublishAt: null,
        d1FinalizeNonTerminalCount: 0,
        workerOnline: false,
        workerLastHeartbeatAt: null,
        dbConstraint: null,
        dbBacklogState: null,
      },
      queue: {
        queueDepth: 3,
        leasedPartitions: 0,
        retryableFailedPartitions: 0,
        deadLetterPartitions: 0,
        staleLeasePartitions: 0,
        oldestQueuedPartition: null,
        latestActivityAt: null,
        pendingByLane: {},
        pendingByScope: {},
        laneSourceStatusCounts: [],
        laneScopeStatusCounts: [],
      },
      userFacing: {
        recentCore: {
          summary: {
            completedDays: 1,
            totalDays: 7,
            readyThroughDate: null,
            percent: 14,
            complete: false,
          },
          campaigns: {
            completedDays: 1,
            totalDays: 7,
            readyThroughDate: null,
            percent: 14,
            complete: false,
          },
          percent: 14,
          complete: false,
          readyThroughDate: null,
        },
        recentExtended: {
          adsets: { completedDays: 0, totalDays: 7, readyThroughDate: null, percent: 0, complete: false },
          creatives: { completedDays: 0, totalDays: 7, readyThroughDate: null, percent: 0, complete: false },
          ads: { completedDays: 0, totalDays: 7, readyThroughDate: null, percent: 0, complete: false },
        },
        recentSelectedRangeTruth: {
          startDate: "2026-04-09",
          endDate: "2026-04-15",
          totalDays: 7,
          completedCoreDays: 1,
          percent: 14,
          truthReady: false,
          state: "processing",
          verificationState: "processing",
          blockingReasons: [],
          detectorReasonCodes: [],
          asOf: null,
        },
        priorityWindowTruth: {
          startDate: "2026-04-13",
          endDate: "2026-04-15",
          totalDays: 3,
          completedCoreDays: 0,
          percent: 0,
          truthReady: false,
          state: "processing",
          verificationState: "processing",
          blockingReasons: [],
          detectorReasonCodes: [],
          asOf: null,
        },
      },
      syncState: {
        lastCheckpointUpdatedAt: null,
        readyThroughDates: {},
      },
      velocity: {
        completedLastWindow: 0,
        cancelledLastWindow: 0,
        deadLetteredLastWindow: 0,
        createdLastWindow: 0,
        failedLastWindow: 0,
        reclaimedLastWindow: 0,
        skippedActiveLeaseLastWindow: 0,
        netDrainEstimate: 0,
        drainState: "large_and_not_draining",
      },
      counters: {
        totalSucceeded: 0,
        totalCancelled: 0,
        totalDeadLettered: 0,
        totalPartitions: 3,
      },
      authoritative: {
        publishedProgression: 0,
        repairBacklog: 0,
        validationFailures24h: 0,
        d1SlaBreaches: 0,
        lastSuccessfulPublishAt: null,
      },
    } as never);

    const verdict = await releaseGates.evaluateReleaseGate({ persist: false });

    expect(verdict.baseResult).toBe("fail");
    expect(verdict.verdict).toBe("measure_only");
    expect(verdict.blockerClass).toBe("worker_unavailable");
  });
});
