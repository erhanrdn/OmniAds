import type { NextRequest } from "next/server";
import type {
  CommandCenterAction,
  CommandCenterJournalEntry,
  CommandCenterPermissions,
} from "@/lib/command-center";
import {
  listCommandCenterJournal,
} from "@/lib/command-center-store";
import {
  buildCommandCenterExecutionPreviewHash,
  COMMAND_CENTER_EXECUTION_CONTRACT_VERSION,
  type CommandCenterExecutionApprovalSnapshot,
  type CommandCenterExecutionDiffItem,
  type CommandCenterExecutionPreview,
  type CommandCenterExecutionStateSummary,
  type CommandCenterExecutionSupportMode,
  type MetaExecutionMutationPlan,
  META_EXECUTION_SUPPORTED_ACTIONS,
  normalizeMetaExecutionStatus,
  summarizeExecutionStateValue,
} from "@/lib/command-center-execution";
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
import { syncCommandCenterActionWorkflowStatus } from "@/lib/command-center-store";
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
  manualInstructions: string[];
  prerequisites: string[];
  risks: string[];
  supportMode: CommandCenterExecutionSupportMode;
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
    approval: input.approval,
    permission: {
      canApply: false,
      reason:
        input.supportMode === "unsupported"
          ? "This action is outside the Phase 06 execution subset."
          : "This action requires manual execution.",
      canRollback: false,
      rollbackReason: "No provider rollback is available for this action.",
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
      note: "Rollback is unavailable because no provider-side apply path exists.",
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
      prerequisites: [],
      risks: ["Execution is intentionally limited to Meta ad set actions in V1."],
      manualInstructions: [
        "Execute this action manually from the source surface.",
        "Do not mark unsupported actions as applied.",
      ],
      supportMode: "unsupported",
    });
  }

  if (input.action.sourceType !== "meta_adset_decision") {
    const supportMode =
      input.action.sourceType === "meta_budget_shift" ? "manual_only" : "unsupported";
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
      prerequisites: [],
      risks: [
        supportMode === "manual_only"
          ? "Budget-shift recommendations are banded and do not ship exact transfer targets in V1."
          : "This Command Center source does not have a provider execution path in V1.",
      ],
      manualInstructions: [
        supportMode === "manual_only"
          ? "Review the source decision and perform the transfer manually in Meta Ads Manager."
          : "Unsupported actions remain read-only in V1.",
      ],
      supportMode,
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
      prerequisites: [],
      risks: ["The decision source drifted and could not be matched to a live Meta ad set decision."],
      manualInstructions: [
        "Refresh the source Decision OS surface before applying any change.",
      ],
      supportMode: "manual_only",
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
      prerequisites: [],
      risks: ["This ad set action is outside the supported V1 mutation subset."],
      manualInstructions: [
        "Use Meta Ads Manager to apply this action manually.",
      ],
      supportMode: "manual_only",
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
      prerequisites: [],
      risks: ["The current live ad set configuration could not be resolved."],
      manualInstructions: [
        "Validate the ad set directly in Meta Ads Manager before making changes.",
      ],
      supportMode: "manual_only",
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
      prerequisites: [],
      risks: ["The current execution state could not be summarized safely."],
      manualInstructions: [
        "Refresh the source decision before attempting any live mutation.",
      ],
      supportMode: "manual_only",
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
      prerequisites: [],
      risks: ["Demo and unassigned provider scopes remain manual-only in V1."],
      manualInstructions: [
        "Execution preview is informational only on demo or non-assigned scopes.",
      ],
      supportMode: "manual_only",
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
      prerequisites: [],
      risks: ["Campaign-owned ad set budgets are not executed automatically in V1."],
      manualInstructions: [
        "Update the campaign budget manually if you want to follow this recommendation.",
      ],
      supportMode: "manual_only",
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
      prerequisites: [],
      risks: ["Lifetime or mixed-budget ad sets are outside the safe V1 execution subset."],
      manualInstructions: [
        "Review this ad set manually before changing budget configuration.",
      ],
      supportMode: "manual_only",
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
        prerequisites: [],
        risks: ["A live ad set daily budget was not available for this mutation."],
        manualInstructions: [
          "Inspect the budget configuration manually before applying any change.",
        ],
        supportMode: "manual_only",
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
        prerequisites: [],
        risks: ["The exact requested daily budget is either invalid or already live."],
        manualInstructions: [
          "No provider write will be issued for a no-op or invalid budget target.",
        ],
        supportMode: "manual_only",
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
      prerequisites: [],
      risks: ["The live state already matches the requested target."],
      manualInstructions: [
        "No automatic apply is available because this recommendation is already satisfied.",
      ],
      supportMode: "manual_only",
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
  failureReason: string;
  providerResult?: MetaExecutionMutationResult | null;
}) {
  await appendCommandCenterExecutionAudit({
    businessId: input.businessId,
    actionFingerprint: input.action.actionFingerprint,
    clientMutationId: input.clientMutationId,
    operation: "apply",
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
    currentState: input.preview.currentState,
    requestedState: input.preview.requestedState,
    capturedPreApplyState: input.preview.currentState,
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
    lastErrorCode: "provider_apply_failed",
    lastErrorMessage: input.failureReason,
    currentState: input.preview.currentState,
    requestedState: input.preview.requestedState,
    capturedPreApplyState: input.preview.currentState,
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
    clientMutationId: `${input.clientMutationId}:apply:workflow`,
    nextStatus: "failed",
    message: `Execution failed for ${input.action.title}.`,
    metadata: {
      executionOperation: "apply",
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

  const existingState = await getCommandCenterExecutionState({
    businessId: input.businessId,
    actionFingerprint: input.action.actionFingerprint,
  });
  if (existingState?.lastClientMutationId === input.clientMutationId) {
    if (existingState.executionStatus === "executed") {
      return getCommandCenterExecutionPreview({
        request: input.request,
        businessId: input.businessId,
        startDate: input.startDate,
        endDate: input.endDate,
        action: input.action,
        permissions: input.permissions,
      });
    }
    if (
      existingState.executionStatus === "applying" &&
      doesRequestedStateMatch({
        currentState: await getMetaAdSetExecutionState({
          businessId: input.businessId,
          adSetId: preview.plan.targetId,
        }).then(toExecutionStateSummary),
        requestedState: preview.requestedState,
      })
    ) {
      return getCommandCenterExecutionPreview({
        request: input.request,
        businessId: input.businessId,
        startDate: input.startDate,
        endDate: input.endDate,
        action: input.action,
        permissions: input.permissions,
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
      failureReason: message,
      providerResult,
    });
    throw new CommandCenterExecutionError({
      code: "execution_apply_failed",
      status: 502,
      message,
      details: { preview },
    });
  }

  return getCommandCenterExecutionPreview({
    request: input.request,
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    action: input.action,
    permissions: input.permissions,
  });
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

  if (latestState?.lastClientMutationId === input.clientMutationId) {
    return preview;
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
    capturedPreApplyState: rollbackState,
  });

  const providerResult = await mutateMetaAdSetExecution({
    businessId: input.businessId,
    adSetId: preview.plan.targetId,
    requestedStatus: rollbackState.status,
    requestedDailyBudget: rollbackState.dailyBudget,
  }).catch((error) => {
    const providerResultCandidate =
      error &&
      typeof error === "object" &&
      "providerResult" in error &&
      (error as { providerResult?: MetaExecutionMutationResult }).providerResult
        ? (error as { providerResult: MetaExecutionMutationResult }).providerResult
        : null;
    throw new CommandCenterExecutionError({
      code: "rollback_failed",
      status: 502,
      message: error instanceof Error ? error.message : "Rollback failed.",
      details: {
        providerResult: providerResultCandidate,
      },
    });
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
    capturedPreApplyState: rollbackState,
    workflowStatus: "approved",
  });

  return getCommandCenterExecutionPreview({
    request: input.request,
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    action: input.action,
    permissions: input.permissions,
  });
}

export function isCommandCenterExecutionError(error: unknown): error is CommandCenterExecutionError {
  return error instanceof CommandCenterExecutionError;
}
