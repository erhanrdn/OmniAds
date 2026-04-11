import type { NextRequest } from "next/server";
import type {
  CommandCenterAction,
  CommandCenterJournalEntry,
  CommandCenterPermissions,
} from "@/lib/command-center";
import {
  getCommandCenterMutationReceipt,
  listCommandCenterJournal,
  syncCommandCenterActionWorkflowStatus,
  writeCommandCenterMutationReceipt,
} from "@/lib/command-center-store";
import {
  buildCommandCenterExecutionPreviewHash,
  COMMAND_CENTER_EXECUTION_CONTRACT_VERSION,
  type CommandCenterExecutionApprovalSnapshot,
  type CommandCenterExecutionDiffItem,
  type CommandCenterExecutionPreview,
  type CommandCenterExecutionStateSummary,
  type CommandCenterExecutionSupportMatrix,
  type CommandCenterExecutionSupportMode,
  type MetaExecutionMutationPlan,
  META_EXECUTION_SUPPORTED_ACTIONS,
  normalizeMetaExecutionStatus,
  summarizeExecutionStateValue,
} from "@/lib/command-center-execution";
import {
  buildCommandCenterExecutionSupportMatrix,
  resolveCommandCenterExecutionSupportEntry,
} from "@/lib/command-center-execution-support";
import {
  appendCommandCenterExecutionAudit,
  getCommandCenterExecutionState,
  listCommandCenterExecutionAudit,
  upsertCommandCenterExecutionState,
} from "@/lib/command-center-execution-store";
import {
  canApplyMetaExecutionForBusiness,
  isCommandCenterExecutionV1Enabled,
} from "@/lib/command-center-execution-config";
import { getMetaDecisionOsForRange } from "@/lib/meta/decision-os-source";
import type { MetaAdSetDecision } from "@/lib/meta/decision-os";
import {
  getMetaAdSetExecutionState,
  mutateMetaAdSetExecution,
  type MetaExecutionAdSetState,
  type MetaExecutionMutationResult,
} from "@/lib/meta/execution";

class CommandCenterExecutionError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    code: string;
    status: number;
    message: string;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "CommandCenterExecutionError";
    this.code = input.code;
    this.status = input.status;
    this.details = input.details;
  }
}

function buildExecutionMutationReceipt(input: {
  operation: "apply" | "rollback";
  preview: CommandCenterExecutionPreview | null;
  success: boolean;
  error?: CommandCenterExecutionMutationReceipt["error"];
}) {
  return {
    kind: "command_center_execution",
    operation: input.operation,
    success: input.success,
    preview: input.preview,
    error: input.error ?? null,
  } satisfies CommandCenterExecutionMutationReceipt;
}

async function readExecutionMutationReceipt(input: {
  businessId: string;
  clientMutationId: string;
  operation: "apply" | "rollback";
}) {
  const receipt =
    await getCommandCenterMutationReceipt<CommandCenterExecutionMutationReceipt>({
      businessId: input.businessId,
      clientMutationId: input.clientMutationId,
    });
  if (
    !receipt ||
    receipt.kind !== "command_center_execution" ||
    receipt.operation !== input.operation
  ) {
    return null;
  }
  return receipt;
}

async function writeExecutionMutationReceipt(input: {
  businessId: string;
  clientMutationId: string;
  operation: "apply" | "rollback";
  preview: CommandCenterExecutionPreview | null;
  success: boolean;
  error?: CommandCenterExecutionMutationReceipt["error"];
}) {
  await writeCommandCenterMutationReceipt({
    businessId: input.businessId,
    clientMutationId: input.clientMutationId,
    mutationScope: `command_center_execution:${input.operation}`,
    payload: buildExecutionMutationReceipt({
      operation: input.operation,
      preview: input.preview,
      success: input.success,
      error: input.error,
    }),
  });
}

function replayExecutionMutationReceipt(
  receipt: CommandCenterExecutionMutationReceipt,
) {
  if (receipt.success && receipt.preview) {
    return receipt.preview;
  }

  throw new CommandCenterExecutionError({
    code: receipt.error?.code ?? "execution_receipt_replay_failed",
    status: receipt.error?.status ?? 409,
    message:
      receipt.error?.message ??
      "The original execution attempt already completed without a replayable preview payload.",
    details: receipt.preview ? { preview: receipt.preview } : undefined,
  });
}

function buildObservedProviderResult(reason: string) {
  return {
    statusCode: 202,
    ok: true,
    traceId: null,
    body: {
      source: "live_state_reconciliation",
      reason,
    },
  } satisfies MetaExecutionMutationResult;
}

interface CommandCenterExecutionMutationReceipt {
  kind: "command_center_execution";
  operation: "apply" | "rollback";
  success: boolean;
  preview: CommandCenterExecutionPreview | null;
  error: {
    code: string;
    status: number;
    message: string;
  } | null;
}

function isSupportedMetaExecutionAction(
  value: string,
): value is (typeof META_EXECUTION_SUPPORTED_ACTIONS)[number] {
  return META_EXECUTION_SUPPORTED_ACTIONS.includes(
    value as (typeof META_EXECUTION_SUPPORTED_ACTIONS)[number],
  );
}

function formatCurrencyValue(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "Unavailable";
  return `$${Math.round(value)}`;
}

function toExecutionStateSummary(
  state: Pick<
    MetaExecutionAdSetState,
    | "status"
    | "budgetLevel"
    | "dailyBudget"
    | "lifetimeBudget"
    | "optimizationGoal"
    | "bidStrategyLabel"
  > | null,
): CommandCenterExecutionStateSummary | null {
  if (!state) return null;
  return {
    status: normalizeMetaExecutionStatus(state.status),
    budgetLevel: state.budgetLevel,
    dailyBudget: state.dailyBudget,
    lifetimeBudget: state.lifetimeBudget,
    optimizationGoal: state.optimizationGoal,
    bidStrategyLabel: state.bidStrategyLabel,
  };
}

