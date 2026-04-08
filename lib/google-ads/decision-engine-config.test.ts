import { describe, expect, it } from "vitest";
import {
  buildGoogleAdsExecutionSurface,
  getGoogleAdsDecisionEngineConfig,
  getGoogleAdsWritebackCapabilityGate,
} from "@/lib/google-ads/decision-engine-config";

describe("Google Ads decision engine config", () => {
  it("defaults to Decision Engine V2 enabled and write-back disabled", () => {
    const config = getGoogleAdsDecisionEngineConfig({});

    expect(config).toEqual({
      decisionEngineV2Enabled: true,
      writebackEnabled: false,
    });
  });

  it("builds an explicit write-back capability gate from env flags", () => {
    expect(
      getGoogleAdsWritebackCapabilityGate({
        GOOGLE_ADS_DECISION_ENGINE_V2: "true",
        GOOGLE_ADS_WRITEBACK_ENABLED: "false",
      } as NodeJS.ProcessEnv)
    ).toMatchObject({
      enabled: false,
      mutateEnabled: false,
      rollbackEnabled: false,
      clusterExecutionEnabled: false,
    });

    expect(
      getGoogleAdsWritebackCapabilityGate({
        GOOGLE_ADS_DECISION_ENGINE_V2: "true",
        GOOGLE_ADS_WRITEBACK_ENABLED: "true",
      } as NodeJS.ProcessEnv)
    ).toMatchObject({
      enabled: true,
      mutateEnabled: true,
      rollbackEnabled: true,
      clusterExecutionEnabled: true,
    });
  });

  it("keeps the execution surface operator-first even when write-back is gated on", () => {
    expect(buildGoogleAdsExecutionSurface({} as NodeJS.ProcessEnv)).toMatchObject({
      mode: "operator_first_manual_plan",
      decisionEngineV2Enabled: true,
      writebackEnabled: false,
      mutateVerified: false,
      rollbackVerified: false,
    });

    expect(
      buildGoogleAdsExecutionSurface({
        GOOGLE_ADS_DECISION_ENGINE_V2: "true",
        GOOGLE_ADS_WRITEBACK_ENABLED: "true",
      } as NodeJS.ProcessEnv)
    ).toMatchObject({
      mode: "operator_first_manual_plan",
      decisionEngineV2Enabled: true,
      writebackEnabled: true,
      mutateVerified: false,
      rollbackVerified: false,
    });
  });
});
