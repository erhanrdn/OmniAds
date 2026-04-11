import { createHash } from "crypto";
import type {
  CommandCenterActionStatus,
  CommandCenterSourceSystem,
  CommandCenterSourceType,
} from "@/lib/command-center";

export const COMMAND_CENTER_EXECUTION_CONTRACT_VERSION =
  "command-center-execution.v1" as const;

export const COMMAND_CENTER_EXECUTION_SUPPORT_MODES = [
  "supported",
  "manual_only",
  "unsupported",
] as const;

export type CommandCenterExecutionSupportMode =
  (typeof COMMAND_CENTER_EXECUTION_SUPPORT_MODES)[number];

export const COMMAND_CENTER_EXECUTION_STATUSES = [
  "draft",
  "ready_for_apply",
  "applying",
  "executed",
  "failed",
  "rolled_back",
  "manual_only",
  "unsupported",
] as const;

export type CommandCenterExecutionStatus =
  (typeof COMMAND_CENTER_EXECUTION_STATUSES)[number];

export const COMMAND_CENTER_EXECUTION_APPLY_GATE_POSTURES = [
  "enabled",
  "allowlist_only",
  "disabled",
  "not_applicable",
] as const;

export type CommandCenterExecutionApplyGatePosture =
  (typeof COMMAND_CENTER_EXECUTION_APPLY_GATE_POSTURES)[number];

export const META_EXECUTION_SUPPORTED_ACTIONS = [
  "pause",
  "recover",
  "scale_budget",
  "reduce_budget",
] as const;

export type MetaExecutionSupportedAction =
  (typeof META_EXECUTION_SUPPORTED_ACTIONS)[number];

export const META_EXECUTION_ROLLBACK_KINDS = [
  "provider_rollback",
  "recovery_note_only",
  "not_available",
] as const;

export type MetaExecutionRollbackKind =
  (typeof META_EXECUTION_ROLLBACK_KINDS)[number];

export const COMMAND_CENTER_EXECUTION_OPERATIONS = [
  "apply",
  "rollback",
] as const;

export type CommandCenterExecutionOperation =
  (typeof COMMAND_CENTER_EXECUTION_OPERATIONS)[number];

export interface CommandCenterExecutionStateSummary {
  status: string | null;
  budgetLevel: "campaign" | "adset" | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  optimizationGoal: string | null;
  bidStrategyLabel: string | null;
}

export interface CommandCenterExecutionDiffItem {
  key: string;
  label: string;
  currentValue: string;
  requestedValue: string;
  changeType: "status" | "increase" | "decrease" | "set" | "none";
}

export interface CommandCenterExecutionApprovalSnapshot {
  workflowStatus: CommandCenterActionStatus;
  approvedAt: string | null;
  approvedByUserId: string | null;
  approvedByName: string | null;
  approvedByEmail: string | null;
}

export interface CommandCenterExecutionExternalRefs {
  provider: "meta";
  providerAccountId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adSetId: string | null;
  adSetName: string | null;
}

export interface MetaExecutionMutationPlan {
  provider: "meta";
  targetType: "adset";
  targetId: string;
  actionType: MetaExecutionSupportedAction;
  requestedStatus: string | null;
  requestedDailyBudget: number | null;
  rollbackKind: MetaExecutionRollbackKind;
  rollbackNote: string | null;
  providerPayload: Record<string, string | number>;
  externalRefs: CommandCenterExecutionExternalRefs;
}

export interface CommandCenterExecutionPermission {
  canApply: boolean;
  reason: string | null;
  canRollback: boolean;
  rollbackReason: string | null;
}

export interface CommandCenterExecutionSupportMatrixEntry {
  familyKey: string;
  label: string;
  sourceSystem: CommandCenterSourceSystem;
  sourceType: CommandCenterSourceType;
  recommendedAction: string | null;
  supportMode: CommandCenterExecutionSupportMode;
  applyGate: {
    posture: CommandCenterExecutionApplyGatePosture;
    note: string;
  };
  rollback: {
    kind: MetaExecutionRollbackKind;
    note: string | null;
  };
  supportReason: string;
  operatorGuidance: string[];
}

export interface CommandCenterExecutionSupportMatrix {
  selectedEntry: CommandCenterExecutionSupportMatrixEntry;
  entries: CommandCenterExecutionSupportMatrixEntry[];
}

