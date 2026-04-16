import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/build-runtime", () => ({
  getCurrentRuntimeBuildId: vi.fn(() => "build-1"),
}));

vi.mock("@/lib/meta-sync-benchmark", () => ({
  collectMetaSyncReadinessSnapshot: vi.fn(),
}));

vi.mock("@/lib/provider-account-assignments", () => ({
  getProviderAccountAssignments: vi.fn(),
}));

vi.mock("@/lib/meta/warehouse", () => ({
  getMetaAuthoritativeBusinessOpsSnapshot: vi.fn(),
  getMetaAuthoritativeDayVerification: vi.fn(),
  getMetaQueueHealth: vi.fn(),
  replayMetaDeadLetterPartitions: vi.fn(),
  cleanupMetaPartitionOrchestration: vi.fn(),
}));

vi.mock("@/lib/meta/authoritative-ops", () => ({
  buildMetaStateCheckOutput: vi.fn((value) => value),
  buildMetaVerifyDayReport: vi.fn((value) => value),
  buildMetaPublishVerificationReport: vi.fn((value) => value),
}));

vi.mock("@/lib/sync/meta-sync", () => ({
  enqueueMetaScheduledWork: vi.fn(),
  refreshMetaSyncStateForBusiness: vi.fn(),
}));

vi.mock("@/lib/sync/provider-job-lock", () => ({
  acquireProviderJobLock: vi.fn(),
  renewProviderJobLock: vi.fn(),
  releaseProviderJobLock: vi.fn(),
}));

vi.mock("@/lib/sync/repair-planner", () => ({
  getSyncRepairPlanById: vi.fn(),
  evaluateAndPersistSyncRepairPlan: vi.fn(),
}));

vi.mock("@/lib/sync/remediation-executions", () => ({
  createSyncRepairExecution: vi.fn(),
  updateSyncRepairExecution: vi.fn(),
  getLatestSyncRepairExecutionSummary: vi.fn(),
}));

vi.mock("@/lib/sync/release-gates", () => ({
  classifyReleaseSnapshot: vi.fn((snapshot: { __pass?: boolean; __truthReady?: boolean; __blockerClass?: string }) => ({
    pass: snapshot.__pass ?? false,
    blockerClass: snapshot.__blockerClass ?? "queue_blocked",
    evidence: {
      truthReady: snapshot.__truthReady ?? false,
    },
  })),
  getLatestSyncGateRecords: vi.fn(),
  getSyncGateRecordById: vi.fn(),
  evaluateAndPersistSyncGates: vi.fn(),
}));

vi.mock("@/lib/sync/provider-repair-engine", () => ({
  runMetaRepairCycle: vi.fn(),
}));

const benchmark = await import("@/lib/meta-sync-benchmark");
const providerAccountAssignments = await import("@/lib/provider-account-assignments");
const warehouse = await import("@/lib/meta/warehouse");
const metaSync = await import("@/lib/sync/meta-sync");
const providerJobLock = await import("@/lib/sync/provider-job-lock");
const repairPlanner = await import("@/lib/sync/repair-planner");
const remediationExecutions = await import("@/lib/sync/remediation-executions");
const releaseGates = await import("@/lib/sync/release-gates");
const repairEngine = await import("@/lib/sync/provider-repair-engine");
const remediation = await import("@/lib/sync/meta-canary-remediation");