function buildDiff(input: {
  currentState: CommandCenterExecutionStateSummary | null;
  requestedState: CommandCenterExecutionStateSummary | null;
}) {
  const diff: CommandCenterExecutionDiffItem[] = [];
  if (input.currentState?.status !== input.requestedState?.status) {
    diff.push({
      key: "status",
      label: "Status",
      currentValue: summarizeExecutionStateValue(input.currentState?.status),
      requestedValue: summarizeExecutionStateValue(input.requestedState?.status),
      changeType: "status",
    });
  }

  if (input.currentState?.dailyBudget !== input.requestedState?.dailyBudget) {
    const currentValue = input.currentState?.dailyBudget ?? null;
    const requestedValue = input.requestedState?.dailyBudget ?? null;
    diff.push({
      key: "daily_budget",
      label: "Daily budget",
      currentValue: formatCurrencyValue(currentValue),
      requestedValue: formatCurrencyValue(requestedValue),
      changeType:
        currentValue == null || requestedValue == null
          ? "set"
          : requestedValue > currentValue
            ? "increase"
            : "decrease",
    });
  }

  if (diff.length === 0) {
    diff.push({
      key: "no_change",
      label: "Requested change",
      currentValue: "No live mutation available",
      requestedValue: "Manual-only review",
      changeType: "none",
    });
  }

  return diff;
}

function buildApprovalSnapshot(
  action: CommandCenterAction,
  journal: CommandCenterJournalEntry[],
): CommandCenterExecutionApprovalSnapshot {
  const approvedEntry =
    journal.find(
      (entry) =>
        entry.eventType === "status_changed" &&
        entry.metadata.mutation === "approve",
    ) ?? null;

  return {
    workflowStatus: action.status,
    approvedAt: approvedEntry?.createdAt ?? null,
    approvedByUserId: approvedEntry?.actorUserId ?? null,
    approvedByName: approvedEntry?.actorName ?? null,
    approvedByEmail: approvedEntry?.actorEmail ?? null,
  };
}

function getBudgetMultiplier(decision: MetaAdSetDecision) {
  if (decision.actionType === "scale_budget") {
    if (decision.actionSize === "medium") return 1.15;
    if (decision.actionSize === "large") return 1.25;
    return null;
  }
  if (decision.actionType === "reduce_budget") {
    return decision.actionSize === "medium" ? 0.85 : null;
  }
  return null;
}

function cloneExecutionStateSummary(
  state: CommandCenterExecutionStateSummary,
): CommandCenterExecutionStateSummary {
  return {
    status: state.status,
    budgetLevel: state.budgetLevel,
    dailyBudget: state.dailyBudget,
    lifetimeBudget: state.lifetimeBudget,
    optimizationGoal: state.optimizationGoal,
    bidStrategyLabel: state.bidStrategyLabel,
  };
}

function buildManualOnlyPreview(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  action: CommandCenterAction;
  approval: CommandCenterExecutionApprovalSnapshot;
  latestState: Awaited<ReturnType<typeof getCommandCenterExecutionState>>;
  auditTrail: Awaited<ReturnType<typeof listCommandCenterExecutionAudit>>;
  currentState: CommandCenterExecutionStateSummary | null;
  requestedState: CommandCenterExecutionStateSummary | null;
  supportMatrix: CommandCenterExecutionSupportMatrix;
  manualInstructions: string[];
  prerequisites: string[];
  risks: string[];
  supportMode: CommandCenterExecutionSupportMode;
  applyReason?: string | null;
  rollbackReason?: string | null;
}) {
  const diff = buildDiff({
    currentState: input.currentState,
    requestedState: input.requestedState,
  });
  const previewHash = buildCommandCenterExecutionPreviewHash({
    businessId: input.businessId,
    actionFingerprint: input.action.actionFingerprint,
    requestedAction: input.action.recommendedAction,
    supportMode: input.supportMode,
    approvalWorkflowStatus: input.approval.workflowStatus,
    currentState: input.currentState,
    requestedState: input.requestedState,
    plan: null,
    diff,
  });

  return {
    contractVersion: COMMAND_CENTER_EXECUTION_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    actionFingerprint: input.action.actionFingerprint,
    sourceType: input.action.sourceType,
    requestedAction: input.action.recommendedAction,
    supportMode: input.supportMode,
    status: input.supportMode === "unsupported" ? "unsupported" : "manual_only",
    previewHash,
    supportMatrix: input.supportMatrix,
    approval: input.approval,
    permission: {
      canApply: false,
      reason:
        input.applyReason ??
        (input.supportMode === "unsupported"
          ? "This action is outside the V2-07 execution subset."
          : "This action requires manual execution."),
      canRollback: false,
      rollbackReason:
        input.rollbackReason ?? "No provider rollback is available for this preview.",
    },
    target: {
      entityType:
        input.action.relatedEntities[0]?.type === "family"
          ? "unknown"
          : input.action.relatedEntities[0]?.type ?? "unknown",
      entityId: input.action.relatedEntities[0]?.id ?? null,
      entityLabel: input.action.relatedEntities[0]?.label ?? input.action.title,
      campaignId:
        input.action.relatedEntities.find((entity) => entity.type === "campaign")?.id ??
        null,
      campaignName:
        input.action.relatedEntities.find((entity) => entity.type === "campaign")?.label ??
        null,
    },
    currentState: input.currentState,
    requestedState: input.requestedState,
    diff,
    prerequisites: input.prerequisites,
    risks: input.risks,
    manualInstructions: input.manualInstructions,
    auditTrail: input.auditTrail,
    latestState: input.latestState,
    plan: null,
    rollback: {
      kind: "not_available",
      note:
        input.rollbackReason ??
        "Rollback is unavailable because no provider-side apply path exists.",
    },
  } satisfies CommandCenterExecutionPreview;
}

function getExecutionStatusFromState(input: {
  supportMode: CommandCenterExecutionSupportMode;
  approvalWorkflowStatus: CommandCenterAction["status"];
  latestState: Awaited<ReturnType<typeof getCommandCenterExecutionState>>;
}) {
  if (input.supportMode === "manual_only") return "manual_only" as const;
  if (input.supportMode === "unsupported") return "unsupported" as const;
  if (
    input.latestState &&
    ["applying", "executed", "failed", "rolled_back"].includes(
      input.latestState.executionStatus,
    )
  ) {
    return input.latestState.executionStatus;
  }
  return input.approvalWorkflowStatus === "approved"
    ? ("ready_for_apply" as const)
    : ("draft" as const);
}

function doesRequestedStateMatch(input: {
  currentState: CommandCenterExecutionStateSummary | null;
  requestedState: CommandCenterExecutionStateSummary | null;
}) {
  if (!input.currentState || !input.requestedState) return false;
  return (
    normalizeMetaExecutionStatus(input.currentState.status) ===
      normalizeMetaExecutionStatus(input.requestedState.status) &&
    (input.currentState.dailyBudget ?? null) ===
      (input.requestedState.dailyBudget ?? null)
  );
}

