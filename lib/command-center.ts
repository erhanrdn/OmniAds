import { createHash } from "crypto";
import type { MembershipRole } from "@/lib/auth";
import type {
  CreativeDecisionOsCreative,
  CreativeDecisionOsV1Response,
} from "@/lib/creative-decision-os";
import type {
  MetaAdSetDecision,
  MetaBudgetShift,
  MetaDecisionEvidence,
  MetaDecisionOsV1Response,
  MetaGeoDecision,
  MetaNoTouchItem,
  MetaPlacementAnomaly,
} from "@/lib/meta/decision-os";

export const COMMAND_CENTER_CONTRACT_VERSION = "command-center.v1" as const;
export const COMMAND_CENTER_ACTION_FINGERPRINT_VERSION =
  "command-center-action-fingerprint.v1" as const;

export const COMMAND_CENTER_ACTION_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "snoozed",
  "completed_manual",
  "executed",
  "failed",
  "canceled",
] as const;

export type CommandCenterActionStatus =
  (typeof COMMAND_CENTER_ACTION_STATUSES)[number];

export const COMMAND_CENTER_ACTION_MUTATIONS = [
  "approve",
  "reject",
  "snooze",
  "assign",
  "reopen",
  "complete_manual",
  "cancel",
  "fail",
] as const;

export type CommandCenterActionMutation =
  (typeof COMMAND_CENTER_ACTION_MUTATIONS)[number];

export const COMMAND_CENTER_JOURNAL_EVENT_TYPES = [
  "status_changed",
  "assignee_changed",
  "note_added",
  "handoff_created",
  "handoff_acknowledged",
] as const;

export type CommandCenterJournalEventType =
  (typeof COMMAND_CENTER_JOURNAL_EVENT_TYPES)[number];

export const COMMAND_CENTER_SHIFTS = ["morning", "evening"] as const;
export type CommandCenterShift = (typeof COMMAND_CENTER_SHIFTS)[number];

export type CommandCenterSourceSystem = "meta" | "creative";
export type CommandCenterSourceType =
  | "meta_adset_decision"
  | "meta_budget_shift"
  | "meta_geo_decision"
  | "meta_placement_anomaly"
  | "meta_no_touch_item"
  | "creative_primary_decision";

export type CommandCenterPriority = "critical" | "high" | "medium" | "low";

const COMMAND_CENTER_SOURCE_TYPES = [
  "meta_adset_decision",
  "meta_budget_shift",
  "meta_geo_decision",
  "meta_placement_anomaly",
  "meta_no_touch_item",
  "creative_primary_decision",
] as const satisfies ReadonlyArray<CommandCenterSourceType>;

export interface CommandCenterActionEvidence {
  label: string;
  value: string;
  impact?: "positive" | "negative" | "mixed" | "neutral";
}

export interface CommandCenterActionRelatedEntity {
  type: "campaign" | "adset" | "geo" | "placement" | "creative" | "family";
  id: string;
  label: string;
}

export interface CommandCenterActionSourceContext {
  sourceLabel: "Meta Decision OS" | "Creative Decision OS";
  operatingMode: string | null;
  sourceDeepLink: string;
  sourceDecisionId: string;
}

export interface CommandCenterAction {
  actionFingerprint: string;
  sourceSystem: CommandCenterSourceSystem;
  sourceType: CommandCenterSourceType;
  title: string;
  recommendedAction: string;
  confidence: number;
  priority: CommandCenterPriority;
  summary: string;
  decisionSignals: string[];
  evidence: CommandCenterActionEvidence[];
  guardrails: string[];
  relatedEntities: CommandCenterActionRelatedEntity[];
  tags: string[];
  watchlistOnly: boolean;
  status: CommandCenterActionStatus;
  assigneeUserId: string | null;
  assigneeName: string | null;
  snoozeUntil: string | null;
  latestNoteExcerpt: string | null;
  noteCount: number;
  lastMutatedAt: string | null;
  lastMutationId: string | null;
  createdAt: string;
  sourceContext: CommandCenterActionSourceContext;
}

export interface CommandCenterPermissions {
  canEdit: boolean;
  reason: string | null;
  role: MembershipRole;
}

