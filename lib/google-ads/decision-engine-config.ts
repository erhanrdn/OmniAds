import type { GoogleAdvisorExecutionSurface } from "@/lib/google-ads/growth-advisor-types";

function readBooleanFlag(
  name:
    | "GOOGLE_ADS_DECISION_ENGINE_V2"
    | "GOOGLE_ADS_WRITEBACK_ENABLED"
    | "GOOGLE_ADS_ADVISOR_AI_STRUCTURED_ASSIST_ENABLED"
    | "GOOGLE_ADS_WRITEBACK_PILOT_ENABLED"
    | "GOOGLE_ADS_SEMI_AUTONOMOUS_BUNDLES_ENABLED"
    | "GOOGLE_ADS_CONTROLLED_AUTONOMY_ENABLED"
    | "GOOGLE_ADS_AUTONOMY_KILL_SWITCH"
    | "GOOGLE_ADS_MANUAL_APPROVAL_REQUIRED"
    | "GOOGLE_ADS_AUTONOMY_OPERATOR_OVERRIDE_ENABLED",
  fallback: boolean,
  env: NodeJS.ProcessEnv = process.env
) {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return fallback;
}

export function getGoogleAdsDecisionEngineConfig(env: NodeJS.ProcessEnv = process.env) {
  const decisionEngineV2Enabled = readBooleanFlag("GOOGLE_ADS_DECISION_ENGINE_V2", true, env);
  const writebackEnabled = readBooleanFlag("GOOGLE_ADS_WRITEBACK_ENABLED", false, env);
  const advisorAiStructuredAssistEnabled = readBooleanFlag(
    "GOOGLE_ADS_ADVISOR_AI_STRUCTURED_ASSIST_ENABLED",
    false,
    env
  );
  return {
    decisionEngineV2Enabled,
    writebackEnabled,
    advisorAiStructuredAssistEnabled,
  };
}

