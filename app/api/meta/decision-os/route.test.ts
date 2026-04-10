import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { assertMetaDecisionOsPageContract } from "@/lib/meta/page-route-contract.test-helpers";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/business-commercial", () => ({
  getBusinessCommercialTruthSnapshot: vi.fn(),
}));

vi.mock("@/lib/meta/adsets-source", () => ({
  getMetaAdSetsForRange: vi.fn(),
}));

vi.mock("@/lib/meta/decision-os-config", () => ({
  isMetaDecisionOsV1EnabledForBusiness: vi.fn(),
}));

vi.mock("@/lib/meta/decision-os", () => ({
  buildMetaDecisionOs: vi.fn(),
  META_DECISION_OS_V1_CONTRACT: "meta-decision-os.v1",
}));

const access = await import("@/lib/access");
const businessCommercial = await import("@/lib/business-commercial");
const adsetsSource = await import("@/lib/meta/adsets-source");
const decisionOsConfig = await import("@/lib/meta/decision-os-config");
const decisionOs = await import("@/lib/meta/decision-os");
const { GET } = await import("@/app/api/meta/decision-os/route");

describe("GET /api/meta/decision-os", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(decisionOsConfig.isMetaDecisionOsV1EnabledForBusiness).mockReturnValue(true);
    vi.mocked(businessCommercial.getBusinessCommercialTruthSnapshot).mockResolvedValue({
      businessId: "biz",
      targetPack: null,
      countryEconomics: [],
      promoCalendar: [],
      operatingConstraints: null,
      costModelContext: null,
      sectionMeta: {
        targetPack: { configured: false, itemCount: 0, sourceLabel: null, updatedAt: null, updatedByUserId: null },
        countryEconomics: { configured: false, itemCount: 0, sourceLabel: null, updatedAt: null, updatedByUserId: null },
        promoCalendar: { configured: false, itemCount: 0, sourceLabel: null, updatedAt: null, updatedByUserId: null },
        operatingConstraints: { configured: false, itemCount: 0, sourceLabel: null, updatedAt: null, updatedByUserId: null },
      },
    } as never);
    vi.mocked(adsetsSource.getMetaAdSetsForRange).mockResolvedValue({
      status: "ok",
      rows: [{ id: "adset-1", name: "Adset One", campaignId: "cmp-1", status: "ACTIVE", spend: 250, revenue: 800, purchases: 10, cpa: 25, ctr: 1.4, impressions: 10000, clicks: 140, dailyBudget: 500, lifetimeBudget: null, optimizationGoal: "PURCHASE", bidStrategyType: null, bidStrategyLabel: null, manualBidAmount: null, bidValue: null, bidValueFormat: null, isBudgetMixed: false, isConfigMixed: false } as never],
      isPartial: false,
      notReadyReason: null,
    });
    vi.mocked(decisionOs.buildMetaDecisionOs).mockReturnValue({
      contractVersion: "meta-decision-os.v1",
      generatedAt: "2026-04-10T00:00:00.000Z",
      businessId: "biz",
      startDate: "2026-04-01",
      endDate: "2026-04-05",
      summary: {
        todayPlanHeadline: "Today plan",
        todayPlan: ["Do the next thing"],
        budgetShiftSummary: "1 shift",
        noTouchSummary: "1 no-touch",
        operatingMode: null,
        confidence: 0.8,
      },
      campaigns: [],
      adSets: [],
      budgetShifts: [],
      geoDecisions: [],
      placementAnomalies: [],
      noTouchList: [],
      commercialTruthCoverage: {
        mode: "conservative_fallback",
        targetPackConfigured: false,
        countryEconomicsConfigured: false,
        promoCalendarConfigured: false,
        operatingConstraintsConfigured: false,
        missingInputs: ["target_pack"],
        notes: [],
      },
    } as never);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("/api/meta/campaigns")) {
          return new Response(
            JSON.stringify({
              status: "ok",
              rows: [{ id: "cmp-1", name: "Campaign One", status: "ACTIVE", spend: 500, revenue: 1500, purchases: 20, roas: 3, cpa: 25 }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("/api/meta/breakdowns")) {
          return new Response(
            JSON.stringify({
              status: "ok",
              age: [],
              location: [{ key: "US", label: "US", spend: 500, revenue: 1500, purchases: 20, clicks: 100, impressions: 10000 }],
              placement: [{ key: "feed", label: "Feed", spend: 300, revenue: 600 }],
              budget: { campaign: [], adset: [] },
              audience: { available: false },
              products: { available: false },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      }),
    );
  });

  it("builds the decision payload from campaigns, ad sets, breakdowns, and commercial truth", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/decision-os?businessId=biz&startDate=2026-04-01&endDate=2026-04-05",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertMetaDecisionOsPageContract(payload);
    expect(decisionOs.buildMetaDecisionOs).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz",
        startDate: "2026-04-01",
        endDate: "2026-04-05",
        campaigns: expect.arrayContaining([
          expect.objectContaining({ id: "cmp-1", name: "Campaign One" }),
        ]),
        adSets: expect.arrayContaining([
          expect.objectContaining({ id: "adset-1", name: "Adset One" }),
        ]),
        breakdowns: expect.objectContaining({
          location: expect.arrayContaining([
            expect.objectContaining({ label: "US" }),
          ]),
        }),
      }),
    );
  });

  it("returns 404 when the feature gate is disabled for the workspace", async () => {
    vi.mocked(decisionOsConfig.isMetaDecisionOsV1EnabledForBusiness).mockReturnValue(false);

    const response = await GET(
      new NextRequest("http://localhost/api/meta/decision-os?businessId=biz"),
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toBe("meta_decision_os_disabled");
  });
});