export interface CommandCenterAssignableUser {
  userId: string;
  name: string;
  email: string;
  role: Extract<MembershipRole, "admin" | "collaborator">;
}

export interface CommandCenterJournalEntry {
  id: string;
  businessId: string;
  actionFingerprint: string;
  actionTitle: string;
  sourceSystem: CommandCenterSourceSystem;
  sourceType: CommandCenterSourceType;
  eventType: CommandCenterJournalEventType;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  message: string;
  note: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CommandCenterSavedViewDefinition {
  sourceTypes?: CommandCenterSourceType[];
  statuses?: CommandCenterActionStatus[];
  tags?: string[];
  watchlistOnly?: boolean;
}

export interface CommandCenterSavedView {
  id: string;
  businessId: string;
  viewKey: string;
  name: string;
  definition: CommandCenterSavedViewDefinition;
  isBuiltIn: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CommandCenterHandoff {
  id: string;
  businessId: string;
  shift: CommandCenterShift;
  summary: string;
  blockers: string[];
  watchouts: string[];
  linkedActionFingerprints: string[];
  fromUserId: string;
  fromUserName: string | null;
  toUserId: string | null;
  toUserName: string | null;
  acknowledgedAt: string | null;
  acknowledgedByUserId: string | null;
  acknowledgedByUserName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommandCenterMutationRequest {
  businessId: string;
  actionFingerprint: string;
  clientMutationId: string;
  mutation: CommandCenterActionMutation;
  assigneeUserId?: string | null;
  snoozeUntil?: string | null;
}

export interface CommandCenterResponse {
  contractVersion: typeof COMMAND_CENTER_CONTRACT_VERSION;
  generatedAt: string;
  businessId: string;
  startDate: string;
  endDate: string;
  activeViewKey: string | null;
  permissions: CommandCenterPermissions;
  summary: {
    totalActions: number;
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    snoozedCount: number;
    assignedCount: number;
    watchlistCount: number;
  };
  actions: CommandCenterAction[];
  savedViews: CommandCenterSavedView[];
  journal: CommandCenterJournalEntry[];
  handoffs: CommandCenterHandoff[];
  assignableUsers: CommandCenterAssignableUser[];
}

interface CommandCenterActionBase {
  sourceSystem: CommandCenterSourceSystem;
  sourceType: CommandCenterSourceType;
  entityType: string;
  entityId: string;
  sourceDecisionId: string;
  recommendedAction: string;
}

export interface CommandCenterActionStateRecord {
  businessId: string;
  actionFingerprint: string;
  sourceSystem: CommandCenterSourceSystem;
  sourceType: CommandCenterSourceType;
  actionTitle: string;
  recommendedAction: string;
  workflowStatus: CommandCenterActionStatus;
  assigneeUserId: string | null;
  assigneeName: string | null;
  snoozeUntil: string | null;
  latestNoteExcerpt: string | null;
  noteCount: number;
  lastMutationId: string | null;
  lastMutatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const COMMAND_CENTER_BUILT_IN_VIEWS = [
  {
    viewKey: "today_priorities",
    name: "Today priorities",
    definition: {
      watchlistOnly: false,
      statuses: ["pending", "approved", "failed"] satisfies CommandCenterActionStatus[],
    },
  },
  {
    viewKey: "budget_shifts",
    name: "Budget shifts",
    definition: {
      sourceTypes: ["meta_budget_shift"] satisfies CommandCenterSourceType[],
    },
  },
  {
    viewKey: "test_backlog",
    name: "Test backlog",
    definition: {
      tags: ["test_backlog"],
    },
  },
  {
    viewKey: "scale_promotions",
    name: "Scale promotions",
    definition: {
      tags: ["scale_promotions"],
    },
  },
  {
    viewKey: "fatigue_refresh",
    name: "Fatigue refresh",
    definition: {
      tags: ["fatigue_refresh"],
    },
  },
  {
    viewKey: "high_risk_actions",
    name: "High-risk actions",
    definition: {
      tags: ["high_risk_actions"],
    },
  },
  {
    viewKey: "no_touch_surfaces",
    name: "No-touch surfaces",
    definition: {
      watchlistOnly: true,
    },
  },
  {
    viewKey: "geo_issues",
    name: "Geo issues",
    definition: {
      sourceTypes: ["meta_geo_decision"] satisfies CommandCenterSourceType[],
    },
  },
  {
    viewKey: "promo_mode_watchlist",
    name: "Promo mode watchlist",
    definition: {
      tags: ["promo_mode_watchlist"],
    },
  },
] as const satisfies ReadonlyArray<{
  viewKey: string;
  name: string;
  definition: CommandCenterSavedViewDefinition;
}>;

const STATUS_TRANSITIONS: Record<
  CommandCenterActionStatus,
  CommandCenterActionStatus[]
> = {
  pending: ["approved", "rejected", "snoozed", "canceled"],
  approved: ["completed_manual", "canceled", "failed"],
  rejected: ["pending"],
  snoozed: ["pending"],
  completed_manual: ["pending"],
  executed: [],
  failed: ["pending"],
  canceled: ["pending"],
};

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.99, Number(value.toFixed(2))));
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function joinSignals(values: Array<string | null | undefined>) {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function containsPromoSignal(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("promo") ||
    normalized.includes("clearance") ||
    normalized.includes("sale") ||
    normalized.includes("launch")
  );
}

function evidenceFromMetrics(metrics: MetaAdSetDecision["supportingMetrics"]) {
  return [
    {
      label: "ROAS",
      value: `${metrics.roas.toFixed(2)}x`,
      impact: metrics.roas >= 2 ? "positive" : "negative",
    },
    {
      label: "Spend",
      value: `$${metrics.spend.toFixed(0)}`,
      impact: "neutral",
    },
    {
      label: "Purchases",
      value: `${metrics.purchases}`,
      impact: "neutral",
    },
  ] satisfies CommandCenterActionEvidence[];
}

function priorityFromMetaAdSet(decision: MetaAdSetDecision): CommandCenterPriority {
  if (decision.priority === "critical") return "critical";
  if (decision.priority === "high") return "high";
  if (decision.actionType === "pause" || decision.actionType === "rebuild") {
    return "high";
  }
  return decision.priority === "low" ? "low" : "medium";
}

function priorityFromCreative(creative: CreativeDecisionOsCreative): CommandCenterPriority {
  if (creative.primaryAction === "block_deploy") return "critical";
  if (
    creative.primaryAction === "refresh_replace" ||
    creative.primaryAction === "promote_to_scaling"
  ) {
    return "high";
  }
  if (creative.primaryAction === "hold_no_touch") return "low";
  return "medium";
}

function createActionFingerprint(base: CommandCenterActionBase) {
  const signature = JSON.stringify({
    version: COMMAND_CENTER_ACTION_FINGERPRINT_VERSION,
    sourceSystem: base.sourceSystem,
    sourceType: base.sourceType,
    entityType: base.entityType,
    entityId: base.entityId,
    sourceDecisionId: base.sourceDecisionId,
    recommendedAction: base.recommendedAction,
  });

  return `cc_${createHash("sha256").update(signature).digest("hex").slice(0, 24)}`;
}

function buildMetaAction(
  input: Omit<CommandCenterAction, "actionFingerprint" | "status" | "assigneeUserId" | "assigneeName" | "snoozeUntil" | "latestNoteExcerpt" | "noteCount" | "lastMutatedAt" | "lastMutationId" | "createdAt"> & {
    entityType: string;
    entityId: string;
  },
): CommandCenterAction {
  return {
    ...input,
    actionFingerprint: createActionFingerprint({
      sourceSystem: input.sourceSystem,
      sourceType: input.sourceType,
      entityType: input.entityType,
      entityId: input.entityId,
      sourceDecisionId: input.sourceContext.sourceDecisionId,
      recommendedAction: input.recommendedAction,
    }),
    status: "pending",
    assigneeUserId: null,
    assigneeName: null,
    snoozeUntil: null,
    latestNoteExcerpt: null,
    noteCount: 0,
    lastMutatedAt: null,
    lastMutationId: null,
    createdAt: new Date().toISOString(),
  };
}

function metaAdSetTags(decision: MetaAdSetDecision) {
  const tags = new Set<string>();
  if (decision.actionType === "scale_budget") tags.add("scale_promotions");
  if (
    decision.actionType === "rebuild" ||
    decision.actionType === "broaden" ||
    decision.actionType === "recover"
  ) {
    tags.add("test_backlog");
  }
  if (
    decision.actionType === "pause" ||
    decision.actionType === "reduce_budget" ||
    decision.priority === "critical"
  ) {
    tags.add("high_risk_actions");
  }
  if (containsPromoSignal(decision.campaignName)) {
    tags.add("promo_mode_watchlist");
  }
  return Array.from(tags);
}

function creativeTags(creative: CreativeDecisionOsCreative) {
  const tags = new Set<string>();
  if (creative.primaryAction === "promote_to_scaling") tags.add("scale_promotions");
  if (
    creative.primaryAction === "keep_in_test" ||
    creative.primaryAction === "retest_comeback"
  ) {
    tags.add("test_backlog");
  }
  if (creative.primaryAction === "refresh_replace") tags.add("fatigue_refresh");
  if (creative.primaryAction === "block_deploy") tags.add("high_risk_actions");
  if (
    containsPromoSignal(creative.familyLabel) ||
    containsPromoSignal(creative.name)
  ) {
    tags.add("promo_mode_watchlist");
  }
  return Array.from(tags);
}

function metaEvidenceFromDecision(
  evidence: MetaDecisionEvidence[],
): CommandCenterActionEvidence[] {
  return evidence.map((item) => ({
    label: item.label,
    value: item.value,
    impact: item.impact,
  }));
}

export function aggregateCommandCenterActions(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  metaDecisionOs: MetaDecisionOsV1Response | null;
  creativeDecisionOs: CreativeDecisionOsV1Response | null;
  stateByFingerprint?: Map<string, CommandCenterActionStateRecord>;
}): CommandCenterAction[] {
  const generatedAt = new Date().toISOString();
  const actions: CommandCenterAction[] = [];

  if (input.metaDecisionOs) {
    const operatingMode = input.metaDecisionOs.summary.operatingMode?.recommendedMode ?? null;

    input.metaDecisionOs.adSets.forEach((decision) => {
      actions.push(
        buildMetaAction({
          sourceSystem: "meta",
          sourceType: "meta_adset_decision",
          entityType: "adset",
          entityId: decision.adSetId,
          title: decision.adSetName,
          recommendedAction: decision.actionType,
          confidence: clampConfidence(decision.confidence),
          priority: priorityFromMetaAdSet(decision),
          summary: decision.reasons[0] ?? `${decision.actionType} for ${decision.adSetName}`,
          decisionSignals: decision.reasons,
          evidence: evidenceFromMetrics(decision.supportingMetrics),
          guardrails: decision.guardrails,
          relatedEntities: [
            {
              type: "campaign",
              id: decision.campaignId,
              label: decision.campaignName,
            },
            {
              type: "adset",
              id: decision.adSetId,
              label: decision.adSetName,
            },
          ],
          tags: metaAdSetTags(decision),
          watchlistOnly: false,
          sourceContext: {
            sourceLabel: "Meta Decision OS",
            operatingMode,
            sourceDeepLink: `/platforms/meta?businessId=${encodeURIComponent(
              input.businessId,
            )}&startDate=${encodeURIComponent(input.startDate)}&endDate=${encodeURIComponent(
              input.endDate,
            )}`,
            sourceDecisionId: decision.decisionId,
          },
        }),
      );
    });

    input.metaDecisionOs.budgetShifts.forEach((shift) => {
      actions.push(
        buildMetaAction({
          sourceSystem: "meta",
          sourceType: "meta_budget_shift",
          entityType: "campaign",
          entityId: `${shift.fromCampaignId}:${shift.toCampaignId}`,
          title: `${shift.from} -> ${shift.to}`,
          recommendedAction: "budget_shift",
          confidence: clampConfidence(shift.confidence),
          priority: shift.riskLevel === "high" ? "high" : "medium",
          summary: shift.whyNow,
          decisionSignals: [shift.whyNow, shift.expectedBenefit],
          evidence: [
            {
              label: "Move band",
              value: shift.suggestedMoveBand,
              impact: "neutral",
            },
          ],
          guardrails: shift.guardrails,
          relatedEntities: [
            {
              type: "campaign",
              id: shift.fromCampaignId,
              label: shift.fromCampaignName,
            },
            {
              type: "campaign",
              id: shift.toCampaignId,
              label: shift.toCampaignName,
            },
          ],
          tags: [
            "budget_shifts",
            "scale_promotions",
            ...(containsPromoSignal(shift.from) || containsPromoSignal(shift.to)
              ? ["promo_mode_watchlist"]
              : []),
          ],
          watchlistOnly: false,
          sourceContext: {
            sourceLabel: "Meta Decision OS",
            operatingMode,
            sourceDeepLink: `/platforms/meta?businessId=${encodeURIComponent(
              input.businessId,
            )}&startDate=${encodeURIComponent(input.startDate)}&endDate=${encodeURIComponent(
              input.endDate,
            )}`,
            sourceDecisionId: `${shift.fromCampaignId}:${shift.toCampaignId}`,
          },
        }),
      );
    });

    input.metaDecisionOs.geoDecisions.forEach((decision) => {
      actions.push(
        buildMetaAction({
          sourceSystem: "meta",
          sourceType: "meta_geo_decision",
          entityType: "geo",
          entityId: decision.geoKey,
          title: decision.label,
          recommendedAction: decision.action,
          confidence: clampConfidence(decision.confidence),
          priority:
            decision.action === "cut" || decision.action === "isolate"
              ? "high"
              : "medium",
          summary: decision.why,
          decisionSignals: [decision.why, ...decision.whatWouldChangeThisDecision],
          evidence: metaEvidenceFromDecision(decision.evidence),
          guardrails: decision.guardrails,
          relatedEntities: [
            {
              type: "geo",
              id: decision.geoKey,
              label: decision.label,
            },
          ],
          tags: [
            "geo_issues",
            ...(decision.action === "cut" || decision.action === "isolate"
              ? ["high_risk_actions"]
              : []),
          ],
          watchlistOnly: false,
          sourceContext: {
            sourceLabel: "Meta Decision OS",
            operatingMode,
            sourceDeepLink: `/platforms/meta?businessId=${encodeURIComponent(
              input.businessId,
            )}&startDate=${encodeURIComponent(input.startDate)}&endDate=${encodeURIComponent(
              input.endDate,
            )}`,
            sourceDecisionId: decision.geoKey,
          },
        }),
      );
    });

    input.metaDecisionOs.placementAnomalies.forEach((anomaly) => {
      actions.push(
        buildMetaAction({
          sourceSystem: "meta",
          sourceType: "meta_placement_anomaly",
          entityType: "placement",
          entityId: anomaly.placementKey,
          title: anomaly.label,
          recommendedAction: anomaly.action,
          confidence: clampConfidence(anomaly.confidence),
          priority: anomaly.action === "exception_review" ? "high" : "medium",
          summary: anomaly.note,
          decisionSignals: [
            anomaly.note,
            ...anomaly.whatWouldChangeThisDecision,
          ],
          evidence: metaEvidenceFromDecision(anomaly.evidence),
          guardrails: [],
          relatedEntities: [
            {
              type: "placement",
              id: anomaly.placementKey,
              label: anomaly.label,
            },
          ],
          tags: ["high_risk_actions"],
          watchlistOnly: false,
          sourceContext: {
            sourceLabel: "Meta Decision OS",
            operatingMode,
            sourceDeepLink: `/platforms/meta?businessId=${encodeURIComponent(
              input.businessId,
            )}&startDate=${encodeURIComponent(input.startDate)}&endDate=${encodeURIComponent(
              input.endDate,
            )}`,
            sourceDecisionId: anomaly.placementKey,
          },
        }),
      );
    });

    input.metaDecisionOs.noTouchList.forEach((item) => {
      actions.push(
        metaNoTouchAction({
          businessId: input.businessId,
          startDate: input.startDate,
          endDate: input.endDate,
          operatingMode,
          item,
          generatedAt,
        }),
      );
    });
  }

  if (input.creativeDecisionOs) {
    const operatingMode = input.creativeDecisionOs.summary.operatingMode ?? null;
    input.creativeDecisionOs.creatives.forEach((creative) => {
      const watchlistOnly = creative.primaryAction === "hold_no_touch";
      actions.push(
        buildMetaAction({
          sourceSystem: "creative",
          sourceType: "creative_primary_decision",
          entityType: "creative",
          entityId: creative.creativeId,
          title: creative.name,
          recommendedAction: creative.primaryAction,
          confidence: clampConfidence(creative.confidence),
          priority: priorityFromCreative(creative),
          summary: creative.summary,
          decisionSignals: creative.decisionSignals,
          evidence: [
            {
              label: "Lifecycle",
              value: creative.lifecycleState.replaceAll("_", " "),
              impact: "neutral",
            },
            {
              label: "ROAS",
              value: `${creative.roas.toFixed(2)}x`,
              impact: creative.roas >= 2 ? "positive" : "negative",
            },
            {
              label: "Spend",
              value: `$${creative.spend.toFixed(0)}`,
              impact: "neutral",
            },
          ],
          guardrails: creative.deployment.constraints,
          relatedEntities: [
            {
              type: "family",
              id: creative.familyId,
              label: creative.familyLabel,
            },
            {
              type: "creative",
              id: creative.creativeId,
              label: creative.name,
            },
          ],
          tags: [
            ...creativeTags(creative),
            ...(watchlistOnly ? ["promo_mode_watchlist"] : []),
          ],
          watchlistOnly,
          sourceContext: {
            sourceLabel: "Creative Decision OS",
            operatingMode,
            sourceDeepLink: `/creatives?businessId=${encodeURIComponent(
              input.businessId,
            )}&startDate=${encodeURIComponent(input.startDate)}&endDate=${encodeURIComponent(
              input.endDate,
            )}&creative=${encodeURIComponent(creative.creativeId)}`,
            sourceDecisionId: creative.creativeId,
          },
        }),
      );
    });
  }

  const deduped = actions.map((action) => {
    const state = input.stateByFingerprint?.get(action.actionFingerprint);
    if (!state) return action;
    return {
      ...action,
      status: state.workflowStatus,
      assigneeUserId: state.assigneeUserId,
      assigneeName: state.assigneeName,
      snoozeUntil: state.snoozeUntil,
      latestNoteExcerpt: state.latestNoteExcerpt,
      noteCount: state.noteCount,
      lastMutatedAt: state.lastMutatedAt,
      lastMutationId: state.lastMutationId,
      createdAt: state.createdAt ?? action.createdAt,
    };
  });

  return deduped.sort(compareCommandCenterActions);
}

function metaNoTouchAction(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  operatingMode: string | null;
  item: MetaNoTouchItem;
  generatedAt: string;
}) {
  return {
    actionFingerprint: createActionFingerprint({
      sourceSystem: "meta",
      sourceType: "meta_no_touch_item",
      entityType: input.item.entityType,
      entityId: input.item.entityId,
      sourceDecisionId: input.item.entityId,
      recommendedAction: "hold_no_touch",
    }),
    sourceSystem: "meta",
    sourceType: "meta_no_touch_item",
    title: input.item.label,
    recommendedAction: "hold_no_touch",
    confidence: clampConfidence(input.item.confidence),
    priority: "low",
    summary: input.item.reason,
    decisionSignals: [input.item.reason],
    evidence: [],
    guardrails: input.item.guardrails,
    relatedEntities: [
      {
        type:
          input.item.entityType === "campaign"
            ? "campaign"
            : input.item.entityType === "adset"
              ? "adset"
              : "geo",
        id: input.item.entityId,
        label: input.item.label,
      },
    ],
    tags: ["promo_mode_watchlist"],
    watchlistOnly: true,
    status: "pending" as CommandCenterActionStatus,
    assigneeUserId: null,
    assigneeName: null,
    snoozeUntil: null,
    latestNoteExcerpt: null,
    noteCount: 0,
    lastMutatedAt: null,
    lastMutationId: null,
    createdAt: input.generatedAt,
    sourceContext: {
      sourceLabel: "Meta Decision OS",
      operatingMode: input.operatingMode,
      sourceDeepLink: `/platforms/meta?businessId=${encodeURIComponent(
        input.businessId,
      )}&startDate=${encodeURIComponent(input.startDate)}&endDate=${encodeURIComponent(
        input.endDate,
      )}`,
      sourceDecisionId: input.item.entityId,
    },
  } satisfies CommandCenterAction;
}

