import {
  buildMetaPublishVerificationReport,
  buildMetaStateCheckOutput,
  buildMetaVerifyDayReport,
} from "@/lib/meta/authoritative-ops";
import { collectMetaSyncReadinessSnapshot, type MetaSyncBenchmarkSnapshot } from "@/lib/meta-sync-benchmark";
import {
  getMetaAuthoritativeBusinessOpsSnapshot,
  getMetaAuthoritativeDayVerification,
  getMetaQueueHealth,
  replayMetaDeadLetterPartitions,
} from "@/lib/meta/warehouse";
import { getCurrentRuntimeBuildId } from "@/lib/build-runtime";
import { enqueueMetaScheduledWork, refreshMetaSyncStateForBusiness } from "@/lib/sync/meta-sync";
import { cleanupMetaPartitionOrchestration } from "@/lib/meta/warehouse";
import { releaseProviderJobLock, acquireProviderJobLock, renewProviderJobLock } from "@/lib/sync/provider-job-lock";
import { evaluateAndPersistSyncRepairPlan, getSyncRepairPlanById, type SyncRepairRecommendation } from "@/lib/sync/repair-planner";
import {
  createSyncRepairExecution,
  getLatestSyncRepairExecutionSummary,
  type SyncRepairExecutionOutcome,
  type SyncRepairExecutionRecord,
  updateSyncRepairExecution,
} from "@/lib/sync/remediation-executions";
import {
  classifyReleaseSnapshot,
  evaluateAndPersistSyncGates,
  getLatestSyncGateRecords,
  getSyncGateRecordById,
  type SyncGateRecord,
} from "@/lib/sync/release-gates";
import { runMetaRepairCycle } from "@/lib/sync/provider-repair-engine";

const META_REMEDIATION_LOCK = {
  provider: "meta",
  reportType: "canary_remediation",
  dateRangeKey: "release_canary",
} as const;

const DEFAULT_POLL_ATTEMPTS = 6;
const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_LOCK_MINUTES = 10;
const DEFAULT_ACTION_TIMEOUT_MS = 5 * 60_000;
const DEFAULT_EVIDENCE_TIMEOUT_MS = 60_000;
const DEFAULT_DIAGNOSTIC_TIMEOUT_MS = 60_000;

type CanaryEvidence = {
  businessId: string;
  businessName: string | null;
  queueDepth: number;
  leasedPartitions: number;
  retryableFailedPartitions: number;
  deadLetterPartitions: number;
  staleLeasePartitions: number;
  repairBacklog: number;
  validationFailures24h: number;
  d1FinalizeNonTerminalCount: number;
  activityState: string | null;
  progressState: string | null;
  truthReady: boolean;
  recentTruthState: string | null;
  priorityTruthState: string | null;
  recentSelectedRangePercent: number;
  priorityWindowPercent: number;
  lastSuccessfulPublishAt: string | null;
  workerOnline: boolean | null;
  blockerClass: string | null;
  releasePass: boolean;
};

export type MetaRemediationExecutedAction =
  | "repair_cycle"
  | "reschedule"
  | "refresh_state"
  | "replay_dead_letter"
  | "stale_lease_reclaim";

export type MetaCanaryRemediationSuccessMode = "proof" | "clearance";

export type MetaCanaryRemediationOutcomeCounts = Record<SyncRepairExecutionOutcome, number>;

export interface MetaCanaryRemediationResult {
  expectedBuildId: string;
  buildId: string;
  successMode: MetaCanaryRemediationSuccessMode;
  targetBusinessIds: string[];
  releaseGate: SyncGateRecord;
  finalReleaseGate: SyncGateRecord;
  repairPlan: Awaited<ReturnType<typeof getSyncRepairPlanById>>;
  finalRepairPlan: Awaited<ReturnType<typeof evaluateAndPersistSyncRepairPlan>>;
  remediationSummary: Awaited<ReturnType<typeof getLatestSyncRepairExecutionSummary>>;
  executions: SyncRepairExecutionRecord[];
  outcomeCounts: MetaCanaryRemediationOutcomeCounts;
  businessImprovementObserved: boolean;
  proofPassed: boolean;
  clearancePassed: boolean;
}

