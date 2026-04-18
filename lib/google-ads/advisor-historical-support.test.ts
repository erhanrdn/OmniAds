import { describe, expect, it } from "vitest";

import {
  buildGoogleAdsAdvisorCampaignSupportFromDailyRows,
  buildGoogleAdsAdvisorProductSupportFromDailyRows,
} from "@/lib/google-ads/advisor-historical-support";

describe("google ads advisor historical support", () => {
  it("builds family metrics from raw campaign daily rows", () => {
    const support = buildGoogleAdsAdvisorCampaignSupportFromDailyRows([
      {
        campaignName: "Brand Search Core",
        channel: "search",
        spend: 40,
        revenue: 160,
        conversions: 8,
        clicks: 20,
        impressions: 200,
      } as any,
      {
        campaignName: "PMax Scale",
        channel: "performance_max",
        spend: 60,
        revenue: 180,
        conversions: 9,
        clicks: 25,
        impressions: 250,
      } as any,
    ]);

    expect(support.familiesPresent.sort()).toEqual(["brand_search", "pmax_scaling"]);
    expect(support.totalMetrics).toEqual(
      expect.objectContaining({
        spend: 100,
        revenue: 340,
        conversions: 17,
        clicks: 45,
        impressions: 450,
      }),
    );
    expect(support.familyMetricsByFamily.brand_search).toEqual(
      expect.objectContaining({
        spend: 40,
        revenue: 160,
      }),
    );
  });

  it("builds compact product support from raw daily rows", () => {
    const support = buildGoogleAdsAdvisorProductSupportFromDailyRows([
      {
        entityKey: "hero",
        entityLabel: "Hero SKU",
        spend: 20,
        revenue: 120,
        conversions: 4,
      } as any,
      {
        entityKey: "hero",
        entityLabel: "Hero SKU",
        spend: 10,
        revenue: 60,
        conversions: 2,
      } as any,
      {
        entityKey: "laggard",
        entityLabel: "Laggard SKU",
        spend: 50,
        revenue: 40,
        conversions: 1,
      } as any,
      {
        entityKey: "hidden",
        entityLabel: "Hidden Winner",
        spend: 4,
        revenue: 40,
        conversions: 2,
      } as any,
    ]);

    expect(support.productTitles).toEqual(
      expect.arrayContaining(["hero sku", "laggard sku", "hidden winner"]),
    );
    expect(support.underperformingTitles).toContain("laggard sku");
    expect(support.winnerTitles).toEqual(
      expect.arrayContaining(["hero sku", "hidden winner"]),
    );
    expect(support.topRevenueTitles[0]).toBe("hero sku");
  });
});
