import { describe, expect, it, vi } from "vitest";
import type { SyncRepairExecutionRecord } from "@/lib/sync/remediation-executions";
import type { SyncRepairRecommendation } from "@/lib/sync/repair-planner";

vi.mock("@/lib/sync/repair-planner", () => ({
  evaluateAndPersistSyncRepairPlan: vi.fn(),
}));

vi.mock("@/lib/sync/remediation-executions", () => ({
  createSyncRepairExecution: vi.fn(),
  finalizeStaleRunningSyncRepairExecutions: vi.fn(),
  getLatestSyncRepairExecution: vi.fn(),
  listRecentSyncRepairExecutions: vi.fn(),
}));

vi.mock("@/lib/sync/incidents", () => ({
  buildSyncRepairExecutionSignature: vi.fn(),
  transitionSyncIncident: vi.fn(),
}));

vi.mock("@/lib/sync/provider-job-lock", () => ({
  acquireProviderJobLock: vi.fn(),
  releaseExpiredProviderJobLock: vi.fn(),
  releaseProviderJobLock: vi.fn(),
}));

vi.mock("@/lib/sync/release-gates", () => ({
  evaluateAndPersistSyncGates: vi.fn(),
}));

vi.mock("@/lib/google-ads/control-plane-runtime", () => ({
  evaluateAndPersistGoogleAdsControlPlane: vi.fn(),
}));

vi.mock("@/lib/sync/meta-sync", () => ({
  enqueueMetaScheduledWork: vi.fn(),
  refreshMetaSyncStateForBusiness: vi.fn(),
  consumeMetaQueuedWork: vi.fn(),
}));

vi.mock("@/lib/meta/warehouse", () => ({
  cleanupMetaPartitionOrchestration: vi.fn(),
  getMetaQueueHealth: vi.fn(),
  replayMetaDeadLetterPartitions: vi.fn(),
}));

vi.mock("@/lib/sync/provider-repair-engine", () => ({
  runMetaRepairCycle: vi.fn(),
  runGoogleAdsRepairCycle: vi.fn(),
}));

vi.mock("@/lib/sync/google-ads-sync", () => ({
  enqueueGoogleAdsScheduledWork: vi.fn(),
  refreshGoogleAdsSyncStateForBusiness: vi.fn(),
}));

vi.mock("@/lib/google-ads/warehouse", () => ({
  cleanupGoogleAdsPartitionOrchestration: vi.fn(),
  getGoogleAdsQueueHealth: vi.fn(),
  replayGoogleAdsDeadLetterPartitions: vi.fn(),
}));

vi.mock("@/lib/sync/worker-health", () => ({
  acquireSyncRunnerLease: vi.fn(),
  releaseSyncRunnerLease: vi.fn(),
  renewSyncRunnerLease: vi.fn(),
}));

const repairExecutor = await import("@/lib/sync/repair-executor");
const incidents = await import("@/lib/sync/incidents");
const remediationExecutions = await import("@/lib/sync/remediation-executions");
const providerJobLock = await import("@/lib/sync/provider-job-lock");

function buildExecution(
  overrides: Partial<SyncRepairExecutionRecord> = {},
): SyncRepairExecutionRecord {
  return {
    id: "exec-1",
    buildId: "build-1",
    environment: "production",
    providerScope: "meta",
    businessId: "biz-1",
    businessName: "Biz 1",
    executionSignature: "sig-1",
    sourceReleaseGateId: null,
    sourceRepairPlanId: null,
    postRunReleaseGateId: null,
    postRunRepairPlanId: null,
    recommendedAction: "reschedule",
    executedAction: null,
    workflowRunId: null,
    workflowActor: "worker",
    lockOwner: null,
    status: "running",
    outcomeClassification: null,
    expectedOutcomeMet: null,
    beforeEvidence: {},
    actionResult: {},
    afterEvidence: {},
    startedAt: "2026-04-20T12:00:00.000Z",
    finishedAt: null,
    ...overrides,
  };
}

function buildRecommendation(
  overrides: Partial<SyncRepairRecommendation> = {},
): SyncRepairRecommendation {
  return {
    businessId: "biz-1",
    businessName: "Biz 1",
    blockerClass: "queue_blocked",
    recommendedAction: "reschedule",
    reason: "Queued work exists without an active lease.",
    beforeEvidence: {
      queueDepth: 12,
      leasedPartitions: 0,
      deadLetterPartitions: 0,
      truthReady: false,
    },
    expectedOutcome: "Queued work is re-admitted.",
    safetyClassification: "safe_idempotent",
    ...overrides,
  };
}