export function compareCommandCenterActions(
  left: CommandCenterAction,
  right: CommandCenterAction,
) {
  const statusWeight: Record<CommandCenterActionStatus, number> = {
    pending: 0,
    approved: 1,
    failed: 2,
    snoozed: 3,
    rejected: 4,
    canceled: 5,
    completed_manual: 6,
    executed: 7,
  };
  const priorityWeight: Record<CommandCenterPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const statusDelta = statusWeight[left.status] - statusWeight[right.status];
  if (statusDelta !== 0) return statusDelta;

  const watchlistDelta = Number(left.watchlistOnly) - Number(right.watchlistOnly);
  if (watchlistDelta !== 0) return watchlistDelta;

  const priorityDelta = priorityWeight[left.priority] - priorityWeight[right.priority];
  if (priorityDelta !== 0) return priorityDelta;

  if (left.confidence !== right.confidence) {
    return right.confidence - left.confidence;
  }

  return left.title.localeCompare(right.title);
}

export function canTransitionCommandCenterStatus(
  from: CommandCenterActionStatus,
  to: CommandCenterActionStatus,
) {
  return STATUS_TRANSITIONS[from].includes(to);
}

export function resolveNextCommandCenterStatus(input: {
  currentStatus: CommandCenterActionStatus;
  mutation: CommandCenterActionMutation;
}) {
  switch (input.mutation) {
    case "approve":
      return "approved" satisfies CommandCenterActionStatus;
    case "reject":
      return "rejected" satisfies CommandCenterActionStatus;
    case "snooze":
      return "snoozed" satisfies CommandCenterActionStatus;
    case "reopen":
      return "pending" satisfies CommandCenterActionStatus;
    case "complete_manual":
      return "completed_manual" satisfies CommandCenterActionStatus;
    case "cancel":
      return "canceled" satisfies CommandCenterActionStatus;
    case "fail":
      return "failed" satisfies CommandCenterActionStatus;
    case "assign":
      return input.currentStatus;
  }
}

