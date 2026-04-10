import { describe, expect, it } from "vitest";
import {
  buildGoogleAdsExecutionSurface,
  getGoogleAdsAutomationConfig,
  getGoogleAdsDecisionEngineConfig,
  getGoogleAdsWritebackCapabilityGate,
} from "@/lib/google-ads/decision-engine-config";

function env(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    ...overrides,
  };
}

describe("Google Ads decision engine config", () => {
  it("defaults to Decision Engine V2 enabled and write-back disabled", () => {
    const config = getGoogleAdsDecisionEngineConfig(env());

    expect(config).toEqual({
      decisionEngineV2Enabled: true,
      writebackEnabled: false,
    });
  });

  it("builds an explicit write-back capability gate from env flags", () => {
    expect(
      getGoogleAdsWritebackCapabilityGate(env({
        GOOGLE_ADS_DECISION_ENGINE_V2: "true",
        GOOGLE_ADS_WRITEBACK_ENABLED: "false",
      }))
    ).toMatchObject({
      enabled: false,
      mutateEnabled: false,
      rollbackEnabled: false,
      clusterExecutionEnabled: false,
    });

    expect(
      getGoogleAdsWritebackCapabilityGate(env({
        GOOGLE_ADS_DECISION_ENGINE_V2: "true",
        GOOGLE_ADS_WRITEBACK_ENABLED: "true",
      }))
    ).toMatchObject({
      enabled: true,
      mutateEnabled: true,
      rollbackEnabled: true,
      clusterExecutionEnabled: true,
    });
  });

  it("keeps the execution surface operator-first even when write-back is gated on", () => {
    expect(buildGoogleAdsExecutionSurface(env())).toMatchObject({
      mode: "operator_first_manual_plan",
      decisionEngineV2Enabled: true,
      writebackEnabled: false,
      mutateVerified: false,
      rollbackVerified: false,
    });

    expect(
      buildGoogleAdsExecutionSurface({
        NODE_ENV: "test",
        GOOGLE_ADS_DECISION_ENGINE_V2: "true",
        GOOGLE_ADS_WRITEBACK_ENABLED: "true",
      })
    ).toMatchObject({
      mode: "operator_first_manual_plan",
      decisionEngineV2Enabled: true,
      writebackEnabled: true,
      mutateVerified: false,
      rollbackVerified: false,
    });
  });

  it("keeps automation foundations disabled by default behind an active kill switch", () => {
    expect(getGoogleAdsAutomationConfig(env())).toMatchObject({
      writebackPilotEnabled: false,
      semiAutonomousBundlesEnabled: false,
      controlledAutonomyEnabled: false,
      autonomyKillSwitchActive: true,
      manualApprovalRequired: true,
      actionAllowlist: [],
    });

    expect(
      getGoogleAdsAutomationConfig(
        env({
          GOOGLE_ADS_WRITEBACK_PILOT_ENABLED: "true",
          GOOGLE_ADS_SEMI_AUTONOMOUS_BUNDLES_ENABLED: "true",
          GOOGLE_ADS_CONTROLLED_AUTONOMY_ENABLED: "true",
          GOOGLE_ADS_AUTONOMY_KILL_SWITCH: "false",
          GOOGLE_ADS_MANUAL_APPROVAL_REQUIRED: "true",
          GOOGLE_ADS_AUTONOMY_ALLOWLIST: "add_negative_keyword,pause_asset",
        })
      )
    ).toMatchObject({
      writebackPilotEnabled: true,
      semiAutonomousBundlesEnabled: true,
      controlledAutonomyEnabled: true,
      autonomyKillSwitchActive: false,
      manualApprovalRequired: true,
      actionAllowlist: ["add_negative_keyword", "pause_asset"],
    });
  });
});