function parseCsv(value: string | null | undefined) {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms.`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function toSafeJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

function buildExecutionEvidence(snapshot: MetaSyncBenchmarkSnapshot): CanaryEvidence {
  const classification = classifyReleaseSnapshot(snapshot);
  return {
    businessId: snapshot.businessId,
    businessName: snapshot.businessName ?? null,
    queueDepth: snapshot.queue.queueDepth,
    leasedPartitions: snapshot.queue.leasedPartitions,
    retryableFailedPartitions: snapshot.queue.retryableFailedPartitions,
    deadLetterPartitions: snapshot.queue.deadLetterPartitions,
    staleLeasePartitions: snapshot.queue.staleLeasePartitions,
    repairBacklog: snapshot.authoritative.repairBacklog,
    validationFailures24h: snapshot.authoritative.validationFailures24h,
    d1FinalizeNonTerminalCount: snapshot.operator.d1FinalizeNonTerminalCount,
    activityState: snapshot.operator.activityState,
    progressState: snapshot.operator.progressState,
    truthReady: classification.evidence.truthReady,
    recentTruthState: snapshot.userFacing.recentSelectedRangeTruth.state,
    priorityTruthState: snapshot.userFacing.priorityWindowTruth.state,
    recentSelectedRangePercent: snapshot.userFacing.recentSelectedRangeTruth.percent,
    priorityWindowPercent: snapshot.userFacing.priorityWindowTruth.percent,
    lastSuccessfulPublishAt:
      snapshot.operator.lastSuccessfulPublishAt ?? snapshot.authoritative.lastSuccessfulPublishAt,
    workerOnline: snapshot.operator.workerOnline,
    blockerClass: classification.blockerClass === "none" ? null : classification.blockerClass,
    releasePass: classification.pass,
  };
}

function hasTimestampAdvanced(before: string | null, after: string | null) {
  if (!after) return false;
  if (!before) return true;
  return new Date(after).getTime() > new Date(before).getTime();
}

function hasImproved(before: CanaryEvidence, after: CanaryEvidence) {
  return (
    after.queueDepth < before.queueDepth ||
    after.leasedPartitions > before.leasedPartitions ||
    after.repairBacklog < before.repairBacklog ||
    after.validationFailures24h < before.validationFailures24h ||
    after.d1FinalizeNonTerminalCount < before.d1FinalizeNonTerminalCount ||
    after.recentSelectedRangePercent > before.recentSelectedRangePercent ||
    after.priorityWindowPercent > before.priorityWindowPercent ||
    after.truthReady !== before.truthReady ||
    hasTimestampAdvanced(before.lastSuccessfulPublishAt, after.lastSuccessfulPublishAt)
  );
}

function hasNonQueueRegression(before: CanaryEvidence, after: CanaryEvidence) {
  return (
    after.deadLetterPartitions > before.deadLetterPartitions ||
    after.staleLeasePartitions > before.staleLeasePartitions ||
    after.validationFailures24h > before.validationFailures24h ||
    after.d1FinalizeNonTerminalCount > before.d1FinalizeNonTerminalCount ||
    after.recentSelectedRangePercent < before.recentSelectedRangePercent ||
    after.priorityWindowPercent < before.priorityWindowPercent
  );
}

function actionCanQueueMoreWork(action: MetaRemediationExecutedAction) {
  return (
    action === "repair_cycle" ||
    action === "reschedule" ||
    action === "replay_dead_letter" ||
    action === "stale_lease_reclaim"
  );
}

function hasExpectedQueuedWorkIncrease(input: {
  before: CanaryEvidence;
  after: CanaryEvidence;
  executedAction: MetaRemediationExecutedAction;
}) {
  if (!actionCanQueueMoreWork(input.executedAction)) {
    return false;
  }
  return (
    input.after.queueDepth > input.before.queueDepth ||
    input.after.repairBacklog > input.before.repairBacklog
  );
}

function hasWorsened(input: {
  before: CanaryEvidence;
  after: CanaryEvidence;
  executedAction: MetaRemediationExecutedAction;
}) {
  if (hasNonQueueRegression(input.before, input.after)) {
    return true;
  }
  if (input.after.queueDepth > input.before.queueDepth) {
    return !hasExpectedQueuedWorkIncrease(input);
  }
  return false;
}

function hasMeaningfulAfterEvidenceChange(before: CanaryEvidence, after: CanaryEvidence) {
  return (
    after.releasePass ||
    hasImproved(before, after) ||
    after.queueDepth !== before.queueDepth ||
    after.repairBacklog !== before.repairBacklog ||
    hasNonQueueRegression(before, after) ||
    after.activityState !== before.activityState ||
    after.progressState !== before.progressState ||
    after.blockerClass !== before.blockerClass ||
    after.workerOnline !== before.workerOnline ||
    after.recentTruthState !== before.recentTruthState ||
    after.priorityTruthState !== before.priorityTruthState
  );
}

export function classifyCanaryRemediationOutcome(input: {
  before: CanaryEvidence;
  after: CanaryEvidence;
  actionResult: Record<string, unknown>;
  executedAction: MetaRemediationExecutedAction;
}) {
  const blockingReasons = Array.isArray(input.actionResult.repair)
    ? []
    : Array.isArray((input.actionResult.repair as { blockingReasons?: unknown[] } | undefined)?.blockingReasons)
      ? ((input.actionResult.repair as { blockingReasons?: unknown[] }).blockingReasons as unknown[])
      : [];
  const hasManualFollowUpReason = blockingReasons.some((entry) => {
    const code = entry && typeof entry === "object" ? String((entry as { code?: unknown }).code ?? "") : "";
    return code === "manual_truth_defect" || code === "blocked_authoritative_publication_mismatch" || code === "integrity_mismatch_persistent";
  });
  if (input.after.releasePass && input.after.activityState !== "blocked" && input.after.progressState !== "blocked") {
    return {
      outcome: "cleared" as SyncRepairExecutionOutcome,
      expectedOutcomeMet: true,
    };
  }
  if (hasManualFollowUpReason) {
    return {
      outcome: "manual_follow_up_required" as SyncRepairExecutionOutcome,
      expectedOutcomeMet: false,
    };
  }
  if (hasImproved(input.before, input.after)) {
    return {
      outcome: "improving_not_cleared" as SyncRepairExecutionOutcome,
      expectedOutcomeMet: false,
    };
  }
  if (
    hasExpectedQueuedWorkIncrease({
      before: input.before,
      after: input.after,
      executedAction: input.executedAction,
    }) &&
    !hasNonQueueRegression(input.before, input.after)
  ) {
    return {
      outcome: "improving_not_cleared" as SyncRepairExecutionOutcome,
      expectedOutcomeMet: false,
    };
  }
  if (
    hasWorsened({
      before: input.before,
      after: input.after,
      executedAction: input.executedAction,
    })
  ) {
    return {
      outcome: "worse" as SyncRepairExecutionOutcome,
      expectedOutcomeMet: false,
    };
  }
  return {
    outcome: "no_change" as SyncRepairExecutionOutcome,
    expectedOutcomeMet: false,
  };
}

function emptyOutcomeCounts(): MetaCanaryRemediationOutcomeCounts {
  return {
    cleared: 0,
    improving_not_cleared: 0,
    no_change: 0,
    worse: 0,
    manual_follow_up_required: 0,
    locked: 0,
  };
}

function buildOutcomeCounts(executions: SyncRepairExecutionRecord[]): MetaCanaryRemediationOutcomeCounts {
  const counts = emptyOutcomeCounts();
  for (const execution of executions) {
    if (execution.outcomeClassification) {
      counts[execution.outcomeClassification] += 1;
    }
  }
  return counts;
}

function executionHasAuditEvidence(execution: SyncRepairExecutionRecord) {
  return (
    execution.sourceReleaseGateId != null &&
    execution.sourceRepairPlanId != null &&
    Object.keys(execution.beforeEvidence ?? {}).length > 0 &&
    Object.keys(execution.actionResult ?? {}).length > 0 &&
    Object.keys(execution.afterEvidence ?? {}).length > 0 &&
    execution.postRunReleaseGateId != null &&
    execution.postRunRepairPlanId != null
  );
}

function computeProofPassed(input: {
  executions: SyncRepairExecutionRecord[];
  remediationSummary: Awaited<ReturnType<typeof getLatestSyncRepairExecutionSummary>>;
  finalReleaseGate: SyncGateRecord | null;
  finalRepairPlan: Awaited<ReturnType<typeof evaluateAndPersistSyncRepairPlan>>;
}) {
  return (
    input.executions.length > 0 &&
    input.executions.every((execution) => executionHasAuditEvidence(execution)) &&
    input.finalReleaseGate != null &&
    input.finalRepairPlan != null &&
    input.remediationSummary != null
  );
}

function computeClearancePassed(input: {
  executions: SyncRepairExecutionRecord[];
  finalReleaseGate: SyncGateRecord;
}) {
  return (
    input.executions.length > 0 &&
    input.executions.every(
      (execution) =>
        execution.outcomeClassification === "cleared" &&
        execution.expectedOutcomeMet === true,
    ) &&
    input.finalReleaseGate.baseResult === "pass"
  );
}

function validatePinnedRows(input: {
  expectedBuildId: string;
  releaseGate: SyncGateRecord | null;
  repairPlan: Awaited<ReturnType<typeof getSyncRepairPlanById>>;
}) {
  if (!input.releaseGate) {
    throw new Error("Pinned release gate record was not found.");
  }
  if (!input.repairPlan) {
    throw new Error("Pinned repair plan record was not found.");
  }
  if (input.releaseGate.buildId !== input.expectedBuildId || input.repairPlan.buildId !== input.expectedBuildId) {
    throw new Error("Pinned release gate or repair plan does not belong to the expected build.");
  }
  if (input.releaseGate.environment !== input.repairPlan.environment) {
    throw new Error("Pinned release gate and repair plan belong to different environments.");
  }
  if (input.releaseGate.gateKind !== "release_gate") {
    throw new Error("Pinned release gate id does not point to a release gate row.");
  }
  if (input.releaseGate.baseResult !== "fail" && input.releaseGate.baseResult !== "pass") {
    throw new Error("Pinned release gate is not usable for remediation.");
  }
  if (input.repairPlan.eligible !== true) {
    throw new Error("Pinned repair plan is not eligible for live remediation.");
  }
  if (input.releaseGate.breakGlass || input.repairPlan.breakGlass) {
    throw new Error("Break-glass is active; remediation runner will not mutate canary state.");
  }
}

async function collectAuthoritativeDiagnostics(businessId: string) {
  const authoritative = await getMetaAuthoritativeBusinessOpsSnapshot({ businessId }).catch(() => null);
  if (!authoritative) {
    return null;
  }
  const breaches = authoritative.d1FinalizeSla.accounts.filter((account) => account.breached);
  const verificationReports = await Promise.all(
    breaches.map(async (account) => {
      const verification = await getMetaAuthoritativeDayVerification({
        businessId,
        providerAccountId: account.providerAccountId,
        day: account.expectedDay,
      }).catch(() => null);
      if (!verification) return null;
      return {
        providerAccountId: account.providerAccountId,
        day: account.expectedDay,
        verifyDay: buildMetaVerifyDayReport(verification),
        verifyPublish: buildMetaPublishVerificationReport(verification),
      };
    }),
  );
  return {
    stateCheck: buildMetaStateCheckOutput(authoritative),
    d1Breaches: verificationReports.filter(Boolean),
  };
}

async function collectBusinessEvidence(businessId: string) {
  const snapshot = await collectMetaSyncReadinessSnapshot({
    businessId,
    recentDays: 7,
    priorityWindowDays: 3,
    recentWindowMinutes: 15,
  });
  return {
    snapshot,
    evidence: buildExecutionEvidence(snapshot),
  };
}

async function executeRecommendation(input: {
  businessId: string;
  recommendation: SyncRepairRecommendation;
}) {
  switch (input.recommendation.recommendedAction) {
    case "integrity_repair_enqueue":
      return {
        executedAction: mapRepairRecommendationToExecutionAction(input.recommendation.recommendedAction),
        result: toSafeJson(
          await runMetaRepairCycle(input.businessId, {
            enqueueScheduledWork: true,
            queueWarehouseRepairs: true,
          }),
        ),
      };
    case "reschedule":
      return {
        executedAction: mapRepairRecommendationToExecutionAction(input.recommendation.recommendedAction),
        result: toSafeJson(await enqueueMetaScheduledWork(input.businessId)),
      };
    case "refresh_state":
      await refreshMetaSyncStateForBusiness({ businessId: input.businessId });
      return {
        executedAction: mapRepairRecommendationToExecutionAction(input.recommendation.recommendedAction),
        result: { ok: true },
      };
    case "replay_dead_letter": {
      const replayed = await replayMetaDeadLetterPartitions({
        businessId: input.businessId,
        sources: null,
      });
      const scheduled = await enqueueMetaScheduledWork(input.businessId);
      return {
        executedAction: mapRepairRecommendationToExecutionAction(input.recommendation.recommendedAction),
        result: toSafeJson({
          replayed,
          scheduled,
        }),
      };
    }
    case "stale_lease_reclaim": {
      const cleanup = await cleanupMetaPartitionOrchestration({
        businessId: input.businessId,
      });
      const queueHealth = await getMetaQueueHealth({
        businessId: input.businessId,
      }).catch(() => null);
      const scheduled = (queueHealth?.queueDepth ?? 0) > 0
        ? await enqueueMetaScheduledWork(input.businessId)
        : null;
      return {
        executedAction: mapRepairRecommendationToExecutionAction(input.recommendation.recommendedAction),
        result: toSafeJson({
          cleanup,
          queueHealth,
          scheduled,
        }),
      };
    }
  }
}

export function mapRepairRecommendationToExecutionAction(
  action: SyncRepairRecommendation["recommendedAction"],
): MetaRemediationExecutedAction {
  switch (action) {
    case "integrity_repair_enqueue":
      return "repair_cycle";
    case "reschedule":
      return "reschedule";
    case "refresh_state":
      return "refresh_state";
    case "replay_dead_letter":
      return "replay_dead_letter";
    case "stale_lease_reclaim":
      return "stale_lease_reclaim";
  }
}

async function pollAfterEvidence(input: {
  businessId: string;
  beforeEvidence: CanaryEvidence;
  attempts: number;
  intervalMs: number;
  lockOwner: string;
}) {
  let latest = await withTimeout(
    collectBusinessEvidence(input.businessId),
    DEFAULT_EVIDENCE_TIMEOUT_MS,
    `after evidence snapshot for ${input.businessId}`,
  );
  for (let attempt = 1; attempt < input.attempts; attempt += 1) {
    if (hasMeaningfulAfterEvidenceChange(input.beforeEvidence, latest.evidence)) {
      return latest;
    }
    await sleep(input.intervalMs);
    await renewProviderJobLock({
      businessId: input.businessId,
      ownerToken: input.lockOwner,
      lockMinutes: DEFAULT_LOCK_MINUTES,
      ...META_REMEDIATION_LOCK,
    }).catch(() => false);
    latest = await withTimeout(
      collectBusinessEvidence(input.businessId),
      DEFAULT_EVIDENCE_TIMEOUT_MS,
      `after evidence snapshot for ${input.businessId}`,
    );
  }
  return latest;
}

export async function runMetaCanaryRemediation(input: {
  expectedBuildId: string;
  releaseGateId: string;
  repairPlanId: string;
  businessIds?: string[] | null;
  successMode?: MetaCanaryRemediationSuccessMode;
  workflowRunId?: string | null;
  workflowActor?: string | null;
}) : Promise<MetaCanaryRemediationResult> {
  const buildId = getCurrentRuntimeBuildId();
  if (buildId !== input.expectedBuildId) {
    throw new Error(`Expected deployed build ${input.expectedBuildId} but current runtime build is ${buildId}.`);
  }

  const [releaseGate, repairPlan] = await Promise.all([
    getSyncGateRecordById({ id: input.releaseGateId }),
    getSyncRepairPlanById({ id: input.repairPlanId }),
  ]);
  validatePinnedRows({
    expectedBuildId: input.expectedBuildId,
    releaseGate,
    repairPlan,
  });
  if (!releaseGate || !repairPlan) {
    throw new Error("Pinned release gate and repair plan must exist after validation.");
  }
  const pinnedReleaseGate = releaseGate;
  const pinnedRepairPlan = repairPlan;
  const currentGateRecords = await getLatestSyncGateRecords({
    buildId,
    environment: pinnedReleaseGate.environment,
  });
  if (currentGateRecords.deployGate?.verdict !== "pass") {
    throw new Error("Current deploy gate is not passing; remediation runner will not mutate canary state.");
  }

  const requestedBusinessIds = input.businessIds?.length ? input.businessIds : null;
  const targetRecommendations = pinnedRepairPlan.recommendations.filter((recommendation) =>
    !requestedBusinessIds || requestedBusinessIds.includes(recommendation.businessId),
  );
  if (targetRecommendations.length === 0) {
    throw new Error("No remediation recommendations matched the requested businesses.");
  }

  if (requestedBusinessIds) {
    const missingRequestedBusinesses = requestedBusinessIds.filter(
      (businessId) => !targetRecommendations.some((recommendation) => recommendation.businessId === businessId),
    );
    if (missingRequestedBusinesses.length > 0) {
      throw new Error(`No pinned repair recommendation exists for ${missingRequestedBusinesses.join(", ")}.`);
    }
  }

  const successMode = input.successMode ?? "proof";
  const targetBusinessIds = targetRecommendations.map((recommendation) => recommendation.businessId);
  const executions: SyncRepairExecutionRecord[] = [];

  for (const recommendation of targetRecommendations) {
    const lockOwner = `${input.workflowRunId ?? "manual"}:${recommendation.businessId}`;
    console.log(
      "[meta-canary-remediation] business_start",
      JSON.stringify({
        businessId: recommendation.businessId,
        recommendedAction: recommendation.recommendedAction,
        successMode,
      }),
    );
    const lock = await acquireProviderJobLock({
      businessId: recommendation.businessId,
      ownerToken: lockOwner,
      lockMinutes: DEFAULT_LOCK_MINUTES,
      ...META_REMEDIATION_LOCK,
    });

    if (!lock.acquired) {
      executions.push(
        await createSyncRepairExecution({
          buildId,
          environment: releaseGate?.environment ?? process.env.NODE_ENV ?? "unknown",
          providerScope: repairPlan?.providerScope ?? "meta",
          businessId: recommendation.businessId,
          businessName: recommendation.businessName,
          sourceReleaseGateId: releaseGate?.id ?? null,
          sourceRepairPlanId: repairPlan?.id ?? null,
          recommendedAction: recommendation.recommendedAction,
          executedAction: null,
          workflowRunId: input.workflowRunId ?? null,
          workflowActor: input.workflowActor ?? null,
          lockOwner,
          status: "locked",
          outcomeClassification: "locked",
          expectedOutcomeMet: false,
          beforeEvidence: recommendation.beforeEvidence,
          actionResult: {
            reason: lock.alreadyRunning ? "lock_unavailable" : "lock_error",
          },
          afterEvidence: recommendation.beforeEvidence,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        }),
      );
      continue;
    }

    let execution: SyncRepairExecutionRecord | null = null;
    let finalLockStatus: "done" | "failed" = "failed";
    let finalLockError: string | null = null;
    try {
      const before = await withTimeout(
        collectBusinessEvidence(recommendation.businessId),
        DEFAULT_EVIDENCE_TIMEOUT_MS,
        `before evidence for ${recommendation.businessId}`,
      );
      execution = await createSyncRepairExecution({
        buildId,
        environment: releaseGate?.environment ?? process.env.NODE_ENV ?? "unknown",
        providerScope: repairPlan?.providerScope ?? "meta",
        businessId: recommendation.businessId,
        businessName: before.snapshot.businessName ?? recommendation.businessName,
        sourceReleaseGateId: releaseGate?.id ?? null,
        sourceRepairPlanId: repairPlan?.id ?? null,
        recommendedAction: recommendation.recommendedAction,
        workflowRunId: input.workflowRunId ?? null,
        workflowActor: input.workflowActor ?? null,
        lockOwner,
        beforeEvidence: toSafeJson(before.evidence),
      });
      console.log(
        "[meta-canary-remediation] action_start",
        JSON.stringify({
          businessId: recommendation.businessId,
          recommendedAction: recommendation.recommendedAction,
        }),
      );
      const action = await withTimeout(
        executeRecommendation({
          businessId: recommendation.businessId,
          recommendation,
        }),
        DEFAULT_ACTION_TIMEOUT_MS,
        `remediation action for ${recommendation.businessId}`,
      );
      console.log(
        "[meta-canary-remediation] action_complete",
        JSON.stringify({
          businessId: recommendation.businessId,
          executedAction: action.executedAction,
        }),
      );
      const after = await pollAfterEvidence({
        businessId: recommendation.businessId,
        beforeEvidence: before.evidence,
        attempts: DEFAULT_POLL_ATTEMPTS,
        intervalMs: DEFAULT_POLL_INTERVAL_MS,
        lockOwner,
      });
      const diagnostics =
        after.evidence.releasePass
          ? null
          : await withTimeout(
              collectAuthoritativeDiagnostics(recommendation.businessId),
              DEFAULT_DIAGNOSTIC_TIMEOUT_MS,
              `diagnostics for ${recommendation.businessId}`,
            );
      const actionResult = toSafeJson({
        ...action.result,
        diagnostics,
      });
      const classified = classifyCanaryRemediationOutcome({
        before: before.evidence,
        after: after.evidence,
        actionResult,
        executedAction: action.executedAction,
      });
      const completed = await updateSyncRepairExecution(execution.id, {
        businessName: after.snapshot.businessName ?? recommendation.businessName,
        executedAction: action.executedAction,
        status: "completed",
        outcomeClassification: classified.outcome,
        expectedOutcomeMet: classified.expectedOutcomeMet,
        actionResult,
        afterEvidence: toSafeJson(after.evidence),
        finishedAt: new Date().toISOString(),
      });
      if (completed) {
        executions.push(completed);
      }
      console.log(
        "[meta-canary-remediation] business_complete",
        JSON.stringify({
          businessId: recommendation.businessId,
          outcomeClassification: completed?.outcomeClassification ?? classified.outcome,
          expectedOutcomeMet: completed?.expectedOutcomeMet ?? classified.expectedOutcomeMet,
        }),
      );
      finalLockStatus = "done";
    } catch (error) {
      if (execution) {
        const diagnostics = await withTimeout(
          collectAuthoritativeDiagnostics(recommendation.businessId),
          DEFAULT_DIAGNOSTIC_TIMEOUT_MS,
          `fallback diagnostics for ${recommendation.businessId}`,
        ).catch(() => null);
        const failed = await updateSyncRepairExecution(execution.id, {
          status: "failed",
          outcomeClassification: "manual_follow_up_required",
          expectedOutcomeMet: false,
          actionResult: toSafeJson({
            error: error instanceof Error ? error.message : String(error),
            diagnostics,
          }),
          finishedAt: new Date().toISOString(),
        });
        if (failed) {
          executions.push(failed);
        }
      } else {
        executions.push(
          await createSyncRepairExecution({
            buildId,
            environment: releaseGate?.environment ?? process.env.NODE_ENV ?? "unknown",
            providerScope: repairPlan?.providerScope ?? "meta",
            businessId: recommendation.businessId,
            businessName: recommendation.businessName,
            sourceReleaseGateId: releaseGate?.id ?? null,
            sourceRepairPlanId: repairPlan?.id ?? null,
            recommendedAction: recommendation.recommendedAction,
            workflowRunId: input.workflowRunId ?? null,
            workflowActor: input.workflowActor ?? null,
            lockOwner,
            status: "failed",
            outcomeClassification: "manual_follow_up_required",
            expectedOutcomeMet: false,
            actionResult: toSafeJson({
              error: error instanceof Error ? error.message : String(error),
            }),
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
          }),
        );
      }
      console.error(
        "[meta-canary-remediation] business_failed",
        JSON.stringify({
          businessId: recommendation.businessId,
          recommendedAction: recommendation.recommendedAction,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      finalLockError = error instanceof Error ? error.message : String(error);
    } finally {
      await releaseProviderJobLock({
        businessId: recommendation.businessId,
        ownerToken: lockOwner,
        status: finalLockStatus,
        errorMessage: finalLockError,
        ...META_REMEDIATION_LOCK,
      }).catch(() => null);
    }
  }

  const { deployGate: finalDeployGate, releaseGate: finalReleaseGate } = await evaluateAndPersistSyncGates({
    buildId,
    environment: pinnedReleaseGate.environment,
  });
  const finalRepairPlan = await evaluateAndPersistSyncRepairPlan({
    buildId,
    environment: pinnedReleaseGate.environment,
    providerScope: pinnedRepairPlan.providerScope,
  });
  const remediationSummary = await getLatestSyncRepairExecutionSummary({
    buildId,
    environment: pinnedReleaseGate.environment,
    providerScope: pinnedRepairPlan.providerScope,
  });

  if (!finalDeployGate || !finalReleaseGate) {
    throw new Error("Final gate reevaluation did not return both deploy and release records.");
  }

  const executionsWithPostRunIds = await Promise.all(
    executions.map(async (execution) => {
      const updated = await updateSyncRepairExecution(execution.id, {
        postRunReleaseGateId: finalReleaseGate.id,
        postRunRepairPlanId: finalRepairPlan.id,
      });
      return updated ?? execution;
    }),
  );

  const outcomeCounts = buildOutcomeCounts(executionsWithPostRunIds);
  const businessImprovementObserved =
    outcomeCounts.cleared > 0 || outcomeCounts.improving_not_cleared > 0;
  const proofPassed = computeProofPassed({
    executions: executionsWithPostRunIds,
    remediationSummary,
    finalReleaseGate,
    finalRepairPlan,
  });
  const clearancePassed = computeClearancePassed({
    executions: executionsWithPostRunIds,
    finalReleaseGate,
  });

  return {
    expectedBuildId: input.expectedBuildId,
    buildId,
    successMode,
    targetBusinessIds,
    releaseGate: pinnedReleaseGate,
    finalReleaseGate,
    repairPlan: pinnedRepairPlan,
    finalRepairPlan,
    remediationSummary,
    executions: executionsWithPostRunIds,
    outcomeCounts,
    businessImprovementObserved,
    proofPassed,
    clearancePassed,
  };
}

export function parseMetaCanaryBusinessIds(value: string | null | undefined) {
  return parseCsv(value);
}