export interface CommandCenterExecutionAuditEntry {
  id: string;
  businessId: string;
  actionFingerprint: string;
  operation: CommandCenterExecutionOperation;
  executionStatus: CommandCenterExecutionStatus;
  supportMode: CommandCenterExecutionSupportMode;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  approvalActorUserId: string | null;
  approvalActorName: string | null;
  approvalActorEmail: string | null;
  approvedAt: string | null;
  previewHash: string | null;
  rollbackKind: MetaExecutionRollbackKind;
  rollbackNote: string | null;
  currentState: CommandCenterExecutionStateSummary | null;
  requestedState: CommandCenterExecutionStateSummary | null;
  capturedPreApplyState: CommandCenterExecutionStateSummary | null;
  providerResponse: Record<string, unknown>;
  failureReason: string | null;
  externalRefs: CommandCenterExecutionExternalRefs | null;
  createdAt: string;
}

export interface CommandCenterExecutionStateRecord {
  businessId: string;
  actionFingerprint: string;
  executionStatus: CommandCenterExecutionStatus;
  supportMode: CommandCenterExecutionSupportMode;
  sourceSystem: CommandCenterSourceSystem;
  sourceType: CommandCenterSourceType;
  requestedAction: string;
  previewHash: string | null;
  workflowStatusSnapshot: CommandCenterActionStatus;
  approvalActorUserId: string | null;
  approvalActorName: string | null;
  approvalActorEmail: string | null;
  approvedAt: string | null;
  appliedByUserId: string | null;
  appliedByName: string | null;
  appliedByEmail: string | null;
  appliedAt: string | null;
  rollbackKind: MetaExecutionRollbackKind;
  rollbackNote: string | null;
  lastClientMutationId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  currentState: CommandCenterExecutionStateSummary | null;
  requestedState: CommandCenterExecutionStateSummary | null;
  capturedPreApplyState: CommandCenterExecutionStateSummary | null;
  providerResponse: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CommandCenterExecutionPreview {
  contractVersion: typeof COMMAND_CENTER_EXECUTION_CONTRACT_VERSION;
  generatedAt: string;
  businessId: string;
  startDate: string;
  endDate: string;
  actionFingerprint: string;
  sourceType: CommandCenterSourceType;
  requestedAction: string;
  supportMode: CommandCenterExecutionSupportMode;
  status: CommandCenterExecutionStatus;
  previewHash: string;
  supportMatrix: CommandCenterExecutionSupportMatrix;
  approval: CommandCenterExecutionApprovalSnapshot;
  permission: CommandCenterExecutionPermission;
  target: {
    entityType: "adset" | "campaign" | "creative" | "geo" | "placement" | "unknown";
    entityId: string | null;
    entityLabel: string | null;
    campaignId: string | null;
    campaignName: string | null;
  };
  currentState: CommandCenterExecutionStateSummary | null;
  requestedState: CommandCenterExecutionStateSummary | null;
  diff: CommandCenterExecutionDiffItem[];
  prerequisites: string[];
  risks: string[];
  manualInstructions: string[];
  auditTrail: CommandCenterExecutionAuditEntry[];
  latestState: CommandCenterExecutionStateRecord | null;
  plan: MetaExecutionMutationPlan | null;
  rollback: {
    kind: MetaExecutionRollbackKind;
    note: string | null;
  };
}

export function buildCommandCenterExecutionPreviewHash(input: {
  businessId: string;
  actionFingerprint: string;
  requestedAction: string;
  supportMode: CommandCenterExecutionSupportMode;
  approvalWorkflowStatus: CommandCenterActionStatus;
  currentState: CommandCenterExecutionStateSummary | null;
  requestedState: CommandCenterExecutionStateSummary | null;
  plan: MetaExecutionMutationPlan | null;
  diff: CommandCenterExecutionDiffItem[];
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: COMMAND_CENTER_EXECUTION_CONTRACT_VERSION,
        businessId: input.businessId,
        actionFingerprint: input.actionFingerprint,
        requestedAction: input.requestedAction,
        supportMode: input.supportMode,
        approvalWorkflowStatus: input.approvalWorkflowStatus,
        currentState: input.currentState,
        requestedState: input.requestedState,
        plan: input.plan,
        diff: input.diff,
      }),
    )
    .digest("hex");
}

export function normalizeMetaExecutionStatus(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

export function summarizeExecutionStateValue(value: string | number | null | undefined) {
  if (value == null) return "Unavailable";
  if (typeof value === "number") {
    return Number.isFinite(value) ? `${Math.round(value)}` : "Unavailable";
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : "Unavailable";
}
