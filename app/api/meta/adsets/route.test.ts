import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/meta/adsets/route";
import { assertMetaAdSetRowPageContract } from "@/lib/meta/page-route-contract.test-helpers";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/business-mode.server", () => ({
  isDemoBusiness: vi.fn(),
}));

vi.mock("@/lib/meta/adsets-source", () => ({
  getMetaAdSetsForRange: vi.fn(),
}));

const access = await import("@/lib/access");
const businessMode = await import("@/lib/business-mode.server");
const adsetsSource = await import("@/lib/meta/adsets-source");

describe("GET /api/meta/adsets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(businessMode.isDemoBusiness).mockResolvedValue(false);
  });

  it("returns ad set rows through the shared source helper", async () => {
    vi.mocked(adsetsSource.getMetaAdSetsForRange).mockResolvedValue({
      status: "ok",
      rows: [
      {
        id: "adset-1",
        name: "Adset 1",
        campaignId: "cmp-1",
        status: "ACTIVE",
        dailyBudget: null,
        lifetimeBudget: null,
        optimizationGoal: "PURCHASE",
        bidStrategyType: null,
        bidStrategyLabel: "Cost Cap",
        manualBidAmount: null,
        previousManualBidAmount: null,
        bidValue: 1200,
        bidValueFormat: "currency",
        previousBidValue: 1000,
        previousBidValueFormat: "currency",
        previousBidValueCapturedAt: "2026-03-31T00:00:00.000Z",
        previousDailyBudget: null,
        previousLifetimeBudget: null,
        previousBudgetCapturedAt: null,
        isBudgetMixed: false,
        isConfigMixed: false,
        isOptimizationGoalMixed: false,
        isBidStrategyMixed: false,
        isBidValueMixed: false,
        spend: 120,
        purchases: 8,
        revenue: 300,
        roas: 2.5,
        cpa: 15,
        cpm: 10,
        impressions: 10000,
        clicks: 140,
        ctr: 1.4,
      } as never,
      ],
      isPartial: false,
      notReadyReason: null,
      evidenceSource: "live",
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/adsets?businessId=biz&campaignId=cmp-1&startDate=2026-04-01&endDate=2026-04-03"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows).toHaveLength(1);
    assertMetaAdSetRowPageContract(payload.rows[0]);
    expect(adsetsSource.getMetaAdSetsForRange).toHaveBeenCalledWith({
      businessId: "biz",
      campaignId: "cmp-1",
      startDate: "2026-04-01",
      endDate: "2026-04-03",
      includePrev: false,
    });
  });

  it("supports account-wide ad set reads when campaignId is omitted", async () => {
    vi.mocked(adsetsSource.getMetaAdSetsForRange).mockResolvedValue({
      status: "ok",
      rows: [
      {
        id: "adset-live-1",
        name: "Adset Live",
        campaignId: "cmp-1",
        status: "ACTIVE",
        dailyBudget: null,
        lifetimeBudget: null,
        optimizationGoal: "PURCHASE",
        bidStrategyType: null,
        bidStrategyLabel: "Auto",
        manualBidAmount: null,
        previousManualBidAmount: null,
        bidValue: null,
        bidValueFormat: null,
        previousBidValue: null,
        previousBidValueFormat: null,
        previousBidValueCapturedAt: null,
        previousDailyBudget: null,
        previousLifetimeBudget: null,
        previousBudgetCapturedAt: null,
        isBudgetMixed: false,
        isConfigMixed: false,
        isOptimizationGoalMixed: false,
        isBidStrategyMixed: false,
        isBidValueMixed: false,
        spend: 22,
        purchases: 2,
        revenue: 55,
        roas: 2.5,
        cpa: 11,
        cpm: 8,
        impressions: 2000,
        clicks: 22,
        ctr: 1.1,
      } as never,
      ],
      isPartial: false,
      notReadyReason: null,
      evidenceSource: "live",
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/adsets?businessId=biz&startDate=2026-04-05&endDate=2026-04-05"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows).toHaveLength(1);
    assertMetaAdSetRowPageContract(payload.rows[0]);
    expect(adsetsSource.getMetaAdSetsForRange).toHaveBeenCalledWith({
      businessId: "biz",
      campaignId: null,
      startDate: "2026-04-05",
      endDate: "2026-04-05",
      includePrev: false,
    });
  });
});
