import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/google-ads/overview/route";

vi.mock("@/lib/business-mode.server", () => ({
  isDemoBusiness: vi.fn(),
}));

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/demo-business", () => ({
  getDemoGoogleAdsOverview: vi.fn(() => ({ kpis: {}, topCampaigns: [], insights: [], summary: {}, meta: {} })),
}));

vi.mock("@/lib/google-ads/serving", () => ({
  getGoogleAdsOverviewReport: vi.fn(),
}));

vi.mock("@/lib/perf", () => ({
  logPerfEvent: vi.fn(),
}));

const businessMode = await import("@/lib/business-mode.server");
const access = await import("@/lib/access");
const serving = await import("@/lib/google-ads/serving");
const perf = await import("@/lib/perf");

describe("GET /api/google-ads/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(businessMode.isDemoBusiness).mockResolvedValue(false);
  });

  it("logs aligned telemetry fields for overview reads", async () => {
    vi.mocked(serving.getGoogleAdsOverviewReport).mockResolvedValue({
      kpis: { spend: 10 },
      kpiDeltas: undefined,
      topCampaigns: [{ id: "cmp_1" }],
      insights: [],
      summary: {},
      meta: {
        readSource: "warehouse_account_aggregate",
      },
    } as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/google-ads/overview?businessId=biz&dateRange=custom&customStart=2026-03-01&customEnd=2026-03-31&compareMode=none"
      )
    );

    expect(response.status).toBe(200);
    expect(serving.getGoogleAdsOverviewReport).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz",
        dateRange: "custom",
        customStart: "2026-03-01",
        customEnd: "2026-03-31",
        compareMode: "none",
        source: "google_ads_workspace_overview_route",
      })
    );
    expect(perf.logPerfEvent).toHaveBeenCalledWith(
      "google_ads_overview_route",
      expect.objectContaining({
        businessId: "biz",
        dateSpanDays: 31,
        rowCount: 1,
        topCampaignCount: 1,
        readSource: "warehouse_account_aggregate",
      })
    );
  });
});