function readAllowlist(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.GOOGLE_ADS_AUTONOMY_ALLOWLIST?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readScopedAllowlist(
  raw: string | undefined,
) {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readIntegerFlag(raw: string | undefined, fallback: number) {
  if (!raw?.trim()) return fallback;
  const parsed = Number(raw ?? "");
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export function getGoogleAdsAutomationConfig(env: NodeJS.ProcessEnv = process.env) {
  const base = getGoogleAdsDecisionEngineConfig(env);
  const writebackPilotEnabled = readBooleanFlag("GOOGLE_ADS_WRITEBACK_PILOT_ENABLED", false, env);
  const semiAutonomousBundlesEnabled = readBooleanFlag(
    "GOOGLE_ADS_SEMI_AUTONOMOUS_BUNDLES_ENABLED",
    false,
    env
  );
  const controlledAutonomyEnabled = readBooleanFlag(
    "GOOGLE_ADS_CONTROLLED_AUTONOMY_ENABLED",
    false,
    env
  );
  const autonomyKillSwitchActive = readBooleanFlag(
    "GOOGLE_ADS_AUTONOMY_KILL_SWITCH",
    true,
    env
  );
  const manualApprovalRequired = readBooleanFlag(
    "GOOGLE_ADS_MANUAL_APPROVAL_REQUIRED",
    true,
    env
  );
  const operatorOverrideEnabled = readBooleanFlag(
    "GOOGLE_ADS_AUTONOMY_OPERATOR_OVERRIDE_ENABLED",
    true,
    env
  );
  const actionAllowlist = readAllowlist(env);
  const businessAllowlist = readScopedAllowlist(env.GOOGLE_ADS_AUTONOMY_BUSINESS_ALLOWLIST);
  const accountAllowlist = readScopedAllowlist(env.GOOGLE_ADS_AUTONOMY_ACCOUNT_ALLOWLIST);
  const bundleCooldownHours = readIntegerFlag(env.GOOGLE_ADS_BUNDLE_COOLDOWN_HOURS, 24);

  return {
    ...base,
    writebackPilotEnabled,
    semiAutonomousBundlesEnabled,
    controlledAutonomyEnabled,
    autonomyKillSwitchActive,
    manualApprovalRequired,
    operatorOverrideEnabled,
    actionAllowlist,
    businessAllowlist,
    accountAllowlist,
    bundleCooldownHours,
  };
}

function isScopedAllowed(allowlist: string[], value: string | null | undefined) {
  if (allowlist.length === 0) return true;
  if (!value) return false;
  return allowlist.includes(value);
}

export function getGoogleAdsAutonomyBoundaryState(input: {
  businessId?: string | null;
  accountId?: string | null;
  env?: NodeJS.ProcessEnv;
}) {
  const config = getGoogleAdsAutomationConfig(input.env);
  const businessAllowed = isScopedAllowed(config.businessAllowlist, input.businessId ?? null);
  const accountAllowed = isScopedAllowed(config.accountAllowlist, input.accountId ?? null);
  const blockedReasons: string[] = [];

  if (config.autonomyKillSwitchActive) {
    blockedReasons.push("Autonomy kill switch is active.");
  }
  if (!businessAllowed) {
    blockedReasons.push("Business is not in the autonomy allowlist.");
  }
  if (!accountAllowed) {
    blockedReasons.push("Account is not in the autonomy allowlist.");
  }
  if (config.manualApprovalRequired) {
    blockedReasons.push("Manual approval is still required.");
  }
  if (config.actionAllowlist.length === 0) {
    blockedReasons.push("No Google Ads action families are allowlisted for autonomous execution.");
  }

  const semiAutonomousEligible =
    config.semiAutonomousBundlesEnabled &&
    !config.autonomyKillSwitchActive &&
    businessAllowed &&
    accountAllowed;
  const controlledAutonomyEligible =
    config.controlledAutonomyEnabled &&
    !config.autonomyKillSwitchActive &&
    !config.manualApprovalRequired &&
    businessAllowed &&
    accountAllowed &&
    config.actionAllowlist.length > 0;

  return {
    ...config,
    businessAllowed,
    accountAllowed,
    semiAutonomousEligible,
    controlledAutonomyEligible,
    blockedReasons,
  };
}

export function getGoogleAdsWritebackCapabilityGate(env: NodeJS.ProcessEnv = process.env) {
  const { decisionEngineV2Enabled, writebackEnabled } = getGoogleAdsDecisionEngineConfig(env);
  const enabled = decisionEngineV2Enabled && writebackEnabled;
  const reason = enabled
    ? "Google Ads write-back is explicitly enabled."
    : !decisionEngineV2Enabled
      ? "Google Ads Decision Engine V2 is disabled."
      : "Google Ads write-back is disabled. Adsecute V1 remains operator-first until write-back is verified.";

  return {
    enabled,
    mutateEnabled: enabled,
    rollbackEnabled: enabled,
    clusterExecutionEnabled: enabled,
    reason,
  };
}

export function buildGoogleAdsExecutionSurface(env: NodeJS.ProcessEnv = process.env): GoogleAdvisorExecutionSurface {
  const { decisionEngineV2Enabled, writebackEnabled } = getGoogleAdsDecisionEngineConfig(env);
  const gate = getGoogleAdsWritebackCapabilityGate(env);
  return {
    mode: "operator_first_manual_plan",
    decisionEngineV2Enabled,
    writebackEnabled,
    mutateVerified: false,
    rollbackVerified: false,
    capabilityGateReason: gate.reason,
    summary:
      decisionEngineV2Enabled && writebackEnabled
        ? "Decision Engine V2 is enabled. Write-back is explicitly gated on, but it is not marked verified and should remain operator-supervised."
        : "Adsecute V1 is operator-first. Recommendations are manual plans; write-back remains disabled until it is explicitly verified.",
  };
}

export function isGoogleAdsDecisionEngineV2Enabled(env: NodeJS.ProcessEnv = process.env) {
  return getGoogleAdsDecisionEngineConfig(env).decisionEngineV2Enabled;
}

export function isGoogleAdsAdvisorAiStructuredAssistEnabled(env: NodeJS.ProcessEnv = process.env) {
  return getGoogleAdsDecisionEngineConfig(env).advisorAiStructuredAssistEnabled;
}
