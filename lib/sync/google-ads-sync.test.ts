import { describe, expect, it } from "vitest";
import {
  buildGoogleAdsLaneAdmissionPolicy,
  buildGoogleAdsWarehouseFetchPlan,
} from "@/lib/sync/google-ads-sync";

describe("buildGoogleAdsLaneAdmissionPolicy", () => {
  it("suspends extended lanes when safe mode is enabled", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: true,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: false,
      queueDepth: 0,
      extendedQueueDepth: 0,
    });

    expect(policy.lanePolicy.core).toBe("admit");
    expect(policy.lanePolicy.maintenance).toBe("admit");
    expect(policy.lanePolicy.extended).toBe("suspended");
    expect(policy.suspendExtended).toBe(true);
  });

  it("suspends extended lanes when the global breaker is open", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: true,
      queueDepth: 10,
      extendedQueueDepth: 10,
    });

    expect(policy.lanePolicy.extended).toBe("suspended");
    expect(policy.suspendExtended).toBe(true);
  });

  it("suspends extended lanes when worker health is missing", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: false,
      workerCapacityAvailable: false,
      breakerOpen: false,
      queueDepth: 5,
      extendedQueueDepth: 2,
    });

    expect(policy.lanePolicy.extended).toBe("suspended");
    expect(policy.lanePolicy.core).toBe("admit");
  });

  it("suspends extended lanes when backlog exceeds the hard limit", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: false,
      queueDepth: 3000,
      extendedQueueDepth: 1500,
    });

    expect(policy.lanePolicy.extended).toBe("suspended");
  });

  it("keeps extended suspended when canary reopen is not allowed", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: false,
      queueDepth: 0,
      extendedQueueDepth: 0,
      extendedBudgetAllowed: true,
      extendedCanaryEligible: false,
    });

    expect(policy.lanePolicy.extended).toBe("suspended");
  });

  it("allows only recent extended recovery while breaker is half-open", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: false,
      queueDepth: 0,
      extendedQueueDepth: 0,
      extendedBudgetAllowed: true,
      extendedCanaryEligible: true,
      recoveryMode: "half_open",
      quotaPressure: 0.2,
    });

    expect(policy.lanePolicy.extendedRecent).toBe("admit");
    expect(policy.lanePolicy.extendedHistorical).toBe("suspended");
    expect(policy.executionMode).toBe("extended_recovery");
  });

  it("admits historical extended replay only after recovery closes", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: false,
      queueDepth: 0,
      extendedQueueDepth: 0,
      extendedBudgetAllowed: true,
      extendedCanaryEligible: true,
      recoveryMode: "closed",
      quotaPressure: 0.2,
    });

    expect(policy.lanePolicy.extendedRecent).toBe("admit");
    expect(policy.lanePolicy.extendedHistorical).toBe("admit");
    expect(policy.executionMode).toBe("extended_normal");
  });

  it("suspends maintenance when quota budget is exhausted", () => {
    const policy = buildGoogleAdsLaneAdmissionPolicy({
      safeModeEnabled: false,
      workerHealthy: true,
      workerCapacityAvailable: true,
      breakerOpen: false,
      queueDepth: 0,
      extendedQueueDepth: 0,
      quotaPressure: 1.05,
      maintenanceBudgetAllowed: false,
      extendedBudgetAllowed: false,
      extendedCanaryEligible: true,
    });

    expect(policy.lanePolicy.core).toBe("admit");
    expect(policy.lanePolicy.maintenance).toBe("suspended");
  });
});

describe("buildGoogleAdsWarehouseFetchPlan", () => {
  it("does not require campaign fetches for search-term-only partitions", () => {
    const plan = buildGoogleAdsWarehouseFetchPlan(["search_term_daily"]);

    expect(plan.searchIntelligence).toBe(true);
    expect(plan.campaigns).toBe(false);
    expect(plan.products).toBe(false);
    expect(plan.assets).toBe(false);
  });

  it("keeps product and asset partitions isolated to their own report families", () => {
    const productPlan = buildGoogleAdsWarehouseFetchPlan(["product_daily"]);
    const assetPlan = buildGoogleAdsWarehouseFetchPlan(["asset_daily"]);

    expect(productPlan.products).toBe(true);
    expect(productPlan.campaigns).toBe(false);
    expect(productPlan.assets).toBe(false);
    expect(assetPlan.assets).toBe(true);
    expect(assetPlan.campaigns).toBe(false);
    expect(assetPlan.products).toBe(false);
  });
});
