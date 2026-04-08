import { describe, expect, it } from "vitest";
import {
  buildGoogleAdsExecutionSurface,
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
});
