import type { CommandCenterAction, CommandCenterSourceType } from "@/lib/command-center";
import type {
  CommandCenterExecutionApplyGatePosture,
  CommandCenterExecutionSupportMatrix,
  CommandCenterExecutionSupportMatrixEntry,
} from "@/lib/command-center-execution";
import { META_AD_SET_ACTION_TYPES, META_GEO_ACTION_TYPES } from "@/lib/meta/decision-os";
import type { CreativeDecisionPrimaryAction } from "@/lib/creative-decision-os";

const CREATIVE_PRIMARY_ACTIONS = [
  "promote_to_scaling",
  "keep_in_test",
  "hold_no_touch",
  "refresh_replace",
  "block_deploy",
  "retest_comeback",
] as const satisfies ReadonlyArray<CreativeDecisionPrimaryAction>;

const META_PLACEMENT_ACTIONS = [
  "keep_advantage_plus",
  "exception_review",
] as const;

const META_NO_TOUCH_ACTIONS = ["hold_no_touch"] as const;
const META_BUDGET_SHIFT_ACTIONS = ["budget_shift"] as const;

const ALLOWLIST_APPLY_NOTE =
  "Provider-backed apply is available only when the apply gate is enabled and the business is in the Meta execution canary allowlist.";
const DISABLED_APPLY_NOTE =
  "Provider-backed apply is disabled for this family.";
const NOT_APPLICABLE_APPLY_NOTE =
  "No provider-backed apply path exists for this family in V2-07.";
const PROVIDER_ROLLBACK_NOTE =
  "Rollback restores the captured pre-apply ad set status and daily budget snapshot after a successful provider-backed apply.";
const NOT_AVAILABLE_ROLLBACK_NOTE =
  "No provider-backed rollback exists for this family.";

function formatFamilyLabel(sourceType: CommandCenterSourceType, recommendedAction: string | null) {
  const sourceLabel =
    sourceType === "meta_adset_decision"
      ? "Meta ad set"
      : sourceType === "meta_budget_shift"
        ? "Meta budget shift"
        : sourceType === "meta_geo_decision"
          ? "Meta GEO"
          : sourceType === "meta_placement_anomaly"
            ? "Meta placement"
            : sourceType === "meta_no_touch_item"
              ? "Meta no-touch"
              : "Creative";
  const actionLabel =
    recommendedAction && recommendedAction.trim().length > 0
      ? recommendedAction.replaceAll("_", " ")
      : "family";
  return `${sourceLabel}: ${actionLabel}`;
}

function buildEntry(input: {
  sourceSystem: CommandCenterExecutionSupportMatrixEntry["sourceSystem"];
  sourceType: CommandCenterSourceType;
  recommendedAction: string | null;
  supportMode: CommandCenterExecutionSupportMatrixEntry["supportMode"];
  applyGatePosture: CommandCenterExecutionApplyGatePosture;
  supportReason: string;
  operatorGuidance: string[];
  rollbackKind?: CommandCenterExecutionSupportMatrixEntry["rollback"]["kind"];
  rollbackNote?: string | null;
}) {
  const applyGateNote =
    input.applyGatePosture === "allowlist_only"
      ? ALLOWLIST_APPLY_NOTE
      : input.applyGatePosture === "disabled"
        ? DISABLED_APPLY_NOTE
        : input.applyGatePosture === "enabled"
          ? "Provider-backed apply is available for this family."
          : NOT_APPLICABLE_APPLY_NOTE;

  return {
    familyKey: `${input.sourceType}:${input.recommendedAction ?? "family"}`,
    label: formatFamilyLabel(input.sourceType, input.recommendedAction),
    sourceSystem: input.sourceSystem,
    sourceType: input.sourceType,
    recommendedAction: input.recommendedAction,
    supportMode: input.supportMode,
    applyGate: {
      posture: input.applyGatePosture,
      note: applyGateNote,
    },
    rollback: {
      kind: input.rollbackKind ?? "not_available",
      note: input.rollbackNote ?? NOT_AVAILABLE_ROLLBACK_NOTE,
    },
    supportReason: input.supportReason,
    operatorGuidance: input.operatorGuidance,
  } satisfies CommandCenterExecutionSupportMatrixEntry;
}