async function replayStoredExecutionReceiptIfPresent(input: {
  businessId: string;
  clientMutationId: string;
  operation: "apply" | "rollback";
}) {
  const receipt = await readExecutionMutationReceipt(input);
  if (!receipt) return null;
  return replayExecutionMutationReceipt(receipt);
}

async function finalizeObservedExecutionCommit(input: {
  businessId: string;
  action: CommandCenterAction;
  startDate: string;
  endDate: string;
  permissions: CommandCenterPermissions;
  request: NextRequest;
  preview: CommandCenterExecutionPreview;
  clientMutationId: string;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  operation: "apply" | "rollback";
  currentState: CommandCenterExecutionStateSummary | null;
  requestedState: CommandCenterExecutionStateSummary | null;
  capturedPreApplyState: CommandCenterExecutionStateSummary | null;
  workflowStatus: "executed" | "approved";
  reconciliationReason: string;
}) {
  await finalizeExecutionSuccess({
    businessId: input.businessId,
    action: input.action,
    preview: input.preview,
    clientMutationId: input.clientMutationId,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    actorEmail: input.actorEmail,
    operation: input.operation,
    providerResult: buildObservedProviderResult(input.reconciliationReason),
    currentState: input.currentState,
    requestedState: input.requestedState,
    capturedPreApplyState: input.capturedPreApplyState,
    workflowStatus: input.workflowStatus,
  });

  const resolvedPreview = await getCommandCenterExecutionPreview({
    request: input.request,
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    action: input.action,
    permissions: input.permissions,
  });

  await writeExecutionMutationReceipt({
    businessId: input.businessId,
    clientMutationId: input.clientMutationId,
    operation: input.operation,
    preview: resolvedPreview,
    success: true,
  });

  return resolvedPreview;
}

async function resolveDuplicateInFlightExecution(input: {
  businessId: string;
  action: CommandCenterAction;
  startDate: string;
  endDate: string;
  permissions: CommandCenterPermissions;
  request: NextRequest;
  preview: CommandCenterExecutionPreview;
  clientMutationId: string;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  operation: "apply" | "rollback";
  targetState: CommandCenterExecutionStateSummary | null;
  capturedPreApplyState: CommandCenterExecutionStateSummary | null;
  workflowStatus: "executed" | "approved";
}) {
  const targetId = input.preview.plan?.targetId ?? null;
  const liveState =
    targetId == null
      ? null
      : await getMetaAdSetExecutionState({
          businessId: input.businessId,
          adSetId: targetId,
        }).then(toExecutionStateSummary);

  if (
    doesRequestedStateMatch({
      currentState: liveState,
      requestedState: input.targetState,
    })
  ) {
    return finalizeObservedExecutionCommit({
      businessId: input.businessId,
      action: input.action,
      startDate: input.startDate,
      endDate: input.endDate,
      permissions: input.permissions,
      request: input.request,
      preview: input.preview,
      clientMutationId: input.clientMutationId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorEmail: input.actorEmail,
      operation: input.operation,
      currentState: liveState,
      requestedState: input.targetState,
      capturedPreApplyState: input.capturedPreApplyState,
      workflowStatus: input.workflowStatus,
      reconciliationReason: `${input.operation}_duplicate_live_state_match`,
    });
  }

  throw new CommandCenterExecutionError({
    code:
      input.operation === "apply"
        ? "execution_apply_in_progress"
        : "execution_rollback_in_progress",
    status: 409,
    message:
      input.operation === "apply"
        ? "Apply is already in progress or could not be safely replayed. Wait for the original attempt to settle and do not retry automatically."
        : "Rollback is already in progress or could not be safely replayed. Wait for the original attempt to settle and do not retry automatically.",
    details: {
      preview: input.preview,
      observedLiveState: liveState,
    },
  });
}

async function getActionJournal(input: {
  businessId: string;
  actionFingerprint: string;
}) {
  return listCommandCenterJournal({
    businessId: input.businessId,
    actionFingerprint: input.actionFingerprint,
    limit: 60,
  });
}

