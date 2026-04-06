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

vi.mock("@/lib/integrations", () => ({
  getIntegration: vi.fn(),
}));

vi.mock("@/lib/provider-account-assignments", () => ({
  getProviderAccountAssignments: vi.fn(),
}));

vi.mock("@/lib/meta/readiness", () => ({
  getMetaPartialReason: vi.fn(),
  getMetaRangePreparationContext: vi.fn(),
}));

vi.mock("@/lib/meta/serving", () => ({
  getMetaWarehouseAdSets: vi.fn(),
}));

vi.mock("@/lib/meta/live", () => ({
  getMetaLiveAdSets: vi.fn(),
}));

const access = await import("@/lib/access");
const businessMode = await import("@/lib/business-mode.server");
const integrations = await import("@/lib/integrations");
const assignments = await import("@/lib/provider-account-assignments");
const readiness = await import("@/lib/meta/readiness");
const serving = await import("@/lib/meta/serving");
const live = await import("@/lib/meta/live");

describe("GET /api/meta/adsets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(businessMode.isDemoBusiness).mockResolvedValue(false);
    vi.mocked(integrations.getIntegration).mockResolvedValue({
      status: "connected",
    } as never);
    vi.mocked(assignments.getProviderAccountAssignments).mockResolvedValue({
      account_ids: ["act_1"],
    } as never);
  });

  it("uses the warehouse path for non-today requests", async () => {
    vi.mocked(readiness.getMetaRangePreparationContext).mockResolvedValue({
      isSelectedCurrentDay: false,
      currentDateInTimezone: "2026-04-05",
      primaryAccountTimezone: "UTC",
    });
    vi.mocked(serving.getMetaWarehouseAdSets).mockResolvedValue([
      {
        id: "adset-1",
        name: "Adset 1",
        campaignId: "cmp-1",
        status: "ACTIVE",
        optimizationGoal: "PURCHASE",
        bidStrategyLabel: "Cost Cap",
        bidValue: 1200,
        bidValueFormat: "currency",
        previousBidValue: 1000,
        previousBidValueFormat: "currency",
        previousBidValueCapturedAt: "2026-03-31T00:00:00.000Z",
        spend: 120,
        revenue: 300,
        cpa: 15,
        ctr: 1.4,
      },
    ] as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/adsets?businessId=biz&campaignId=cmp-1&startDate=2026-04-01&endDate=2026-04-03"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows).toHaveLength(1);
    assertMetaAdSetRowPageContract(payload.rows[0]);
    expect(serving.getMetaWarehouseAdSets).toHaveBeenCalledTimes(1);
    expect(live.getMetaLiveAdSets).not.toHaveBeenCalled();
  });

  it("uses the live path for current-day drilldown requests", async () => {
    vi.mocked(readiness.getMetaRangePreparationContext).mockResolvedValue({
      isSelectedCurrentDay: true,
      currentDateInTimezone: "2026-04-05",
      primaryAccountTimezone: "UTC",
    });
    vi.mocked(live.getMetaLiveAdSets).mockResolvedValue([
      {
        id: "adset-live-1",
        name: "Adset Live",
        campaignId: "cmp-1",
        status: "ACTIVE",
        optimizationGoal: "PURCHASE",
        bidStrategyLabel: "Auto",
        bidValue: null,
        bidValueFormat: null,
        previousBidValue: null,
        previousBidValueFormat: null,
        previousBidValueCapturedAt: null,
        spend: 22,
        revenue: 55,
        cpa: 11,
        ctr: 1.1,
      },
    ] as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/adsets?businessId=biz&campaignId=cmp-1&startDate=2026-04-05&endDate=2026-04-05"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows).toHaveLength(1);
    assertMetaAdSetRowPageContract(payload.rows[0]);
    expect(live.getMetaLiveAdSets).toHaveBeenCalledTimes(1);
    expect(serving.getMetaWarehouseAdSets).not.toHaveBeenCalled();
  });

  it("falls back to warehouse ad sets when the current-day live path returns no rows", async () => {
    vi.mocked(readiness.getMetaRangePreparationContext).mockResolvedValue({
      isSelectedCurrentDay: true,
      currentDateInTimezone: "2026-04-05",
      primaryAccountTimezone: "UTC",
    });
    vi.mocked(live.getMetaLiveAdSets).mockResolvedValue([] as never);
    vi.mocked(serving.getMetaWarehouseAdSets).mockResolvedValue([
      {
        id: "adset-wh-1",
        name: "Warehouse Adset",
        campaignId: "cmp-1",
        status: "ACTIVE",
        optimizationGoal: "PURCHASE",
        bidStrategyLabel: "Auto",
        bidValue: null,
        bidValueFormat: null,
        previousBidValue: null,
        previousBidValueFormat: null,
        previousBidValueCapturedAt: null,
        spend: 18,
        revenue: 54,
        cpa: 9,
        ctr: 1.3,
      },
    ] as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/adsets?businessId=biz&campaignId=cmp-1&startDate=2026-04-05&endDate=2026-04-05"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0]?.id).toBe("adset-wh-1");
    expect(live.getMetaLiveAdSets).toHaveBeenCalledTimes(1);
    expect(serving.getMetaWarehouseAdSets).toHaveBeenCalledTimes(1);
  });
});