export function summarizeCommandCenterActions(actions: CommandCenterAction[]) {
  return {
    totalActions: actions.length,
    pendingCount: actions.filter((action) => action.status === "pending").length,
    approvedCount: actions.filter((action) => action.status === "approved").length,
    rejectedCount: actions.filter((action) => action.status === "rejected").length,
    snoozedCount: actions.filter((action) => action.status === "snoozed").length,
    assignedCount: actions.filter((action) => Boolean(action.assigneeUserId)).length,
    watchlistCount: actions.filter((action) => action.watchlistOnly).length,
  };
}

export function filterCommandCenterActionsByView(
  actions: CommandCenterAction[],
  definition: CommandCenterSavedViewDefinition,
) {
  return actions.filter((action) => {
    if (
      definition.watchlistOnly != null &&
      action.watchlistOnly !== definition.watchlistOnly
    ) {
      return false;
    }
    if (
      definition.sourceTypes &&
      definition.sourceTypes.length > 0 &&
      !definition.sourceTypes.includes(action.sourceType)
    ) {
      return false;
    }
    if (
      definition.statuses &&
      definition.statuses.length > 0 &&
      !definition.statuses.includes(action.status)
    ) {
      return false;
    }
    if (
      definition.tags &&
      definition.tags.length > 0 &&
      !definition.tags.some((tag) => action.tags.includes(tag))
    ) {
      return false;
    }
    return true;
  });
}