async function resolveMetaExecutionPreview(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  action: CommandCenterAction;
  permissions: CommandCenterPermissions;
}) {
  const [journal, latestState, auditTrail] = await Promise.all([
    getActionJournal({
      businessId: input.businessId,
      actionFingerprint: input.action.actionFingerprint,
    }),
    getCommandCenterExecutionState({
      businessId: input.businessId,
      actionFingerprint: input.action.actionFingerprint,
    }),
    listCommandCenterExecutionAudit({
      businessId: input.businessId,
      actionFingerprint: input.action.actionFingerprint,
      limit: 12,
    }),
  ]);
  const approval = buildApprovalSnapshot(input.action, journal);
  const supportMatrix = buildCommandCenterExecutionSupportMatrix(input.action);
  const selectedSupportEntry = supportMatrix.selectedEntry;

  if (input.action.sourceSystem !== "meta") {
    return buildManualOnlyPreview({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      action: input.action,
      approval,
      latestState,
      auditTrail,
      currentState: null,
      requestedState: null,
      supportMatrix,
      prerequisites: [],
      risks: ["Execution is intentionally limited to Meta ad set actions in V2-07."],
      manualInstructions: selectedSupportEntry.operatorGuidance,
      supportMode: selectedSupportEntry.supportMode,
      applyReason: selectedSupportEntry.supportReason,
      rollbackReason: selectedSupportEntry.rollback.note,
    });
  }

  if (input.action.sourceType !== "meta_adset_decision") {
    return buildManualOnlyPreview({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      action: input.action,
      approval,
      latestState,
      auditTrail,
      currentState: null,
      requestedState: null,
      supportMatrix,
      prerequisites: [],
      risks: [selectedSupportEntry.supportReason],
      manualInstructions: selectedSupportEntry.operatorGuidance,
      supportMode: selectedSupportEntry.supportMode,
      applyReason: selectedSupportEntry.supportReason,
      rollbackReason: selectedSupportEntry.rollback.note,
    });
  }

  const metaDecisionOs = await getMetaDecisionOsForRange({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  const decision =
    metaDecisionOs.adSets.find(
      (entry) =>
        entry.decisionId === input.action.sourceContext.sourceDecisionId &&
        entry.adSetId ===
          input.action.relatedEntities.find((entity) => entity.type === "adset")?.id,
    ) ?? null;

  if (!decision) {
    return buildManualOnlyPreview({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      action: input.action,
      approval,
      latestState,
      auditTrail,
      currentState: null,
      requestedState: null,
      supportMatrix,
      prerequisites: [],
      risks: ["The decision source drifted and could not be matched to a live Meta ad set decision."],
      manualInstructions: [
        "Refresh the source Decision OS surface before applying any change.",
      ],
      supportMode: "manual_only",
      applyReason:
        "The source decision could not be matched to a live Meta ad set decision. Refresh before attempting apply.",
    });
  }

  const liveState = await getMetaAdSetExecutionState({
    businessId: input.businessId,
    adSetId: decision.adSetId,
  });
  const currentState = toExecutionStateSummary(liveState);

  if (!isSupportedMetaExecutionAction(decision.actionType)) {
    return buildManualOnlyPreview({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      action: input.action,
      approval,
      latestState,
      auditTrail,
      currentState,
      requestedState: null,
      supportMatrix,
      prerequisites: [],
      risks: [selectedSupportEntry.supportReason],
      manualInstructions: selectedSupportEntry.operatorGuidance,
      supportMode: selectedSupportEntry.supportMode,
      applyReason: selectedSupportEntry.supportReason,
      rollbackReason: selectedSupportEntry.rollback.note,
    });
  }

  if (!liveState) {
    return buildManualOnlyPreview({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      action: input.action,
      approval,
      latestState,
      auditTrail,
      currentState: null,
      requestedState: null,
      supportMatrix,
      prerequisites: [],
      risks: ["The current live ad set configuration could not be resolved."],
      manualInstructions: [
        "Validate the ad set directly in Meta Ads Manager before making changes.",
      ],
      supportMode: "manual_only",
      applyReason:
        "The current live ad set configuration could not be resolved safely for provider-backed execution.",
    });
  }

  if (!currentState) {
    return buildManualOnlyPreview({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      action: input.action,
      approval,
      latestState,
      auditTrail,
      currentState: null,
      requestedState: null,
      supportMatrix,
      prerequisites: [],
      risks: ["The current execution state could not be summarized safely."],
      manualInstructions: [
        "Refresh the source decision before attempting any live mutation.",
      ],
      supportMode: "manual_only",
      applyReason:
        "The current execution state could not be summarized safely enough for provider-backed execution.",
    });
  }

  if (liveState.isDemo || !liveState.providerAccessible) {
    return buildManualOnlyPreview({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      action: input.action,
      approval,
      latestState,
      auditTrail,
      currentState,
      requestedState: null,
      supportMatrix,
      prerequisites: [],
      risks: ["Demo and unassigned provider scopes remain manual-only in V1."],
      manualInstructions: [
        "Execution preview is informational only on demo or non-assigned scopes.",
      ],
      supportMode: "manual_only",
      applyReason:
        "Demo and non-provider-assigned scopes remain manual-only for execution.",
    });
  }

  if (liveState.budgetLevel === "campaign") {
    return buildManualOnlyPreview({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      action: input.action,
      approval,
      latestState,
      auditTrail,
      currentState,
      requestedState: null,
      supportMatrix,
      prerequisites: [],
      risks: ["Campaign-owned ad set budgets are not executed automatically in V1."],
      manualInstructions: [
        "Update the campaign budget manually if you want to follow this recommendation.",
      ],
      supportMode: "manual_only",
      applyReason:
        "Campaign-owned ad set budgets are outside the safe provider-backed execution subset.",
    });
  }

  if (liveState.lifetimeBudget != null || liveState.isBudgetMixed || liveState.isConfigMixed) {
    return buildManualOnlyPreview({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      action: input.action,
      approval,
      latestState,
      auditTrail,
      currentState,
      requestedState: null,
      supportMatrix,
      prerequisites: [],
      risks: ["Lifetime or mixed-budget ad sets are outside the safe V1 execution subset."],
      manualInstructions: [
        "Review this ad set manually before changing budget configuration.",
      ],
      supportMode: "manual_only",
      applyReason:
        "Lifetime or mixed-budget ad set configurations remain manual-only.",
    });
  }

  const requestedState = cloneExecutionStateSummary(currentState);

  if (decision.actionType === "pause") {
    requestedState.status = "PAUSED";
  } else if (decision.actionType === "recover") {
    requestedState.status = "ACTIVE";
  } else {
    if (currentState?.dailyBudget == null) {
      return buildManualOnlyPreview({
        businessId: input.businessId,
        startDate: input.startDate,
        endDate: input.endDate,
        action: input.action,
        approval,
        latestState,
        auditTrail,
        currentState,
        requestedState: null,
        supportMatrix,
        prerequisites: [],
        risks: ["A live ad set daily budget was not available for this mutation."],
        manualInstructions: [
          "Inspect the budget configuration manually before applying any change.",
        ],
        supportMode: "manual_only",
        applyReason:
          "A live daily budget was not available, so the exact requested mutation cannot be issued safely.",
      });
    }
    const multiplier = getBudgetMultiplier(decision);
    const requestedBudget =
      multiplier == null ? null : Math.round(currentState.dailyBudget * multiplier);
    if (
      requestedBudget == null ||
      !Number.isFinite(requestedBudget) ||
      requestedBudget <= 0 ||
      requestedBudget === currentState.dailyBudget
    ) {
      return buildManualOnlyPreview({
        businessId: input.businessId,
        startDate: input.startDate,
        endDate: input.endDate,
        action: input.action,
        approval,
        latestState,
        auditTrail,
        currentState,
        requestedState: null,
        supportMatrix,
        prerequisites: [],
        risks: ["The exact requested daily budget is either invalid or already live."],
        manualInstructions: [
          "No provider write will be issued for a no-op or invalid budget target.",
        ],
        supportMode: "manual_only",
        applyReason:
          "The exact requested daily budget is invalid, non-material, or already live.",
      });
    }
    requestedState.dailyBudget = requestedBudget;
  }

  if (doesRequestedStateMatch({ currentState, requestedState })) {
    return buildManualOnlyPreview({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      action: input.action,
      approval,
      latestState,
      auditTrail,
      currentState,
      requestedState,
      supportMatrix,
      prerequisites: [],
      risks: ["The live state already matches the requested target."],
      manualInstructions: [
        "No automatic apply is available because this recommendation is already satisfied.",
      ],
      supportMode: "manual_only",
      applyReason:
        "The live state already matches the requested target, so no provider write is issued.",
    });
  }

  const plan: MetaExecutionMutationPlan = {
    provider: "meta",
    targetType: "adset",
    targetId: decision.adSetId,
    actionType: decision.actionType,
    requestedStatus:
      decision.actionType === "pause"
        ? "PAUSED"
        : decision.actionType === "recover"
          ? "ACTIVE"
          : null,
    requestedDailyBudget:
      decision.actionType === "scale_budget" || decision.actionType === "reduce_budget"
        ? requestedState.dailyBudget
        : null,
    rollbackKind: "provider_rollback",
    rollbackNote:
      "Rollback restores the exact pre-apply ad set status and daily budget snapshot captured at apply time.",
    providerPayload: {
      ...(decision.actionType === "pause" || decision.actionType === "recover"
        ? { status: requestedState.status ?? "ACTIVE" }
        : {}),
      ...(decision.actionType === "scale_budget" ||
      decision.actionType === "reduce_budget"
        ? { daily_budget: requestedState.dailyBudget ?? 0 }
        : {}),
    },
    externalRefs: {
      provider: "meta",
      providerAccountId: liveState.providerAccountId,
      campaignId: decision.campaignId,
      campaignName: decision.campaignName,
      adSetId: decision.adSetId,
      adSetName: decision.adSetName,
    },
  };

  const diff = buildDiff({ currentState, requestedState });
  const previewHash = buildCommandCenterExecutionPreviewHash({
    businessId: input.businessId,
    actionFingerprint: input.action.actionFingerprint,
    requestedAction: input.action.recommendedAction,
    supportMode: "supported",
    approvalWorkflowStatus: approval.workflowStatus,
    currentState,
    requestedState,
    plan,
    diff,
  });

  const status = getExecutionStatusFromState({
    supportMode: "supported",
    approvalWorkflowStatus: approval.workflowStatus,
    latestState,
  });
  const canApply =
    input.permissions.canEdit &&
    approval.workflowStatus === "approved" &&
    canApplyMetaExecutionForBusiness(input.businessId);
  const canRollback =
    input.permissions.canEdit &&
    latestState?.executionStatus === "executed" &&
    latestState.rollbackKind === "provider_rollback" &&
    latestState.capturedPreApplyState != null;

  return {
    contractVersion: COMMAND_CENTER_EXECUTION_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    actionFingerprint: input.action.actionFingerprint,
    sourceType: input.action.sourceType,
    requestedAction: input.action.recommendedAction,
    supportMode: "supported",
    status,
    previewHash,
    supportMatrix,
    approval,
    permission: {
      canApply,
      reason: !input.permissions.canEdit
        ? input.permissions.reason ?? "This workspace is read-only."
        : approval.workflowStatus !== "approved"
          ? "Approve the workflow action before apply."
          : canApplyMetaExecutionForBusiness(input.businessId)
            ? null
            : "Apply is disabled outside the Meta execution canary allowlist.",
      canRollback,
      rollbackReason: canRollback
        ? null
        : latestState?.executionStatus !== "executed"
          ? "Rollback is only available after a successful apply."
          : latestState.rollbackKind !== "provider_rollback"
            ? latestState.rollbackNote ?? "Only recovery notes are available."
            : "A captured pre-apply snapshot is required for rollback.",
    },
    target: {
      entityType: "adset",
      entityId: decision.adSetId,
      entityLabel: decision.adSetName,
      campaignId: decision.campaignId,
      campaignName: decision.campaignName,
    },
    currentState,
    requestedState,
    diff,
    prerequisites: [
      "Preview hash must still match live state at apply time.",
      "Explicit human approval is required before apply.",
    ],
    risks: decision.guardrails,
    manualInstructions: [],
    auditTrail,
    latestState,
    plan,
    rollback: {
      kind: "provider_rollback",
      note: plan.rollbackNote,
    },
  } satisfies CommandCenterExecutionPreview;
}

export async function getCommandCenterExecutionPreview(input: {
  request: NextRequest;
  businessId: string;
  startDate: string;
  endDate: string;
  action: CommandCenterAction;
  permissions: CommandCenterPermissions;
}) {
  if (!isCommandCenterExecutionV1Enabled()) {
    throw new CommandCenterExecutionError({
      code: "command_center_execution_disabled",
      status: 404,
      message: "Command Center execution is feature-gated.",
    });
  }

  return resolveMetaExecutionPreview({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    action: input.action,
    permissions: input.permissions,
  });
}

async function finalizeExecutionSuccess(input: {
  businessId: string;
  action: CommandCenterAction;
  preview: CommandCenterExecutionPreview;
  clientMutationId: string;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  operation: "apply" | "rollback";
  providerResult: MetaExecutionMutationResult;
  currentState: CommandCenterExecutionStateSummary | null;
  requestedState: CommandCenterExecutionStateSummary | null;
  capturedPreApplyState: CommandCenterExecutionStateSummary | null;
  workflowStatus: "executed" | "approved";
}) {
  await appendCommandCenterExecutionAudit({
    businessId: input.businessId,
    actionFingerprint: input.action.actionFingerprint,
    clientMutationId: input.clientMutationId,
    operation: input.operation,
    executionStatus: input.operation === "apply" ? "executed" : "rolled_back",
    supportMode: input.preview.supportMode,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    actorEmail: input.actorEmail,
    approvalActorUserId: input.preview.approval.approvedByUserId,
    approvalActorName: input.preview.approval.approvedByName,
    approvalActorEmail: input.preview.approval.approvedByEmail,
    approvedAt: input.preview.approval.approvedAt,
    previewHash: input.preview.previewHash,
    rollbackKind: input.preview.rollback.kind,
    rollbackNote: input.preview.rollback.note,
    currentState: input.currentState,
    requestedState: input.requestedState,
    capturedPreApplyState: input.capturedPreApplyState,
    providerResponse: {
      statusCode: input.providerResult.statusCode,
      ok: input.providerResult.ok,
      traceId: input.providerResult.traceId,
      body: input.providerResult.body,
    },
    externalRefs: input.preview.plan?.externalRefs ?? null,
  });

  await upsertCommandCenterExecutionState({
    businessId: input.businessId,
    actionFingerprint: input.action.actionFingerprint,
    executionStatus: input.operation === "apply" ? "executed" : "rolled_back",
    supportMode: input.preview.supportMode,
    sourceSystem: input.action.sourceSystem,
    sourceType: input.action.sourceType,
    requestedAction: input.action.recommendedAction,
    previewHash: input.preview.previewHash,
    workflowStatusSnapshot:
      input.operation === "apply" ? "executed" : "approved",
    approvalActorUserId: input.preview.approval.approvedByUserId,
    approvalActorName: input.preview.approval.approvedByName,
    approvalActorEmail: input.preview.approval.approvedByEmail,
    approvedAt: input.preview.approval.approvedAt,
    appliedByUserId: input.actorUserId,
    appliedByName: input.actorName,
    appliedByEmail: input.actorEmail,
    appliedAt: new Date().toISOString(),
    rollbackKind: input.preview.rollback.kind,
    rollbackNote: input.preview.rollback.note,
    lastClientMutationId: input.clientMutationId,
    currentState: input.currentState,
    requestedState: input.requestedState,
    capturedPreApplyState: input.capturedPreApplyState,
    providerResponse: {
      statusCode: input.providerResult.statusCode,
      ok: input.providerResult.ok,
      traceId: input.providerResult.traceId,
    },
  });

  await syncCommandCenterActionWorkflowStatus({
    businessId: input.businessId,
    action: input.action,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    actorEmail: input.actorEmail,
    clientMutationId: `${input.clientMutationId}:${input.operation}:workflow`,
    nextStatus: input.workflowStatus,
    message:
      input.operation === "apply"
        ? `Executed ${input.action.title} through the Safe Execution Layer.`
        : `Rolled back ${input.action.title} through the Safe Execution Layer.`,
    metadata: {
      executionOperation: input.operation,
      previewHash: input.preview.previewHash,
    },
  });
}

async function finalizeExecutionFailure(input: {
  businessId: string;
  action: CommandCenterAction;
  preview: CommandCenterExecutionPreview;
  clientMutationId: string;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  operation: "apply" | "rollback";
  failureReason: string;
  currentState?: CommandCenterExecutionStateSummary | null;
  requestedState?: CommandCenterExecutionStateSummary | null;
  capturedPreApplyState?: CommandCenterExecutionStateSummary | null;
  providerResult?: MetaExecutionMutationResult | null;
}) {
  await appendCommandCenterExecutionAudit({
    businessId: input.businessId,
    actionFingerprint: input.action.actionFingerprint,
    clientMutationId: input.clientMutationId,
    operation: input.operation,
    executionStatus: "failed",
    supportMode: input.preview.supportMode,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    actorEmail: input.actorEmail,
    approvalActorUserId: input.preview.approval.approvedByUserId,
    approvalActorName: input.preview.approval.approvedByName,
    approvalActorEmail: input.preview.approval.approvedByEmail,
    approvedAt: input.preview.approval.approvedAt,
    previewHash: input.preview.previewHash,
    rollbackKind: input.preview.rollback.kind,
    rollbackNote: input.preview.rollback.note,
    currentState: input.currentState ?? input.preview.currentState,
    requestedState: input.requestedState ?? input.preview.requestedState,
    capturedPreApplyState:
      input.capturedPreApplyState ?? input.preview.currentState,
    providerResponse: input.providerResult
      ? {
          statusCode: input.providerResult.statusCode,
          ok: input.providerResult.ok,
          traceId: input.providerResult.traceId,
          body: input.providerResult.body,
        }
      : {},
    failureReason: input.failureReason,
    externalRefs: input.preview.plan?.externalRefs ?? null,
  });

  await upsertCommandCenterExecutionState({
    businessId: input.businessId,
    actionFingerprint: input.action.actionFingerprint,
    executionStatus: "failed",
    supportMode: input.preview.supportMode,
    sourceSystem: input.action.sourceSystem,
    sourceType: input.action.sourceType,
    requestedAction: input.action.recommendedAction,
    previewHash: input.preview.previewHash,
    workflowStatusSnapshot: "failed",
    approvalActorUserId: input.preview.approval.approvedByUserId,
    approvalActorName: input.preview.approval.approvedByName,
    approvalActorEmail: input.preview.approval.approvedByEmail,
    approvedAt: input.preview.approval.approvedAt,
    appliedByUserId: input.actorUserId,
    appliedByName: input.actorName,
    appliedByEmail: input.actorEmail,
    appliedAt: new Date().toISOString(),
    rollbackKind: input.preview.rollback.kind,
    rollbackNote: input.preview.rollback.note,
    lastClientMutationId: input.clientMutationId,
    lastErrorCode:
      input.operation === "apply"
        ? "provider_apply_failed"
        : "provider_rollback_failed",
    lastErrorMessage: input.failureReason,
    currentState: input.currentState ?? input.preview.currentState,
    requestedState: input.requestedState ?? input.preview.requestedState,
    capturedPreApplyState:
      input.capturedPreApplyState ?? input.preview.currentState,
    providerResponse: input.providerResult
      ? {
          statusCode: input.providerResult.statusCode,
          ok: input.providerResult.ok,
          traceId: input.providerResult.traceId,
        }
      : {},
  });

  await syncCommandCenterActionWorkflowStatus({
    businessId: input.businessId,
    action: input.action,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    actorEmail: input.actorEmail,
    clientMutationId: `${input.clientMutationId}:${input.operation}:workflow`,
    nextStatus: "failed",
    message:
      input.operation === "apply"
        ? `Execution failed for ${input.action.title}.`
        : `Rollback failed for ${input.action.title}.`,
    metadata: {
      executionOperation: input.operation,
      previewHash: input.preview.previewHash,
      failureReason: input.failureReason,
    },
  });
}

export async function applyCommandCenterExecution(input: {
  businessId: string;
  action: CommandCenterAction;
  startDate: string;
  endDate: string;
  permissions: CommandCenterPermissions;
  request: NextRequest;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  clientMutationId: string;
  previewHash: string;
}) {
  const preview = await getCommandCenterExecutionPreview({
    request: input.request,
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    action: input.action,
    permissions: input.permissions,
  });

  if (preview.previewHash !== input.previewHash) {
    throw new CommandCenterExecutionError({
      code: "stale_preview_hash",
      status: 409,
      message: "Execution preview is stale. Refresh before apply.",
      details: { preview },
    });
  }

  if (preview.supportMode !== "supported" || !preview.plan) {
    throw new CommandCenterExecutionError({
      code: "execution_not_supported",
      status: 400,
      message: preview.permission.reason ?? "This action cannot be applied automatically.",
      details: { preview },
    });
  }

  if (!preview.permission.canApply) {
    throw new CommandCenterExecutionError({
      code: "execution_apply_forbidden",
      status: 403,
      message: preview.permission.reason ?? "Apply is not available for this action.",
      details: { preview },
    });
  }

  const receiptReplay = await replayStoredExecutionReceiptIfPresent({
    businessId: input.businessId,
    clientMutationId: input.clientMutationId,
    operation: "apply",
  });
  if (receiptReplay) return receiptReplay;

  const existingState = await getCommandCenterExecutionState({
    businessId: input.businessId,
    actionFingerprint: input.action.actionFingerprint,
  });
  if (existingState?.lastClientMutationId === input.clientMutationId) {
    if (existingState.executionStatus === "executed") {
      const resolvedPreview = await getCommandCenterExecutionPreview({
        request: input.request,
        businessId: input.businessId,
        startDate: input.startDate,
        endDate: input.endDate,
        action: input.action,
        permissions: input.permissions,
      });
      await writeExecutionMutationReceipt({
        businessId: input.businessId,
        clientMutationId: input.clientMutationId,
        operation: "apply",
        preview: resolvedPreview,
        success: true,
      });
      return resolvedPreview;
    }
    if (existingState.executionStatus === "failed") {
      const failedPreview = await getCommandCenterExecutionPreview({
        request: input.request,
        businessId: input.businessId,
        startDate: input.startDate,
        endDate: input.endDate,
        action: input.action,
        permissions: input.permissions,
      });
      const error = {
        code: "execution_apply_failed",
        status: 502,
        message:
          existingState.lastErrorMessage ??
          "Execution apply failed on the original attempt.",
      } as const;
      await writeExecutionMutationReceipt({
        businessId: input.businessId,
        clientMutationId: input.clientMutationId,
        operation: "apply",
        preview: failedPreview,
        success: false,
        error,
      });
      throw new CommandCenterExecutionError({
        ...error,
        details: { preview: failedPreview },
      });
    }
    if (existingState.executionStatus === "applying") {
      return resolveDuplicateInFlightExecution({
        businessId: input.businessId,
        action: input.action,
        startDate: input.startDate,
        endDate: input.endDate,
        permissions: input.permissions,
        request: input.request,
        preview,
        clientMutationId: input.clientMutationId,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        actorEmail: input.actorEmail,
        operation: "apply",
        targetState: preview.requestedState,
        capturedPreApplyState: preview.currentState,
        workflowStatus: "executed",
      });
    }
  }

  await upsertCommandCenterExecutionState({
    businessId: input.businessId,
    actionFingerprint: input.action.actionFingerprint,
    executionStatus: "applying",
    supportMode: preview.supportMode,
    sourceSystem: input.action.sourceSystem,
    sourceType: input.action.sourceType,
    requestedAction: input.action.recommendedAction,
    previewHash: preview.previewHash,
    workflowStatusSnapshot: input.action.status,
    approvalActorUserId: preview.approval.approvedByUserId,
    approvalActorName: preview.approval.approvedByName,
    approvalActorEmail: preview.approval.approvedByEmail,
    approvedAt: preview.approval.approvedAt,
    appliedByUserId: input.actorUserId,
    appliedByName: input.actorName,
    appliedByEmail: input.actorEmail,
    appliedAt: new Date().toISOString(),
    rollbackKind: preview.rollback.kind,
    rollbackNote: preview.rollback.note,
    lastClientMutationId: input.clientMutationId,
    currentState: preview.currentState,
    requestedState: preview.requestedState,
    capturedPreApplyState: preview.currentState,
  });

  try {
    const providerResult = await mutateMetaAdSetExecution({
      businessId: input.businessId,
      adSetId: preview.plan.targetId,
      requestedStatus: preview.plan.requestedStatus,
      requestedDailyBudget: preview.plan.requestedDailyBudget,
    });
    const currentState = await getMetaAdSetExecutionState({
      businessId: input.businessId,
      adSetId: preview.plan.targetId,
    }).then(toExecutionStateSummary);

    await finalizeExecutionSuccess({
      businessId: input.businessId,
      action: input.action,
      preview,
      clientMutationId: input.clientMutationId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorEmail: input.actorEmail,
      operation: "apply",
      providerResult,
      currentState,
      requestedState: preview.requestedState,
      capturedPreApplyState: preview.currentState,
      workflowStatus: "executed",
    });

    const resolvedPreview = await getCommandCenterExecutionPreview({
      request: input.request,
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      action: input.action,
      permissions: input.permissions,
    });
    await writeExecutionMutationReceipt({
      businessId: input.businessId,
      clientMutationId: input.clientMutationId,
      operation: "apply",
      preview: resolvedPreview,
      success: true,
    });
    return resolvedPreview;
  } catch (error) {
    const providerResult =
      error &&
      typeof error === "object" &&
      "providerResult" in error &&
      (error as { providerResult?: MetaExecutionMutationResult }).providerResult
        ? (error as { providerResult: MetaExecutionMutationResult }).providerResult
        : null;
    const message =
      error instanceof Error ? error.message : "Execution apply failed.";
    await finalizeExecutionFailure({
      businessId: input.businessId,
      action: input.action,
      preview,
      clientMutationId: input.clientMutationId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorEmail: input.actorEmail,
      operation: "apply",
      failureReason: message,
      providerResult,
    });
    const failedPreview = await getCommandCenterExecutionPreview({
      request: input.request,
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      action: input.action,
      permissions: input.permissions,
    });
    const receiptError = {
      code: "execution_apply_failed",
      status: 502,
      message,
    } as const;
    await writeExecutionMutationReceipt({
      businessId: input.businessId,
      clientMutationId: input.clientMutationId,
      operation: "apply",
      preview: failedPreview,
      success: false,
      error: receiptError,
    });
    throw new CommandCenterExecutionError({
      ...receiptError,
      details: { preview: failedPreview },
    });
  }
}

export async function rollbackCommandCenterExecution(input: {
  businessId: string;
  action: CommandCenterAction;
  startDate: string;
  endDate: string;
  permissions: CommandCenterPermissions;
  request: NextRequest;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  clientMutationId: string;
}) {
  const preview = await getCommandCenterExecutionPreview({
    request: input.request,
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    action: input.action,
    permissions: input.permissions,
  });

  const latestState = preview.latestState;
  const rollbackState = latestState?.capturedPreApplyState ?? null;
  if (!preview.permission.canRollback || !rollbackState || !preview.plan) {
    throw new CommandCenterExecutionError({
      code: "rollback_not_available",
      status: 400,
      message:
        preview.permission.rollbackReason ??
        "Rollback is not available for this action.",
      details: { preview },
    });
  }

  const receiptReplay = await replayStoredExecutionReceiptIfPresent({
    businessId: input.businessId,
    clientMutationId: input.clientMutationId,
    operation: "rollback",
  });
  if (receiptReplay) return receiptReplay;

  if (latestState?.lastClientMutationId === input.clientMutationId) {
    if (latestState.executionStatus === "rolled_back") {
      const resolvedPreview = await getCommandCenterExecutionPreview({
        request: input.request,
        businessId: input.businessId,
        startDate: input.startDate,
        endDate: input.endDate,
        action: input.action,
        permissions: input.permissions,
      });
      await writeExecutionMutationReceipt({
        businessId: input.businessId,
        clientMutationId: input.clientMutationId,
        operation: "rollback",
        preview: resolvedPreview,
        success: true,
      });
      return resolvedPreview;
    }
    if (latestState.executionStatus === "failed") {
      const failedPreview = await getCommandCenterExecutionPreview({
        request: input.request,
        businessId: input.businessId,
        startDate: input.startDate,
        endDate: input.endDate,
        action: input.action,
        permissions: input.permissions,
      });
      const error = {
        code: "rollback_failed",
        status: 502,
        message:
          latestState.lastErrorMessage ??
          "Rollback failed on the original attempt.",
      } as const;
      await writeExecutionMutationReceipt({
        businessId: input.businessId,
        clientMutationId: input.clientMutationId,
        operation: "rollback",
        preview: failedPreview,
        success: false,
        error,
      });
      throw new CommandCenterExecutionError({
        ...error,
        details: { preview: failedPreview },
      });
    }
    if (latestState.executionStatus === "applying") {
      return resolveDuplicateInFlightExecution({
        businessId: input.businessId,
        action: input.action,
        startDate: input.startDate,
        endDate: input.endDate,
        permissions: input.permissions,
        request: input.request,
        preview,
        clientMutationId: input.clientMutationId,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        actorEmail: input.actorEmail,
        operation: "rollback",
        targetState: rollbackState,
        capturedPreApplyState: rollbackState,
        workflowStatus: "approved",
      });
    }
  }

  await upsertCommandCenterExecutionState({
    businessId: input.businessId,
    actionFingerprint: input.action.actionFingerprint,
    executionStatus: "applying",
    supportMode: preview.supportMode,
    sourceSystem: input.action.sourceSystem,
    sourceType: input.action.sourceType,
    requestedAction: input.action.recommendedAction,
    previewHash: preview.previewHash,
    workflowStatusSnapshot: input.action.status,
    approvalActorUserId: preview.approval.approvedByUserId,
    approvalActorName: preview.approval.approvedByName,
    approvalActorEmail: preview.approval.approvedByEmail,
    approvedAt: preview.approval.approvedAt,
    appliedByUserId: input.actorUserId,
    appliedByName: input.actorName,
    appliedByEmail: input.actorEmail,
    appliedAt: new Date().toISOString(),
    rollbackKind: preview.rollback.kind,
    rollbackNote: preview.rollback.note,
    lastClientMutationId: input.clientMutationId,
    currentState: preview.currentState,
    requestedState: rollbackState,
    capturedPreApplyState: latestState?.capturedPreApplyState ?? rollbackState,
  });

  try {
    const providerResult = await mutateMetaAdSetExecution({
      businessId: input.businessId,
      adSetId: preview.plan.targetId,
      requestedStatus: rollbackState.status,
      requestedDailyBudget: rollbackState.dailyBudget,
    });

    const currentState = await getMetaAdSetExecutionState({
      businessId: input.businessId,
      adSetId: preview.plan.targetId,
    }).then(toExecutionStateSummary);

    await finalizeExecutionSuccess({
      businessId: input.businessId,
      action: input.action,
      preview,
      clientMutationId: input.clientMutationId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorEmail: input.actorEmail,
      operation: "rollback",
      providerResult,
      currentState,
      requestedState: rollbackState,
      capturedPreApplyState: latestState?.capturedPreApplyState ?? rollbackState,
      workflowStatus: "approved",
    });

    const resolvedPreview = await getCommandCenterExecutionPreview({
      request: input.request,
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      action: input.action,
      permissions: input.permissions,
    });
    await writeExecutionMutationReceipt({
      businessId: input.businessId,
      clientMutationId: input.clientMutationId,
      operation: "rollback",
      preview: resolvedPreview,
      success: true,
    });
    return resolvedPreview;
  } catch (error) {
    const providerResult =
      error &&
      typeof error === "object" &&
      "providerResult" in error &&
      (error as { providerResult?: MetaExecutionMutationResult }).providerResult
        ? (error as { providerResult: MetaExecutionMutationResult }).providerResult
        : null;
    const message = error instanceof Error ? error.message : "Rollback failed.";
    await finalizeExecutionFailure({
      businessId: input.businessId,
      action: input.action,
      preview,
      clientMutationId: input.clientMutationId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorEmail: input.actorEmail,
      operation: "rollback",
      failureReason: message,
      currentState: preview.currentState,
      requestedState: rollbackState,
      capturedPreApplyState: latestState?.capturedPreApplyState ?? rollbackState,
      providerResult,
    });
    const failedPreview = await getCommandCenterExecutionPreview({
      request: input.request,
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      action: input.action,
      permissions: input.permissions,
    });
    const receiptError = {
      code: "rollback_failed",
      status: 502,
      message,
    } as const;
    await writeExecutionMutationReceipt({
      businessId: input.businessId,
      clientMutationId: input.clientMutationId,
      operation: "rollback",
      preview: failedPreview,
      success: false,
      error: receiptError,
    });
    throw new CommandCenterExecutionError({
      ...receiptError,
      details: { preview: failedPreview },
    });
  }
}

export function isCommandCenterExecutionError(error: unknown): error is CommandCenterExecutionError {
  return error instanceof CommandCenterExecutionError;
}
