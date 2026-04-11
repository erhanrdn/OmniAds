import {
  getCommandCenterCanaryBusinesses,
  isCommandCenterV1Enabled,
} from "@/lib/command-center-config";
import {
  getMetaExecutionCanaryBusinesses,
  isCommandCenterExecutionV1Enabled,
  isMetaExecutionApplyEnabled,
} from "@/lib/command-center-execution-config";
import {
  getCreativeDecisionOsCanaryBusinesses,
  isCreativeDecisionOsV1Enabled,
} from "@/lib/creative-decision-os-config";
import {
  getMetaDecisionOsCanaryBusinesses,
  isMetaDecisionOsV1Enabled,
} from "@/lib/meta/decision-os-config";
import type { ReleaseAuthorityFlagPosture } from "@/lib/release-authority/types";

function summarizeFlagPosture(input: {
  enabled: boolean;
  canaryCount: number;
  flagKeys: string[];
  enabledSummary: string;
  allowlistSummary: string;
  disabledSummary: string;
}): ReleaseAuthorityFlagPosture {
  if (!input.enabled) {
    return {
      mode: "disabled",
      flagKeys: input.flagKeys,
      summary: input.disabledSummary,
    };
  }
  if (input.canaryCount > 0) {
    return {
      mode: "allowlist",
      flagKeys: input.flagKeys,
      summary: input.allowlistSummary,
    };
  }
  return {
    mode: "enabled",
    flagKeys: input.flagKeys,
    summary: input.enabledSummary,
  };
}

export const RELEASE_AUTHORITY_PREVIOUS_KNOWN_GOOD_SHA =
  process.env.RELEASE_AUTHORITY_PREVIOUS_KNOWN_GOOD_SHA?.trim() ||
  "3c13c44772ee510c67cfabc6b77ab05dae33b039";

export const RELEASE_AUTHORITY_PREVIOUS_KNOWN_GOOD_SOURCE =
  process.env.RELEASE_AUTHORITY_PREVIOUS_KNOWN_GOOD_SOURCE?.trim() ||
  "docs/meta-rollout-record-2026-04-07.md";

export const RELEASE_AUTHORITY_CANONICAL_DOC =
  "docs/v2-01-release-authority.md";

export function resolveMetaDecisionOsFlagPosture() {
  return summarizeFlagPosture({
    enabled: isMetaDecisionOsV1Enabled(),
    canaryCount: getMetaDecisionOsCanaryBusinesses().length,
    flagKeys: ["META_DECISION_OS_V1", "META_DECISION_OS_CANARY_BUSINESSES"],
    enabledSummary: "Meta Decision OS is globally enabled.",
    allowlistSummary:
      "Meta Decision OS is enabled through a business allowlist.",
    disabledSummary: "Meta Decision OS is disabled.",
  });
}

export function resolveCreativeDecisionOsFlagPosture() {
  return summarizeFlagPosture({
    enabled: isCreativeDecisionOsV1Enabled(),
    canaryCount: getCreativeDecisionOsCanaryBusinesses().length,
    flagKeys: [
      "CREATIVE_DECISION_OS_V1",
      "CREATIVE_DECISION_OS_CANARY_BUSINESSES",
    ],
    enabledSummary: "Creative Decision OS is globally enabled.",
    allowlistSummary:
      "Creative Decision OS is enabled through a business allowlist.",
    disabledSummary: "Creative Decision OS is disabled.",
  });
}

export function resolveCommandCenterWorkflowFlagPosture() {
  return summarizeFlagPosture({
    enabled: isCommandCenterV1Enabled(),
    canaryCount: getCommandCenterCanaryBusinesses().length,
    flagKeys: ["COMMAND_CENTER_V1", "COMMAND_CENTER_CANARY_BUSINESSES"],
    enabledSummary: "Command Center workflow is globally enabled.",
    allowlistSummary:
      "Command Center workflow is enabled through a business allowlist.",
    disabledSummary: "Command Center workflow is disabled.",
  });
}

export function resolveCommandCenterExecutionPreviewFlagPosture() {
  return summarizeFlagPosture({
    enabled: isCommandCenterExecutionV1Enabled(),
    canaryCount: 0,
    flagKeys: ["COMMAND_CENTER_EXECUTION_V1"],
    enabledSummary: "Execution preview is enabled.",
    allowlistSummary: "Execution preview does not use an allowlist gate.",
    disabledSummary: "Execution preview is disabled.",
  });
}

export function resolveCommandCenterExecutionApplyFlagPosture() {
  const executionEnabled = isCommandCenterExecutionV1Enabled();
  const applyEnabled = isMetaExecutionApplyEnabled();
  const canaryCount = getMetaExecutionCanaryBusinesses().length;

  if (!executionEnabled || !applyEnabled) {
    return {
      mode: "disabled",
      flagKeys: [
        "COMMAND_CENTER_EXECUTION_V1",
        "META_EXECUTION_APPLY_ENABLED",
        "META_EXECUTION_CANARY_BUSINESSES",
      ],
      summary:
        "Apply and rollback remain disabled until the explicit Meta apply gate is enabled.",
    } satisfies ReleaseAuthorityFlagPosture;
  }

  if (canaryCount === 0) {
    return {
      mode: "disabled",
      flagKeys: [
        "COMMAND_CENTER_EXECUTION_V1",
        "META_EXECUTION_APPLY_ENABLED",
        "META_EXECUTION_CANARY_BUSINESSES",
      ],
      summary:
        "Apply and rollback remain disabled until a Meta execution canary allowlist is configured.",
    } satisfies ReleaseAuthorityFlagPosture;
  }

  return {
    mode: "allowlist",
    flagKeys: [
      "COMMAND_CENTER_EXECUTION_V1",
      "META_EXECUTION_APPLY_ENABLED",
      "META_EXECUTION_CANARY_BUSINESSES",
    ],
    summary:
      "Apply and rollback are available only through the Meta execution canary allowlist.",
  } satisfies ReleaseAuthorityFlagPosture;
}