export function getBuiltInCommandCenterSavedViews(
  businessId: string,
): CommandCenterSavedView[] {
  return COMMAND_CENTER_BUILT_IN_VIEWS.map((view) => ({
    id: `builtin:${view.viewKey}`,
    businessId,
    viewKey: view.viewKey,
    name: view.name,
    definition: view.definition,
    isBuiltIn: true,
    createdAt: null,
    updatedAt: null,
  }));
}

export function buildCommandCenterViewKey(name: string) {
  return `custom_${slugify(name)}`;
}

export function sanitizeCommandCenterSavedViewDefinition(
  definition: unknown,
): CommandCenterSavedViewDefinition {
  const candidate =
    definition && typeof definition === "object"
      ? (definition as Record<string, unknown>)
      : {};

  const sourceTypes = Array.isArray(candidate.sourceTypes)
    ? candidate.sourceTypes.filter((value): value is CommandCenterSourceType =>
        typeof value === "string" &&
        COMMAND_CENTER_SOURCE_TYPES.includes(value as CommandCenterSourceType),
      )
    : undefined;

  const statuses = Array.isArray(candidate.statuses)
    ? candidate.statuses.filter((value): value is CommandCenterActionStatus =>
        typeof value === "string" &&
        COMMAND_CENTER_ACTION_STATUSES.includes(
          value as CommandCenterActionStatus,
        ),
      )
    : undefined;

  const tags = Array.isArray(candidate.tags)
    ? candidate.tags.filter((value): value is string => typeof value === "string")
    : undefined;

  const watchlistOnly =
    typeof candidate.watchlistOnly === "boolean"
      ? candidate.watchlistOnly
      : undefined;

  return {
    ...(sourceTypes && sourceTypes.length > 0 ? { sourceTypes } : {}),
    ...(statuses && statuses.length > 0 ? { statuses } : {}),
    ...(tags && tags.length > 0 ? { tags } : {}),
    ...(watchlistOnly != null ? { watchlistOnly } : {}),
  };
}