const META_ADSET_SUPPORT_ENTRIES = META_AD_SET_ACTION_TYPES.map((actionType) =>
  buildEntry({
    sourceSystem: "meta",
    sourceType: "meta_adset_decision",
    recommendedAction: actionType,
    supportMode:
      actionType === "pause" ||
      actionType === "recover" ||
      actionType === "scale_budget" ||
      actionType === "reduce_budget"
        ? "supported"
        : "manual_only",
    applyGatePosture:
      actionType === "pause" ||
      actionType === "recover" ||
      actionType === "scale_budget" ||
      actionType === "reduce_budget"
        ? "allowlist_only"
        : "not_applicable",
    rollbackKind:
      actionType === "pause" ||
      actionType === "recover" ||
      actionType === "scale_budget" ||
      actionType === "reduce_budget"
        ? "provider_rollback"
        : "not_available",
    rollbackNote:
      actionType === "pause" ||
      actionType === "recover" ||
      actionType === "scale_budget" ||
      actionType === "reduce_budget"
        ? PROVIDER_ROLLBACK_NOTE
        : NOT_AVAILABLE_ROLLBACK_NOTE,
    supportReason:
      actionType === "pause" ||
      actionType === "recover" ||
      actionType === "scale_budget" ||
      actionType === "reduce_budget"
        ? "Exact-target Meta ad set write-back exists for this action when the live ad set stays inside the safe daily-budget subset."
        : "This Meta ad set action still requires manual execution because V2-07 only verifies provider-backed apply for pause, recover, scale budget, and reduce budget.",
    operatorGuidance:
      actionType === "pause" ||
      actionType === "recover" ||
      actionType === "scale_budget" ||
      actionType === "reduce_budget"
        ? [
            "Review the preview diff and guardrails before apply.",
            "Use canary-gated apply only after workflow approval.",
          ]
        : [
            "Review the exact change in Meta Ads Manager.",
            "Complete the action manually and record the operator outcome if executed.",
          ],
  }),
);

const META_BUDGET_SHIFT_SUPPORT_ENTRIES = META_BUDGET_SHIFT_ACTIONS.map((actionType) =>
  buildEntry({
    sourceSystem: "meta",
    sourceType: "meta_budget_shift",
    recommendedAction: actionType,
    supportMode: "manual_only",
    applyGatePosture: "not_applicable",
    supportReason:
      "Budget-shift recommendations stay manual-only because the decision layer does not ship exact provider-side donor and receiver mutation targets.",
    operatorGuidance: [
      "Inspect donor and receiver campaigns in Meta Ads Manager.",
      "Apply the transfer manually and preserve the documented guardrails.",
    ],
  }),
);

const META_GEO_SUPPORT_ENTRIES = META_GEO_ACTION_TYPES.map((actionType) =>
  buildEntry({
    sourceSystem: "meta",
    sourceType: "meta_geo_decision",
    recommendedAction: actionType,
    supportMode: "unsupported",
    applyGatePosture: "not_applicable",
    supportReason:
      "GEO actions remain read-only in V2-07; no provider-backed execution path is verified for pooled, isolated, or country-level routing actions.",
    operatorGuidance: [
      "Use the GEO board as decision support only.",
      "Execute any country or cluster changes manually in Meta Ads Manager.",
    ],
  }),
);

const META_PLACEMENT_SUPPORT_ENTRIES = META_PLACEMENT_ACTIONS.map((actionType) =>
  buildEntry({
    sourceSystem: "meta",
    sourceType: "meta_placement_anomaly",
    recommendedAction: actionType,
    supportMode: "unsupported",
    applyGatePosture: "not_applicable",
    supportReason:
      "Placement anomaly actions remain unsupported because no exact provider-backed placement mutate path is verified in this release.",
    operatorGuidance: [
      "Review the placement anomaly directly in Meta Ads Manager.",
      "Treat this card as operator guidance only.",
    ],
  }),
);

