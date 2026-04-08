import type { GoogleAdvisorExecutionSurface } from "@/lib/google-ads/growth-advisor-types";

function readBooleanFlag(
  name: "GOOGLE_ADS_DECISION_ENGINE_V2" | "GOOGLE_ADS_WRITEBACK_ENABLED",
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
  return {
    decisionEngineV2Enabled,
    writebackEnabled,
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