export function buildCommandCenterJournalMessage(input: {
  mutation: CommandCenterActionMutation | "note";
  actionTitle: string;
  nextStatus?: CommandCenterActionStatus;
  assigneeName?: string | null;
  snoozeUntil?: string | null;
}) {
  switch (input.mutation) {
    case "approve":
      return `Approved ${input.actionTitle}.`;
    case "reject":
      return `Rejected ${input.actionTitle}.`;
    case "reopen":
      return `Reopened ${input.actionTitle}.`;
    case "complete_manual":
      return `Marked ${input.actionTitle} as completed manually.`;
    case "cancel":
      return `Canceled ${input.actionTitle}.`;
    case "fail":
      return `Marked ${input.actionTitle} as failed.`;
    case "assign":
      return input.assigneeName
        ? `Assigned ${input.actionTitle} to ${input.assigneeName}.`
        : `Cleared assignee for ${input.actionTitle}.`;
    case "snooze":
      return input.snoozeUntil
        ? `Snoozed ${input.actionTitle} until ${input.snoozeUntil}.`
        : `Snoozed ${input.actionTitle}.`;
    case "note":
      return `Added a note to ${input.actionTitle}.`;
  }
}

export function buildCommandCenterActionStateOverlay(
  action: CommandCenterAction,
  state: CommandCenterActionStateRecord | null | undefined,
) {
  if (!state) return action;
  return {
    ...action,
    status: state.workflowStatus,
    assigneeUserId: state.assigneeUserId,
    assigneeName: state.assigneeName,
    snoozeUntil: state.snoozeUntil,
    latestNoteExcerpt: state.latestNoteExcerpt,
    noteCount: state.noteCount,
    lastMutatedAt: state.lastMutatedAt,
    lastMutationId: state.lastMutationId,
    createdAt: state.createdAt,
  };
}

export function isAssignableCommandCenterRole(
  role: string,
): role is Extract<MembershipRole, "admin" | "collaborator"> {
  return role === "admin" || role === "collaborator";
}

export function buildCommandCenterFiltersFromViewKey(
  businessId: string,
  viewKey: string | null | undefined,
  savedViews: CommandCenterSavedView[],
) {
  if (!viewKey) return null;
  const selected =
    savedViews.find((view) => view.viewKey === viewKey) ??
    getBuiltInCommandCenterSavedViews(businessId).find(
      (view) => view.viewKey === viewKey,
    );
  return selected?.definition ?? null;
}

export function buildCommandCenterSourceLabels(input: {
  action: CommandCenterAction;
}) {
  return joinSignals([
    input.action.sourceContext.sourceLabel,
    input.action.sourceContext.operatingMode
      ? `Operating Mode: ${input.action.sourceContext.operatingMode}`
      : null,
  ]);
}
