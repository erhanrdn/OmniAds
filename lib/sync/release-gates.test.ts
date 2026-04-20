import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MetaSyncBenchmarkSnapshot } from "@/lib/meta-sync-benchmark";

vi.mock("@/lib/sync/soak-gate", () => ({
  runSyncSoakGate: vi.fn(),
}));

vi.mock("@/lib/meta-sync-benchmark", () => ({
  collectMetaSyncReadinessSnapshot: vi.fn(),
}));

vi.mock("@/lib/sync/worker-health", () => ({
  getSyncWorkerHealthSummary: vi.fn(),
  getProviderScopeWorkerObservation: vi.fn(),
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
const workerHealth = await import("@/lib/sync/worker-health");
const releaseGates = await import("@/lib/sync/release-gates");

function makeReadySnapshot(): MetaSyncBenchmarkSnapshot {
  return {
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
      progressState: "syncing",
      activityState: "busy",
      stallFingerprints: [],
      repairBacklog: 0,
      validationFailures24h: 0,
      lastSuccessfulPublishAt: "2026-04-15T00:00:00.000Z",
      d1FinalizeNonTerminalCount: 0,
      workerOnline: true,
      workerLastHeartbeatAt: "2026-04-15T00:00:00.000Z",
      dbConstraint: null,
      dbBacklogState: null,
    },
    queue: {
      queueDepth: 6,
      leasedPartitions: 1,
      retryableFailedPartitions: 0,
      deadLetterPartitions: 0,
      staleLeasePartitions: 0,
      oldestQueuedPartition: null,
      latestActivityAt: "2026-04-15T00:00:00.000Z",
      pendingByLane: {},
      pendingByScope: {},
      laneSourceStatusCounts: [],
      laneScopeStatusCounts: [],
    },
    userFacing: {
      recentCore: {
        summary: {
          completedDays: 7,
          totalDays: 7,
          readyThroughDate: "2026-04-15",
          percent: 100,
          complete: true,
        },
        campaigns: {
          completedDays: 7,
          totalDays: 7,
          readyThroughDate: "2026-04-15",
          percent: 100,
          complete: true,
        },
        percent: 100,
        complete: true,
        readyThroughDate: "2026-04-15",
      },
      recentExtended: {
        adsets: { completedDays: 7, totalDays: 7, readyThroughDate: "2026-04-15", percent: 100, complete: true },
        creatives: { completedDays: 7, totalDays: 7, readyThroughDate: "2026-04-15", percent: 100, complete: true },
        ads: { completedDays: 7, totalDays: 7, readyThroughDate: "2026-04-15", percent: 100, complete: true },
      },
      recentSelectedRangeTruth: {
        startDate: "2026-04-09",
        endDate: "2026-04-15",
        totalDays: 7,
        completedCoreDays: 7,
        percent: 100,
        truthReady: true,
        state: "finalized_verified",
        verificationState: "finalized_verified",
        blockingReasons: [],
        detectorReasonCodes: [],
        asOf: "2026-04-15T00:00:00.000Z",
      },
      priorityWindowTruth: {
        startDate: "2026-04-13",
        endDate: "2026-04-15",
        totalDays: 3,
        completedCoreDays: 3,
        percent: 100,
        truthReady: true,
        state: "finalized_verified",
        verificationState: "finalized_verified",
        blockingReasons: [],
        detectorReasonCodes: [],
        asOf: "2026-04-15T00:00:00.000Z",
      },
    },
    syncState: {
      lastCheckpointUpdatedAt: "2026-04-15T00:00:00.000Z",
      readyThroughDates: {
        account_daily: "2026-04-15",
        campaign_daily: "2026-04-15",
      },
    },
    velocity: {
      completedLastWindow: 6,
      cancelledLastWindow: 0,
      deadLetteredLastWindow: 0,
      createdLastWindow: 2,
      failedLastWindow: 0,
      reclaimedLastWindow: 0,
      skippedActiveLeaseLastWindow: 0,
      netDrainEstimate: 4,
      drainState: "large_but_draining",
    },
    counters: {
      totalSucceeded: 12,
      totalCancelled: 0,
      totalDeadLettered: 0,
      totalPartitions: 6,
    },
    authoritative: {
      publishedProgression: 1,
      repairBacklog: 0,
      validationFailures24h: 0,
      d1SlaBreaches: 0,
      lastSuccessfulPublishAt: "2026-04-15T00:00:00.000Z",
    },
  };
}

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
        web: {
          instanceId: "web:test:1",
          service: "web",
          runtimeRole: "web",
          buildId: "dev-build",
          providerScopes: ["meta"],
          dbFingerprint: "db",
          configFingerprint: "cfg",
          healthState: "healthy",
          startedAt: "2026-04-15T00:00:00.000Z",
          lastSeenAt: "2026-04-15T00:00:00.000Z",
          contract: null,
          fresh: true,
        },
        worker: {
          instanceId: "worker:test:1",
          service: "worker",
          runtimeRole: "worker",
          buildId: "dev-build",
          providerScopes: ["meta"],
          dbFingerprint: "db",
          configFingerprint: "cfg",
          healthState: "healthy",
          startedAt: "2026-04-15T00:00:00.000Z",
          lastSeenAt: "2026-04-15T00:00:00.000Z",
          contract: null,
          fresh: true,
        },
      },
      webPresent: true,
      workerPresent: true,
      dbFingerprintMatch: true,
      configFingerprintMatch: true,
      issues: [],
    });
    vi.mocked(workerHealth.getSyncWorkerHealthSummary).mockResolvedValue({
      onlineWorkers: 1,
      workerInstances: 1,
      lastHeartbeatAt: "2026-04-15T00:00:00.000Z",
      lastProgressHeartbeatAt: null,
      workers: [],
    } as never);
    vi.mocked(workerHealth.getProviderScopeWorkerObservation).mockReturnValue({
      workerId: "sync-worker:test:meta",
      workerFreshnessState: "online",
      lastHeartbeatAt: "2026-04-15T00:00:00.000Z",
      heartbeatAgeMs: 1_000,
      hasFreshHeartbeat: true,
      metaJson: null,
    } as never);
    vi.mocked(soakGate.runSyncSoakGate).mockResolvedValue({
      health: {} as never,
      result: {
        outcome: "fail",
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
        blockingChecks: [{ key: "queue_depth", ok: false, actual: 99, threshold: 25 }],
        issueCount: 1,
        criticalIssueCount: 1,
        unresolvedRunbookKeys: [],
        topIssue: "queue_depth",
        releaseReadiness: "blocked",
        summary: "blocked",
      },
    } as never);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("classifies a ready provider release truth as pass", () => {
    expect(
      releaseGates.classifyProviderReleaseTruth({
        activityState: "busy",
        progressState: "syncing",
        workerOnline: true,
        queueDepth: 6,
        leasedPartitions: 1,
        truthReady: true,
        recentTruthState: "finalized_verified",
        priorityTruthState: "finalized_verified",
      })
    ).toMatchObject({
      pass: true,
      blockerClass: "none",
      evidence: {
        truthReady: true,
        queueDepth: 6,
        leasedPartitions: 1,
      },
    });
  });

  it("classifies queued work without a worker as worker_unavailable", () => {
    expect(
      releaseGates.classifyProviderReleaseTruth({
        activityState: "busy",
        progressState: "syncing",
        workerOnline: false,
        queueDepth: 3,
        leasedPartitions: 0,
        truthReady: true,
      })
    ).toMatchObject({
      pass: false,
      blockerClass: "worker_unavailable",
      evidence: {
        truthReady: true,
        queueDepth: 3,
        leasedPartitions: 0,
      },
    });
  });

  it("prefers google-scoped release gates over meta and legacy rows", () => {
    const selected = releaseGates.selectLatestSyncGateRecords(
      [
        {
          id: "deploy-1",
          gateKind: "deploy_gate",
          gateScope: "service_liveness",
          buildId: "build-1",
          environment: "production",
          mode: "block",
          baseResult: "pass",
          verdict: "pass",
          blockerClass: null,
          summary: "deploy ok",
          breakGlass: false,
          overrideReason: null,
          evidence: {},
          emittedAt: "2026-04-20T00:00:00.000Z",
        },
        {
          id: "meta-1",
          gateKind: "release_gate",
          gateScope: "release_readiness",
          buildId: "build-1",
          environment: "production",
          mode: "block",
          baseResult: "fail",
          verdict: "blocked",
          blockerClass: "not_release_ready",
          summary: "meta failed",
          breakGlass: false,
          overrideReason: null,
          evidence: {},
          emittedAt: "2026-04-20T00:02:00.000Z",
        },
        {
          id: "google-1",
          gateKind: "release_gate",
          gateScope: "release_readiness",
          buildId: "build-1",
          environment: "production",
          mode: "block",
          baseResult: "pass",
          verdict: "pass",
          blockerClass: null,
          summary: "google ok",
          breakGlass: false,
          overrideReason: null,
          evidence: {
            providerScope: "google_ads",
          },
          emittedAt: "2026-04-20T00:01:00.000Z",
        },
      ],
      {
        providerScope: "google_ads",
      },
    );

    expect(selected.deployGate?.id).toBe("deploy-1");
    expect(selected.releaseGate?.id).toBe("google-1");
  });

  it("treats unscoped legacy release gates as meta-only", () => {
    const selected = releaseGates.selectLatestSyncGateRecords(
      [
        {
          id: "legacy-meta-1",
          gateKind: "release_gate",
          gateScope: "release_readiness",
          buildId: "build-1",
          environment: "production",
          mode: "block",
          baseResult: "pass",
          verdict: "pass",
          blockerClass: null,
          summary: "legacy meta ok",
          breakGlass: false,
          overrideReason: null,
          evidence: {},
          emittedAt: "2026-04-20T00:00:00.000Z",
        },
      ],
      {
        providerScope: "meta",
      },
    );

    expect(selected.releaseGate?.id).toBe("legacy-meta-1");
  });

  it("never falls back to a cross-environment release gate", () => {
    const merged = releaseGates.mergeLatestSyncGateRecords({
      environment: "production",
      exact: {
        deployGate: {
          id: "deploy-prod",
          gateKind: "deploy_gate",
          gateScope: "service_liveness",
          buildId: "build-1",
          environment: "production",
          mode: "block",
          baseResult: "pass",
          verdict: "pass",
          blockerClass: null,
          summary: "deploy ok",
          breakGlass: false,
          overrideReason: null,
          evidence: {},
          emittedAt: "2026-04-20T00:00:00.000Z",
        },
        releaseGate: null,
      },
      fallbackByBuild: {
        deployGate: null,
        releaseGate: {
          id: "release-test",
          gateKind: "release_gate",
          gateScope: "release_readiness",
          buildId: "build-1",
          environment: "test",
          mode: "block",
          baseResult: "fail",
          verdict: "blocked",
          blockerClass: "not_release_ready",
          summary: "test release",
          breakGlass: false,
          overrideReason: null,
          evidence: {
            providerScope: "google_ads",
          },
          emittedAt: "2026-04-20T00:00:00.000Z",
        },
      },
    });

    expect(merged.deployGate?.id).toBe("deploy-prod");
    expect(merged.releaseGate).toBeNull();
  });

  it("falls back to an unknown-environment release gate", () => {
    const merged = releaseGates.mergeLatestSyncGateRecords({
      environment: "production",
      exact: {
        deployGate: null,
        releaseGate: null,
      },
      fallbackByBuild: {
        deployGate: null,
        releaseGate: {
          id: "release-unknown",
          gateKind: "release_gate",
          gateScope: "release_readiness",
          buildId: "build-1",
          environment: "unknown",
          mode: "block",
          baseResult: "pass",
          verdict: "pass",
          blockerClass: null,
          summary: "legacy release",
          breakGlass: false,
          overrideReason: null,
          evidence: {
            providerScope: "google_ads",
          },
          emittedAt: "2026-04-20T00:00:00.000Z",
        },
      },
    });

    expect(merged.releaseGate?.id).toBe("release-unknown");
  });

  it("blocks deploy gate when runtime contract evidence fails under block mode", async () => {
    vi.mocked(runtimeContract.getRuntimeRegistryStatus).mockResolvedValue({
      sampledAt: "2026-04-15T00:00:00.000Z",
      buildId: "dev-build",
      freshnessWindowMinutes: 10,
      contractValid: false,
      serviceHealth: {
        web: {
          instanceId: "web:test:1",
          service: "web",
          runtimeRole: "web",
          buildId: "dev-build",
          providerScopes: ["meta"],
          dbFingerprint: "db",
          configFingerprint: "cfg",
          healthState: "invalid",
          startedAt: "2026-04-15T00:00:00.000Z",
          lastSeenAt: "2026-04-15T00:00:00.000Z",
          contract: null,
          fresh: true,
        },
        worker: {
          instanceId: "worker:test:1",
          service: "worker",
          runtimeRole: "worker",
          buildId: "dev-build",
          providerScopes: ["meta"],
          dbFingerprint: "db",
          configFingerprint: "cfg",
          healthState: "healthy",
          startedAt: "2026-04-15T00:00:00.000Z",
          lastSeenAt: "2026-04-15T00:00:00.000Z",
          contract: null,
          fresh: true,
        },
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
    expect(verdict.gateScope).toBe("runtime_contract");
  });

  it("keeps deploy gate synthetic even when operator soak health is failing", async () => {
    const verdict = await releaseGates.evaluateDeployGate({ persist: false });

    expect(verdict.baseResult).toBe("pass");
    expect(verdict.verdict).toBe("pass");
    expect(verdict.blockerClass).toBeNull();
    expect(verdict.gateScope).toBe("service_liveness");
    expect(verdict.evidence).not.toHaveProperty("soakGate");
  });

  it("fails deploy gate when fresh Meta heartbeat is absent", async () => {
    vi.mocked(workerHealth.getProviderScopeWorkerObservation).mockReturnValue({
      workerId: "sync-worker:test:meta",
      workerFreshnessState: "stale",
      lastHeartbeatAt: "2026-04-15T00:00:00.000Z",
      heartbeatAgeMs: 900_000,
      hasFreshHeartbeat: false,
      metaJson: null,
    } as never);

    const verdict = await releaseGates.evaluateDeployGate({ persist: false });

    expect(verdict.baseResult).toBe("fail");
    expect(verdict.verdict).toBe("blocked");
    expect(verdict.blockerClass).toBe("heartbeat_missing");
    expect(verdict.gateScope).toBe("service_liveness");
  });

  it("marks release gate misconfigured when the canary set is empty", async () => {
    delete process.env.SYNC_RELEASE_CANARY_BUSINESSES;

    const verdict = await releaseGates.evaluateReleaseGate({ persist: false });

    expect(verdict.baseResult).toBe("misconfigured");
    expect(verdict.verdict).toBe("misconfigured");
    expect(verdict.blockerClass).toBe("misconfigured");
    expect(verdict.gateScope).toBe("release_readiness");
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
    expect(verdict.gateScope).toBe("release_readiness");
  });

  it("passes release gate when backlog is active but truth is ready and activity is busy", async () => {
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
        progressState: "syncing",
        activityState: "busy",
        stallFingerprints: [],
        repairBacklog: 0,
        validationFailures24h: 0,
        lastSuccessfulPublishAt: "2026-04-15T00:00:00.000Z",
        d1FinalizeNonTerminalCount: 0,
        workerOnline: true,
        workerLastHeartbeatAt: "2026-04-15T00:00:00.000Z",
        dbConstraint: null,
        dbBacklogState: null,
      },
      queue: {
        queueDepth: 6,
        leasedPartitions: 1,
        retryableFailedPartitions: 0,
        deadLetterPartitions: 0,
        staleLeasePartitions: 0,
        oldestQueuedPartition: null,
        latestActivityAt: "2026-04-15T00:00:00.000Z",
        pendingByLane: {},
        pendingByScope: {},
        laneSourceStatusCounts: [],
        laneScopeStatusCounts: [],
      },
      userFacing: {
        recentCore: {
          summary: {
            completedDays: 7,
            totalDays: 7,
            readyThroughDate: "2026-04-15",
            percent: 100,
            complete: true,
          },
          campaigns: {
            completedDays: 7,
            totalDays: 7,
            readyThroughDate: "2026-04-15",
            percent: 100,
            complete: true,
          },
          percent: 100,
          complete: true,
          readyThroughDate: "2026-04-15",
        },
        recentExtended: {
          adsets: { completedDays: 7, totalDays: 7, readyThroughDate: "2026-04-15", percent: 100, complete: true },
          creatives: { completedDays: 7, totalDays: 7, readyThroughDate: "2026-04-15", percent: 100, complete: true },
          ads: { completedDays: 7, totalDays: 7, readyThroughDate: "2026-04-15", percent: 100, complete: true },
        },
        recentSelectedRangeTruth: {
          startDate: "2026-04-09",
          endDate: "2026-04-15",
          totalDays: 7,
          completedCoreDays: 7,
          percent: 100,
          truthReady: true,
          state: "finalized_verified",
          verificationState: "finalized_verified",
          blockingReasons: [],
          detectorReasonCodes: [],
          asOf: "2026-04-15T00:00:00.000Z",
        },
        priorityWindowTruth: {
          startDate: "2026-04-13",
          endDate: "2026-04-15",
          totalDays: 3,
          completedCoreDays: 3,
          percent: 100,
          truthReady: true,
          state: "finalized_verified",
          verificationState: "finalized_verified",
          blockingReasons: [],
          detectorReasonCodes: [],
          asOf: "2026-04-15T00:00:00.000Z",
        },
      },
      syncState: {
        lastCheckpointUpdatedAt: "2026-04-15T00:00:00.000Z",
        readyThroughDates: {
          account_daily: "2026-04-15",
          campaign_daily: "2026-04-15",
        },
      },
      velocity: {
        completedLastWindow: 6,
        cancelledLastWindow: 0,
        deadLetteredLastWindow: 0,
        createdLastWindow: 2,
        failedLastWindow: 0,
        reclaimedLastWindow: 0,
        skippedActiveLeaseLastWindow: 0,
        netDrainEstimate: 4,
        drainState: "large_but_draining",
      },
      counters: {
        totalSucceeded: 12,
        totalCancelled: 0,
        totalDeadLettered: 0,
        totalPartitions: 6,
      },
      authoritative: {
        publishedProgression: 1,
        repairBacklog: 0,
        validationFailures24h: 0,
        d1SlaBreaches: 0,
        lastSuccessfulPublishAt: "2026-04-15T00:00:00.000Z",
      },
    } as never);

    const verdict = await releaseGates.evaluateReleaseGate({ persist: false });

    expect(verdict.baseResult).toBe("pass");
    expect(verdict.verdict).toBe("pass");
    expect(verdict.blockerClass).toBeNull();
    expect(verdict.gateScope).toBe("release_readiness");
    expect(verdict.evidence).toMatchObject({
      canaries: [
        expect.objectContaining({
          pass: true,
          blockerClass: "none",
          evidence: expect.objectContaining({
            queueDepth: 6,
            activityState: "busy",
            truthReady: true,
            recentTruthState: "finalized_verified",
            priorityTruthState: "finalized_verified",
          }),
        }),
      ],
    });
  });

  it("retries transient canary snapshot failures before passing the release gate", async () => {
    process.env.SYNC_RELEASE_CANARY_BUSINESSES = "172d0ab8-495b-4679-a4c6-ffa404c389d3";
    vi.mocked(benchmark.collectMetaSyncReadinessSnapshot)
      .mockRejectedValueOnce(new Error("temporary timeout"))
      .mockRejectedValueOnce(new Error("temporary timeout"))
      .mockResolvedValueOnce(makeReadySnapshot());

    const verdict = await releaseGates.evaluateReleaseGate({ persist: false });

    expect(verdict.baseResult).toBe("pass");
    expect(verdict.verdict).toBe("pass");
    expect(benchmark.collectMetaSyncReadinessSnapshot).toHaveBeenCalledTimes(3);
    expect(verdict.evidence).toMatchObject({
      canaries: [
        expect.objectContaining({
          pass: true,
          evidence: expect.objectContaining({
            snapshotCollectionAttempts: 3,
          }),
        }),
      ],
    });
  });

  it("collects canary snapshots serially", async () => {
    const firstBusinessId = "172d0ab8-495b-4679-a4c6-ffa404c389d3";
    const secondBusinessId = "5dbc7147-f051-4681-a4d6-20617170074f";
    process.env.SYNC_RELEASE_CANARY_BUSINESSES = `${firstBusinessId},${secondBusinessId}`;

    let resolveFirst: (() => void) | undefined;
    let resolveSecond: (() => void) | undefined;
    const callOrder: string[] = [];

    vi.mocked(benchmark.collectMetaSyncReadinessSnapshot).mockImplementation(({ businessId }) => {
      callOrder.push(businessId);
      return new Promise((resolve) => {
        const snapshot = {
          ...makeReadySnapshot(),
          businessId,
          businessName: businessId === firstBusinessId ? "TheSwaf" : "Grandmix",
        } as ReturnType<typeof makeReadySnapshot>;
        if (businessId === firstBusinessId) {
          resolveFirst = () => resolve(snapshot);
          return;
        }
        resolveSecond = () => resolve(snapshot);
      });
    });

    const verdictPromise = releaseGates.evaluateReleaseGate({ persist: false });
    await Promise.resolve();

    expect(callOrder).toEqual([firstBusinessId]);
    expect(resolveFirst).toBeDefined();
    expect(resolveSecond).toBeUndefined();

    resolveFirst?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(callOrder).toEqual([firstBusinessId, secondBusinessId]);
    expect(resolveSecond).toBeDefined();

    resolveSecond?.();
    const verdict = await verdictPromise;

    expect(verdict.baseResult).toBe("pass");
    expect(verdict.verdict).toBe("pass");
    expect(benchmark.collectMetaSyncReadinessSnapshot).toHaveBeenCalledTimes(2);
  });

  it("fails closed with a persisted release-gate record shape when canary snapshots keep throwing", async () => {
    process.env.SYNC_RELEASE_CANARY_BUSINESSES = "172d0ab8-495b-4679-a4c6-ffa404c389d3";
    process.env.SYNC_RELEASE_GATE_MODE = "block";
    vi.mocked(benchmark.collectMetaSyncReadinessSnapshot).mockRejectedValue(
      new Error("Meta benchmark business 172d0ab8-495b-4679-a4c6-ffa404c389d3 is not visible in admin sync health."),
    );

    const verdict = await releaseGates.evaluateReleaseGate({ persist: false });

    expect(verdict.baseResult).toBe("fail");
    expect(verdict.verdict).toBe("blocked");
    expect(verdict.blockerClass).toBe("service_unavailable");
    expect(benchmark.collectMetaSyncReadinessSnapshot).toHaveBeenCalledTimes(3);
    expect(verdict.evidence).toMatchObject({
      canaries: [
        expect.objectContaining({
          pass: false,
          blockerClass: "service_unavailable",
          evidence: expect.objectContaining({
            truthReady: false,
            snapshotCollectionAttempts: 3,
            snapshotError:
              "Meta benchmark business 172d0ab8-495b-4679-a4c6-ffa404c389d3 is not visible in admin sync health.",
          }),
        }),
      ],
    });
  });

  it("enforces only blocked or misconfigured verdicts", () => {
    expect(
      releaseGates.shouldEnforceSyncGateFailure([
        { verdict: "measure_only" },
        { verdict: "warn_only" },
      ] as never),
    ).toBe(false);
    expect(
      releaseGates.shouldEnforceSyncGateFailure([
        { verdict: "blocked" },
      ] as never),
    ).toBe(true);
    expect(
      releaseGates.shouldEnforceSyncGateFailure([
        { verdict: "misconfigured" },
      ] as never),
    ).toBe(true);
  });
});