function makeSnapshot(input?: {
  businessId?: string;
  businessName?: string;
  queueDepth?: number;
  leasedPartitions?: number;
  deadLetterPartitions?: number;
  repairBacklog?: number;
  validationFailures24h?: number;
  d1FinalizeNonTerminalCount?: number;
  activityState?: string;
  progressState?: string;
  recentPercent?: number;
  priorityPercent?: number;
  lastSuccessfulPublishAt?: string | null;
  workerOnline?: boolean;
  pass?: boolean;
  truthReady?: boolean;
  blockerClass?: string;
}) {
  return {
    businessId: input?.businessId ?? "biz-1",
    businessName: input?.businessName ?? "TheSwaf",
    queue: {
      queueDepth: input?.queueDepth ?? 4,
      leasedPartitions: input?.leasedPartitions ?? 0,
      retryableFailedPartitions: 0,
      deadLetterPartitions: input?.deadLetterPartitions ?? 0,
      staleLeasePartitions: 0,
    },
    authoritative: {
      repairBacklog: input?.repairBacklog ?? 2,
      validationFailures24h: input?.validationFailures24h ?? 1,
      lastSuccessfulPublishAt: input?.lastSuccessfulPublishAt ?? null,
    },
    operator: {
      d1FinalizeNonTerminalCount: input?.d1FinalizeNonTerminalCount ?? 1,
      activityState: input?.activityState ?? "blocked",
      progressState: input?.progressState ?? "partial_stuck",
      lastSuccessfulPublishAt: input?.lastSuccessfulPublishAt ?? null,
      workerOnline: input?.workerOnline ?? true,
    },
    userFacing: {
      recentSelectedRangeTruth: {
        state: input?.truthReady ? "ready" : "processing",
        percent: input?.recentPercent ?? 14,
      },
      priorityWindowTruth: {
        state: input?.truthReady ? "ready" : "processing",
        percent: input?.priorityPercent ?? 33,
      },
    },
    windows: {
      recent: {
        startDate: "2026-04-09",
        endDate: "2026-04-15",
      },
      priority: {
        startDate: "2026-04-13",
        endDate: "2026-04-15",
      },
    },
    __pass: input?.pass ?? false,
    __truthReady: input?.truthReady ?? false,
    __blockerClass: input?.blockerClass ?? "queue_blocked",
  } as never;
}

function makeReleaseGate(overrides?: Record<string, unknown>) {
  return {
    id: "rg-1",
    gateKind: "release_gate",
    gateScope: "release_readiness",
    buildId: "build-1",
    environment: "production",
    mode: "measure_only",
    baseResult: "fail",
    verdict: "measure_only",
    blockerClass: "queue_blocked",
    summary: "release blocked",
    breakGlass: false,
    overrideReason: null,
    evidence: {},
    emittedAt: "2026-04-15T12:00:00.000Z",
    ...overrides,
  } as never;
}

function makeRepairPlan(overrides?: Record<string, unknown>) {
  return {
    id: "rp-1",
    buildId: "build-1",
    environment: "production",
    providerScope: "meta",
    planMode: "dry_run",
    eligible: true,
    blockedReason: null,
    breakGlass: false,
    recommendations: [
      {
        businessId: "biz-1",
        businessName: "TheSwaf",
        recommendedAction: "integrity_repair_enqueue",
        reason: "truth backlog",
        safetyClassification: "safe_guarded",
        beforeEvidence: {
          queueDepth: 4,
          truthReady: false,
        },
      },
    ],
    ...overrides,
  } as never;
}

function makeExecution(input?: Record<string, unknown>) {
  return {
    id: "exec-1",
    buildId: "build-1",
    environment: "production",
    providerScope: "meta",
    businessId: "biz-1",
    businessName: "TheSwaf",
    sourceReleaseGateId: "rg-1",
    sourceRepairPlanId: "rp-1",
    postRunReleaseGateId: null,
    postRunRepairPlanId: null,
    recommendedAction: "integrity_repair_enqueue",
    executedAction: null,
    workflowRunId: "run-1",
    workflowActor: "codex",
    lockOwner: "run-1:biz-1",
    status: "running",
    outcomeClassification: null,
    expectedOutcomeMet: null,
    beforeEvidence: {},
    actionResult: {},
    afterEvidence: {},
    startedAt: "2026-04-15T12:00:00.000Z",
    finishedAt: null,
    ...input,
  } as never;
}