describe("resolveSyncRepairExecutionWindowState", () => {
  it("keeps cooldown active for the latest matching execution", () => {
    const latestExecution = buildExecution({
      startedAt: "2026-04-20T12:00:30.000Z",
      executionSignature: "sig-1",
    });

    const result = repairExecutor.resolveSyncRepairExecutionWindowState({
      executionSignature: "sig-1",
      latestExecution,
      recentExecutions: [latestExecution],
      nowMs: Date.parse("2026-04-20T12:01:00.000Z"),
    });

    expect(result.cooldownRemainingMs).toBeGreaterThan(0);
    expect(result.halfOpenProbe).toBe(false);
  });

  it("keeps exhaustion cooldown active while the open-circuit window is still open", () => {
    const exhaustedExecution = buildExecution({
      status: "exhausted",
      startedAt: "2026-04-20T10:00:00.000Z",
      finishedAt: "2026-04-20T11:30:00.000Z",
    });

    const result = repairExecutor.resolveSyncRepairExecutionWindowState({
      executionSignature: "sig-1",
      latestExecution: exhaustedExecution,
      recentExecutions: [exhaustedExecution],
      nowMs: Date.parse("2026-04-20T12:00:00.000Z"),
    });

    expect(result.exhaustionRemainingMs).toBeGreaterThan(0);
    expect(result.halfOpenProbe).toBe(false);
  });

  it("opens a half-open probe once exhaustion cooldown has elapsed", () => {
    const exhaustedExecution = buildExecution({
      status: "exhausted",
      startedAt: "2026-04-20T09:00:00.000Z",
      finishedAt: "2026-04-20T11:00:00.000Z",
    });

    const result = repairExecutor.resolveSyncRepairExecutionWindowState({
      executionSignature: "sig-1",
      latestExecution: exhaustedExecution,
      recentExecutions: [exhaustedExecution],
      nowMs: Date.parse("2026-04-20T12:05:00.000Z"),
    });

    expect(result.exhaustionRemainingMs).toBe(0);
    expect(result.halfOpenProbe).toBe(true);
  });

  it("marks repeated terminal failures as quarantine-eligible", () => {
    const failedExecutions = [
      buildExecution({
        status: "failed",
        outcomeClassification: "manual_follow_up_required",
        startedAt: "2026-04-20T10:00:00.000Z",
        finishedAt: "2026-04-20T10:01:00.000Z",
      }),
      buildExecution({
        id: "exec-2",
        status: "failed",
        outcomeClassification: "manual_follow_up_required",
        startedAt: "2026-04-20T11:00:00.000Z",
        finishedAt: "2026-04-20T11:01:00.000Z",
      }),
      buildExecution({
        id: "exec-3",
        status: "exhausted",
        outcomeClassification: "manual_follow_up_required",
        startedAt: "2026-04-20T12:00:00.000Z",
        finishedAt: "2026-04-20T12:01:00.000Z",
      }),
    ];

    const result = repairExecutor.resolveSyncRepairExecutionWindowState({
      executionSignature: "sig-1",
      latestExecution: failedExecutions[0],
      recentExecutions: failedExecutions,
      nowMs: Date.parse("2026-04-20T12:05:00.000Z"),
    });

    expect(result.quarantineStrikeCount).toBe(3);
    expect(result.quarantineEligible).toBe(true);
  });
});

describe("executeAutoSyncRepairRecommendation", () => {
  it("quarantines repeated terminal failures before running another repair", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T13:00:00.000Z"));
    vi.mocked(incidents.buildSyncRepairExecutionSignature).mockReturnValue("sig-1");
    vi.mocked(remediationExecutions.finalizeStaleRunningSyncRepairExecutions).mockResolvedValue([]);
    vi.mocked(remediationExecutions.getLatestSyncRepairExecution).mockResolvedValue(null);
    vi.mocked(remediationExecutions.listRecentSyncRepairExecutions).mockResolvedValue([
      buildExecution({
        status: "failed",
        outcomeClassification: "manual_follow_up_required",
        startedAt: "2026-04-20T10:00:00.000Z",
        finishedAt: "2026-04-20T10:01:00.000Z",
      }),
      buildExecution({
        id: "exec-2",
        status: "failed",
        outcomeClassification: "manual_follow_up_required",
        startedAt: "2026-04-20T11:00:00.000Z",
        finishedAt: "2026-04-20T11:01:00.000Z",
      }),
      buildExecution({
        id: "exec-3",
        status: "exhausted",
        outcomeClassification: "manual_follow_up_required",
        startedAt: "2026-04-20T12:00:00.000Z",
        finishedAt: "2026-04-20T12:01:00.000Z",
      }),
    ]);
    vi.mocked(incidents.transitionSyncIncident).mockResolvedValue(null as never);
    vi.mocked(providerJobLock.releaseExpiredProviderJobLock).mockResolvedValue({
      released: false,
      state: null,
    });

    const result = await repairExecutor.executeAutoSyncRepairRecommendation({
        providerScope: "meta",
        recommendation: buildRecommendation(),
        source: "worker",
      }).finally(() => {
        vi.useRealTimers();
      });

    expect(result.skippedReason).toBe("quarantined");
    expect(result.execution).toBeNull();
    expect(remediationExecutions.createSyncRepairExecution).not.toHaveBeenCalled();
    expect(incidents.transitionSyncIncident).toHaveBeenCalledWith(
      expect.objectContaining({
        providerScope: "meta",
        nextStatus: "quarantined",
      }),
    );
  });
});