const META_NO_TOUCH_SUPPORT_ENTRIES = META_NO_TOUCH_ACTIONS.map((actionType) =>
  buildEntry({
    sourceSystem: "meta",
    sourceType: "meta_no_touch_item",
    recommendedAction: actionType,
    supportMode: "unsupported",
    applyGatePosture: "not_applicable",
    supportReason:
      "No-touch items intentionally remain outside the execution subset. They are protective guidance, not write-back commands.",
    operatorGuidance: [
      "Leave the stable winner untouched unless a separate verified workflow overrides it.",
    ],
  }),
);

const CREATIVE_SUPPORT_ENTRIES = CREATIVE_PRIMARY_ACTIONS.map((actionType) =>
  buildEntry({
    sourceSystem: "creative",
    sourceType: "creative_primary_decision",
    recommendedAction: actionType,
    supportMode: "unsupported",
    applyGatePosture: "not_applicable",
    supportReason:
      "Creative Decision OS actions remain outside the provider-backed execution subset. Creative workflow decisions still require human deployment and review.",
    operatorGuidance: [
      "Use the creative decision as planning guidance.",
      "Apply deployment, refresh, or block decisions through the existing manual creative workflow.",
    ],
  }),
);

export const COMMAND_CENTER_EXECUTION_SUPPORT_MATRIX = [
  ...META_ADSET_SUPPORT_ENTRIES,
  ...META_BUDGET_SHIFT_SUPPORT_ENTRIES,
  ...META_GEO_SUPPORT_ENTRIES,
  ...META_PLACEMENT_SUPPORT_ENTRIES,
  ...META_NO_TOUCH_SUPPORT_ENTRIES,
  ...CREATIVE_SUPPORT_ENTRIES,
] as const satisfies ReadonlyArray<CommandCenterExecutionSupportMatrixEntry>;

function matchesEntry(
  entry: CommandCenterExecutionSupportMatrixEntry,
  action: Pick<CommandCenterAction, "sourceSystem" | "sourceType" | "recommendedAction">,
) {
  return (
    entry.sourceSystem === action.sourceSystem &&
    entry.sourceType === action.sourceType &&
    entry.recommendedAction === action.recommendedAction
  );
}

export function resolveCommandCenterExecutionSupportEntry(
  action: Pick<CommandCenterAction, "sourceSystem" | "sourceType" | "recommendedAction">,
) {
  const exactMatch = COMMAND_CENTER_EXECUTION_SUPPORT_MATRIX.find((entry) =>
    matchesEntry(entry, action),
  );
  if (exactMatch) return exactMatch;

  const familyMatch = COMMAND_CENTER_EXECUTION_SUPPORT_MATRIX.find(
    (entry) =>
      entry.sourceSystem === action.sourceSystem &&
      entry.sourceType === action.sourceType &&
      entry.recommendedAction == null,
  );
  if (familyMatch) return familyMatch;

  return buildEntry({
    sourceSystem: action.sourceSystem,
    sourceType: action.sourceType,
    recommendedAction: action.recommendedAction,
    supportMode: "unsupported",
    applyGatePosture: "not_applicable",
    supportReason:
      "This action family is not mapped into the V2-07 execution support matrix and must remain read-only until reviewed.",
    operatorGuidance: [
      "Treat this action as unsupported.",
      "Do not issue provider-side writes from the execution panel.",
    ],
  });
}

export function buildCommandCenterExecutionSupportMatrix(
  action: Pick<CommandCenterAction, "sourceSystem" | "sourceType" | "recommendedAction">,
): CommandCenterExecutionSupportMatrix {
  return {
    selectedEntry: resolveCommandCenterExecutionSupportEntry(action),
    entries: [...COMMAND_CENTER_EXECUTION_SUPPORT_MATRIX],
  };
}
