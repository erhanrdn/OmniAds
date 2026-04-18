import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/google-ads/serving", () => ({
  getGoogleAdsCampaignsReport: vi.fn(async () => ({
    rows: [],
    meta: {},
  })),
  getGoogleAdsOverviewSummaryAggregate: vi.fn(async () => ({
    kpis: {
      spend: 0,
      revenue: 0,
      conversions: 0,
      roas: 0,
      cpa: 0,
      cpc: 0,
      ctr: 0,
      impressions: 0,
      clicks: 0,
    },
    meta: {
      warnings: [],
    },
  })),
  getGoogleAdsProductsReport: vi.fn(async () => ({
    rows: [
      {
        id: "prod_1",
        name: "Dimension Product",
        productTitle: "Dimension Product",
        title: "Dimension Product",
        entityLabel: "Dimension Product",
        campaignId: "cmp_1",
        campaignName: "Campaign 1",
        status: "enabled",
        spend: 10,
        revenue: 20,
        conversions: 2,
        impressions: 100,
        clicks: 10,
        roas: 2,
        classification: "stable_product",
      },
    ],
    meta: {},
  })),
  getGoogleAdsSearchIntelligenceReport: vi.fn(async () => ({
    rows: [],
    meta: {},
  })),
}));

vi.mock("@/lib/google-ads/warehouse", () => ({
  readGoogleAdsAggregatedRange: vi.fn(async (input: { scope: string }) => {
    if (input.scope === "product_daily") {
      return [
        {
          id: "prod_1",
          entityKey: "prod_1",
          name: "Dimension Product",
          productTitle: "Dimension Product",
          title: "Dimension Product",
          entityLabel: "Fact Product",
          campaignId: "cmp_1",
          campaignName: "Campaign 1",
          status: "enabled",
          spend: 10,
          revenue: 20,
          conversions: 2,
          impressions: 100,
          clicks: 10,
          roas: 2,
          classification: "stable_product",
        },
      ];
    }

    return [];
  }),
}));

vi.mock("@/lib/google-ads/search-intelligence-storage", () => ({
  normalizeGoogleAdsQueryText: vi.fn((value: string) => value.trim().toLowerCase()),
  readGoogleAdsSearchQueryHotDailySupportRows: vi.fn(async () => []),
}));

const { buildGoogleAdsParityArtifact } = await import("@/scripts/google-ads-parity-check");

describe("google ads parity check", () => {
  it("treats the typed product dimension title as the canonical product name", async () => {
    const artifact = (await buildGoogleAdsParityArtifact({
      businessId: "biz_1",
      startDate: "2026-04-05",
      endDate: "2026-04-17",
      jsonOut: null,
    })) as {
      summary: {
        blockingDiffCount: number;
        surfaces: Array<{
          surface: string;
          blockingDiffCount: number;
        }>;
      };
    };

    expect(artifact.summary.blockingDiffCount).toBe(0);
    expect(artifact.summary.surfaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          surface: "products",
          blockingDiffCount: 0,
        }),
      ]),
    );
  });
});