describe("meta canary remediation", () => {
  let executionStore: Map<string, Record<string, unknown>>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00.000Z"));
    vi.resetAllMocks();
    executionStore = new Map();

    vi.mocked(releaseGates.getSyncGateRecordById).mockResolvedValue(makeReleaseGate());
    vi.mocked(repairPlanner.getSyncRepairPlanById).mockResolvedValue(makeRepairPlan());
    vi.mocked(releaseGates.getLatestSyncGateRecords).mockResolvedValue({
      deployGate: {
        id: "dg-1",
        verdict: "pass",
      },
      releaseGate: makeReleaseGate(),
    } as never);
    vi.mocked(providerJobLock.acquireProviderJobLock).mockResolvedValue({
      acquired: true,
      alreadyRunning: false,
    });
    vi.mocked(providerJobLock.renewProviderJobLock).mockResolvedValue(true);
    vi.mocked(providerJobLock.releaseProviderJobLock).mockResolvedValue(undefined);
    vi.mocked(remediationExecutions.createSyncRepairExecution).mockImplementation(async (input) => {
      const execution = makeExecution(input as Record<string, unknown>) as Record<string, unknown> & {
        id: string;
      };
      executionStore.set(execution.id, execution);
      return execution as never;
    });
    vi.mocked(remediationExecutions.updateSyncRepairExecution).mockImplementation(async (id, input) => {
      const current = executionStore.get(id) ?? (makeExecution() as Record<string, unknown>);
      const next = makeExecution({
        ...current,
        ...input,
        finishedAt:
          input.finishedAt === undefined
            ? (current.finishedAt as string | null | undefined) ?? "2026-04-15T12:00:31.000Z"
            : input.finishedAt,
      });
      executionStore.set(id, next as Record<string, unknown>);
      return next as never;
    });
    vi.mocked(remediationExecutions.getLatestSyncRepairExecutionSummary).mockResolvedValue({
      buildId: "build-1",
      environment: "production",
      providerScope: "meta",
      latestStartedAt: "2026-04-15T12:00:00.000Z",
      latestFinishedAt: "2026-04-15T12:00:31.000Z",
      improvedAny: true,
      businessCount: 1,
      counts: {
        cleared: 1,
        improving_not_cleared: 0,
        no_change: 0,
        worse: 0,
        manual_follow_up_required: 0,
        locked: 0,
      },
    });
    vi.mocked(releaseGates.evaluateAndPersistSyncGates).mockResolvedValue({
      deployGate: {
        id: "dg-2",
        verdict: "pass",
      },
      releaseGate: makeReleaseGate({
        id: "rg-2",
        baseResult: "pass",
        verdict: "measure_only",
        blockerClass: null,
      }),
    } as never);
    vi.mocked(repairPlanner.evaluateAndPersistSyncRepairPlan).mockResolvedValue(makeRepairPlan());
    vi.mocked(repairEngine.runMetaRepairCycle).mockResolvedValue({
      ok: true,
      queuedRepairs: 2,
    } as never);
    vi.mocked(providerAccountAssignments.getProviderAccountAssignments).mockResolvedValue({
      account_ids: ["act_1"],
    } as never);
    vi.mocked(warehouse.getMetaAuthoritativeBusinessOpsSnapshot).mockResolvedValue({
      d1FinalizeSla: {
        accounts: [],
      },
    } as never);
    vi.mocked(warehouse.getMetaAuthoritativeDayVerification).mockResolvedValue(null as never);
    vi.mocked(warehouse.replayMetaDeadLetterPartitions).mockResolvedValue({ replayed: 1 } as never);
    vi.mocked(warehouse.getMetaQueueHealth).mockResolvedValue({ queueDepth: 0 } as never);
    vi.mocked(metaSync.enqueueMetaScheduledWork).mockResolvedValue({ queued: true } as never);
    vi.mocked(metaSync.refreshMetaSyncStateForBusiness).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects build mismatches before loading pinned rows", async () => {
    await expect(
      remediation.runMetaCanaryRemediation({
        expectedBuildId: "build-2",
        releaseGateId: "rg-1",
        repairPlanId: "rp-1",
      }),
    ).rejects.toThrow("Expected deployed build build-2 but current runtime build is build-1.");

    expect(releaseGates.getSyncGateRecordById).not.toHaveBeenCalled();
  });

  it("rejects missing pinned release gate rows", async () => {
    vi.mocked(releaseGates.getSyncGateRecordById).mockResolvedValue(null);

    await expect(
      remediation.runMetaCanaryRemediation({
        expectedBuildId: "build-1",
        releaseGateId: "missing",
        repairPlanId: "rp-1",
      }),
    ).rejects.toThrow("Pinned release gate record was not found.");
  });

  it("rejects missing pinned repair plan rows", async () => {
    vi.mocked(repairPlanner.getSyncRepairPlanById).mockResolvedValue(null);

    await expect(
      remediation.runMetaCanaryRemediation({
        expectedBuildId: "build-1",
        releaseGateId: "rg-1",
        repairPlanId: "missing",
      }),
    ).rejects.toThrow("Pinned repair plan record was not found.");
  });

  it("records a locked execution when the business lock cannot be acquired", async () => {
    vi.mocked(providerJobLock.acquireProviderJobLock).mockResolvedValue({
      acquired: false,
      alreadyRunning: true,
    });

    const result = await remediation.runMetaCanaryRemediation({
      expectedBuildId: "build-1",
      releaseGateId: "rg-1",
      repairPlanId: "rp-1",
      workflowRunId: "run-1",
      workflowActor: "codex",
    });

    expect(result.executions[0]?.outcomeClassification).toBe("locked");
    expect(result.executions[0]?.sourceReleaseGateId).toBe("rg-1");
    expect(result.executions[0]?.sourceRepairPlanId).toBe("rp-1");
    expect(remediationExecutions.createSyncRepairExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceReleaseGateId: "rg-1",
        sourceRepairPlanId: "rp-1",
        status: "locked",
        outcomeClassification: "locked",
      }),
    );
    expect(repairEngine.runMetaRepairCycle).not.toHaveBeenCalled();
  });

  it("maps integrity repair recommendations to the repair cycle and records a cleared outcome", async () => {
    vi.mocked(benchmark.collectMetaSyncReadinessSnapshot)
      .mockResolvedValueOnce(makeSnapshot())
      .mockResolvedValueOnce(
        makeSnapshot({
          queueDepth: 1,
          recentPercent: 66,
          priorityPercent: 100,
          lastSuccessfulPublishAt: "2026-04-15T12:00:31.000Z",
          pass: true,
          truthReady: true,
          activityState: "busy",
          progressState: "syncing",
        }),
      )
      .mockResolvedValueOnce(
        makeSnapshot({
          queueDepth: 0,
          recentPercent: 100,
          priorityPercent: 100,
          lastSuccessfulPublishAt: "2026-04-15T12:00:31.000Z",
          pass: true,
          truthReady: true,
          activityState: "busy",
          progressState: "syncing",
        }),
      );

    const runPromise = remediation.runMetaCanaryRemediation({
      expectedBuildId: "build-1",
      releaseGateId: "rg-1",
      repairPlanId: "rp-1",
      workflowRunId: "run-1",
      workflowActor: "codex",
    });
    await vi.runAllTimersAsync();
    const result = await runPromise;

    expect(repairEngine.runMetaRepairCycle).toHaveBeenCalledWith("biz-1", {
      enqueueScheduledWork: true,
      queueWarehouseRepairs: true,
    });
    expect(remediationExecutions.updateSyncRepairExecution).toHaveBeenCalledWith(
      "exec-1",
      expect.objectContaining({
        executedAction: "repair_cycle",
        outcomeClassification: "cleared",
        expectedOutcomeMet: true,
      }),
    );
    expect(providerJobLock.releaseProviderJobLock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz-1",
        ownerToken: "run-1:biz-1",
        status: "done",
      }),
    );
    expect(result.executions[0]?.executedAction).toBe("repair_cycle");
    expect(result.executions[0]?.postRunReleaseGateId).toBe("rg-2");
    expect(result.executions[0]?.postRunRepairPlanId).toBe("rp-1");
    expect(result.finalReleaseGate.id).toBe("rg-2");
    expect(result.successMode).toBe("proof");
    expect(result.targetBusinessIds).toEqual(["biz-1"]);
    expect(result.proofPassed).toBe(true);
    expect(result.clearancePassed).toBe(true);
    expect(result.businessImprovementObserved).toBe(true);
    expect(result.outcomeCounts.cleared).toBe(1);
    expect(remediationExecutions.updateSyncRepairExecution).toHaveBeenCalledWith(
      "exec-1",
      expect.objectContaining({
        postRunReleaseGateId: "rg-2",
        postRunRepairPlanId: "rp-1",
      }),
    );
  });

  it("passes proof mode without clearance when the audit chain is intact but the business does not improve", async () => {
    vi.mocked(benchmark.collectMetaSyncReadinessSnapshot).mockResolvedValue(makeSnapshot());
    vi.mocked(remediationExecutions.getLatestSyncRepairExecutionSummary).mockResolvedValue({
      buildId: "build-1",
      environment: "production",
      providerScope: "meta",
      latestStartedAt: "2026-04-15T12:00:00.000Z",
      latestFinishedAt: "2026-04-15T12:06:00.000Z",
      improvedAny: false,
      businessCount: 1,
      counts: {
        cleared: 0,
        improving_not_cleared: 0,
        no_change: 1,
        worse: 0,
        manual_follow_up_required: 0,
        locked: 0,
      },
    });
    vi.mocked(remediationExecutions.updateSyncRepairExecution).mockImplementation(async (id, input) => {
      const current = executionStore.get(id) ?? (makeExecution() as Record<string, unknown>);
      const next = makeExecution({
        ...current,
        ...input,
        outcomeClassification: input.outcomeClassification ?? "no_change",
        expectedOutcomeMet: input.expectedOutcomeMet ?? false,
        actionResult: input.actionResult ?? current.actionResult ?? { ok: true },
        afterEvidence: input.afterEvidence ?? current.afterEvidence ?? { queueDepth: 4 },
        finishedAt:
          input.finishedAt === undefined
            ? (current.finishedAt as string | null | undefined) ?? "2026-04-15T12:00:31.000Z"
            : input.finishedAt,
      }) as Record<string, unknown> & { id: string };
      executionStore.set(id, next);
      return next as never;
    });

    const runPromise = remediation.runMetaCanaryRemediation({
      expectedBuildId: "build-1",
      releaseGateId: "rg-1",
      repairPlanId: "rp-1",
      successMode: "proof",
      workflowRunId: "run-1",
      workflowActor: "codex",
    });
    await vi.runAllTimersAsync();
    const result = await runPromise;

    expect(result.proofPassed).toBe(true);
    expect(result.clearancePassed).toBe(false);
    expect(result.businessImprovementObserved).toBe(false);
    expect(result.outcomeCounts.no_change).toBe(1);
  });

  it("does not turn slow after-evidence polling into manual follow-up when the audit chain is otherwise intact", async () => {
    vi.mocked(benchmark.collectMetaSyncReadinessSnapshot).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(makeSnapshot()), 45_000);
        }) as never,
    );
    vi.mocked(remediationExecutions.getLatestSyncRepairExecutionSummary).mockResolvedValue({
      buildId: "build-1",
      environment: "production",
      providerScope: "meta",
      latestStartedAt: "2026-04-15T12:00:00.000Z",
      latestFinishedAt: "2026-04-15T12:08:00.000Z",
      improvedAny: false,
      businessCount: 1,
      counts: {
        cleared: 0,
        improving_not_cleared: 0,
        no_change: 1,
        worse: 0,
        manual_follow_up_required: 0,
        locked: 0,
      },
    });
    vi.mocked(remediationExecutions.updateSyncRepairExecution).mockImplementation(async (id, input) => {
      const current = executionStore.get(id) ?? (makeExecution() as Record<string, unknown>);
      const next = makeExecution({
        ...current,
        ...input,
        outcomeClassification: input.outcomeClassification ?? "no_change",
        expectedOutcomeMet: input.expectedOutcomeMet ?? false,
        actionResult: input.actionResult ?? current.actionResult ?? { ok: true },
        afterEvidence: input.afterEvidence ?? current.afterEvidence ?? { queueDepth: 4 },
        finishedAt:
          input.finishedAt === undefined
            ? (current.finishedAt as string | null | undefined) ?? "2026-04-15T12:08:00.000Z"
            : input.finishedAt,
      }) as Record<string, unknown> & { id: string };
      executionStore.set(id, next);
      return next as never;
    });

    const runPromise = remediation.runMetaCanaryRemediation({
      expectedBuildId: "build-1",
      releaseGateId: "rg-1",
      repairPlanId: "rp-1",
      successMode: "proof",
      workflowRunId: "run-1",
      workflowActor: "codex",
    });
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    const result = await runPromise;

    expect(result.executions[0]?.outcomeClassification).toBe("no_change");
    expect(result.proofPassed).toBe(true);
    expect(result.clearancePassed).toBe(false);
    expect(result.outcomeCounts.manual_follow_up_required).toBe(0);
    expect(result.outcomeCounts.no_change).toBe(1);
  });

  it("times out long-running repair actions and records manual follow-up instead of hanging forever", async () => {
    vi.mocked(benchmark.collectMetaSyncReadinessSnapshot).mockResolvedValue(makeSnapshot());
    vi.mocked(repairEngine.runMetaRepairCycle).mockImplementation(
      () => new Promise(() => undefined) as never,
    );
    vi.mocked(remediationExecutions.getLatestSyncRepairExecutionSummary).mockResolvedValue({
      buildId: "build-1",
      environment: "production",
      providerScope: "meta",
      latestStartedAt: "2026-04-15T12:00:00.000Z",
      latestFinishedAt: "2026-04-15T12:05:01.000Z",
      improvedAny: false,
      businessCount: 1,
      counts: {
        cleared: 0,
        improving_not_cleared: 0,
        no_change: 0,
        worse: 0,
        manual_follow_up_required: 1,
        locked: 0,
      },
    });

    const runPromise = remediation.runMetaCanaryRemediation({
      expectedBuildId: "build-1",
      releaseGateId: "rg-1",
      repairPlanId: "rp-1",
      successMode: "proof",
      workflowRunId: "run-1",
      workflowActor: "codex",
    });
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1_000);
    const result = await runPromise;

    expect(remediationExecutions.updateSyncRepairExecution).toHaveBeenCalledWith(
      "exec-1",
      expect.objectContaining({
        status: "failed",
        outcomeClassification: "manual_follow_up_required",
        expectedOutcomeMet: false,
      }),
    );
    expect(providerJobLock.releaseProviderJobLock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz-1",
        ownerToken: "run-1:biz-1",
        status: "failed",
      }),
    );
    expect(result.executions[0]?.outcomeClassification).toBe("manual_follow_up_required");
    expect(result.proofPassed).toBe(false);
    expect(result.clearancePassed).toBe(false);
  });

  it("times out blocked authoritative diagnostics and records manual follow-up instead of hanging forever", async () => {
    vi.mocked(benchmark.collectMetaSyncReadinessSnapshot).mockResolvedValue(makeSnapshot());
    vi.mocked(warehouse.getMetaAuthoritativeBusinessOpsSnapshot).mockImplementation(
      () => new Promise(() => undefined) as never,
    );
    vi.mocked(remediationExecutions.getLatestSyncRepairExecutionSummary).mockResolvedValue({
      buildId: "build-1",
      environment: "production",
      providerScope: "meta",
      latestStartedAt: "2026-04-15T12:00:00.000Z",
      latestFinishedAt: "2026-04-15T12:04:31.000Z",
      improvedAny: false,
      businessCount: 1,
      counts: {
        cleared: 0,
        improving_not_cleared: 0,
        no_change: 0,
        worse: 0,
        manual_follow_up_required: 1,
        locked: 0,
      },
    });

    const runPromise = remediation.runMetaCanaryRemediation({
      expectedBuildId: "build-1",
      releaseGateId: "rg-1",
      repairPlanId: "rp-1",
      successMode: "proof",
      workflowRunId: "run-1",
      workflowActor: "codex",
    });
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 5_000);
    const result = await runPromise;

    expect(remediationExecutions.updateSyncRepairExecution).toHaveBeenCalledWith(
      "exec-1",
      expect.objectContaining({
        status: "failed",
        outcomeClassification: "manual_follow_up_required",
        expectedOutcomeMet: false,
      }),
    );
    expect(providerJobLock.releaseProviderJobLock).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz-1",
        ownerToken: "run-1:biz-1",
        status: "failed",
      }),
    );
    expect(result.executions[0]?.outcomeClassification).toBe("manual_follow_up_required");
    expect(result.proofPassed).toBe(false);
    expect(result.clearancePassed).toBe(false);
  }, 15_000);

  it("maps repair recommendations deterministically", () => {
    expect(remediation.mapRepairRecommendationToExecutionAction("integrity_repair_enqueue")).toBe("repair_cycle");
    expect(remediation.mapRepairRecommendationToExecutionAction("reschedule")).toBe("reschedule");
    expect(remediation.mapRepairRecommendationToExecutionAction("refresh_state")).toBe("refresh_state");
    expect(remediation.mapRepairRecommendationToExecutionAction("replay_dead_letter")).toBe("replay_dead_letter");
    expect(remediation.mapRepairRecommendationToExecutionAction("stale_lease_reclaim")).toBe("stale_lease_reclaim");
  });

  it("classifies cleared, improving, no_change, worse, and manual follow-up outcomes", () => {
    const before = {
      businessId: "biz-1",
      businessName: "TheSwaf",
      queueDepth: 4,
      leasedPartitions: 0,
      retryableFailedPartitions: 0,
      deadLetterPartitions: 0,
      staleLeasePartitions: 0,
      repairBacklog: 2,
      validationFailures24h: 1,
      d1FinalizeNonTerminalCount: 1,
      activityState: "blocked",
      progressState: "partial_stuck",
      truthReady: false,
      recentTruthState: "processing",
      priorityTruthState: "processing",
      recentSelectedRangePercent: 14,
      priorityWindowPercent: 33,
      lastSuccessfulPublishAt: null,
      workerOnline: true,
      blockerClass: "queue_blocked",
      releasePass: false,
    };

    expect(
      remediation.classifyCanaryRemediationOutcome({
        before,
        after: {
          ...before,
          queueDepth: 0,
          truthReady: true,
          activityState: "busy",
          progressState: "syncing",
          releasePass: true,
        },
        actionResult: {},
        executedAction: "repair_cycle",
      }).outcome,
    ).toBe("cleared");

    expect(
      remediation.classifyCanaryRemediationOutcome({
        before,
        after: {
          ...before,
          queueDepth: 2,
          recentSelectedRangePercent: 66,
        },
        actionResult: {},
        executedAction: "repair_cycle",
      }).outcome,
    ).toBe("improving_not_cleared");

    expect(
      remediation.classifyCanaryRemediationOutcome({
        before,
        after: before,
        actionResult: {},
        executedAction: "repair_cycle",
      }).outcome,
    ).toBe("no_change");

    expect(
      remediation.classifyCanaryRemediationOutcome({
        before,
        after: {
          ...before,
          queueDepth: 8,
        },
        actionResult: {},
        executedAction: "refresh_state",
      }).outcome,
    ).toBe("worse");

    expect(
      remediation.classifyCanaryRemediationOutcome({
        before,
        after: {
          ...before,
          queueDepth: 8,
          repairBacklog: 3,
        },
        actionResult: {},
        executedAction: "repair_cycle",
      }).outcome,
    ).toBe("improving_not_cleared");

    expect(
      remediation.classifyCanaryRemediationOutcome({
        before,
        after: before,
        actionResult: {
          repair: {
            blockingReasons: [{ code: "manual_truth_defect" }],
          },
        },
        executedAction: "repair_cycle",
      }).outcome,
    ).toBe("manual_follow_up_required");
  });
});
