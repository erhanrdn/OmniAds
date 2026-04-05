import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/meta/summary/route";
import { assertMetaSummaryPageContract } from "@/lib/meta/page-route-contract.test-helpers";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/provider-account-assignments", () => ({
  getProviderAccountAssignments: vi.fn(),
}));

vi.mock("@/lib/meta/readiness", () => ({
  getMetaPartialReason: vi.fn(() => "Meta data is preparing."),
  getMetaRangePreparationContext: vi.fn(),
}));

vi.mock("@/lib/meta/serving", () => ({
  getMetaWarehouseSummary: vi.fn(),
}));

vi.mock("@/lib/demo-business", () => ({
  isDemoBusinessId: vi.fn(() => false),
  getDemoMetaSummary: vi.fn(),
}));

vi.mock("@/lib/meta/live", () => ({
  getMetaLiveSummaryTotals: vi.fn(),
}));

vi.mock("@/lib/integrations", () => ({
  getIntegration: vi.fn(),
}));

const access = await import("@/lib/access");
const assignments = await import("@/lib/provider-account-assignments");
const readiness = await import("@/lib/meta/readiness");
const serving = await import("@/lib/meta/serving");
const live = await import("@/lib/meta/live");
const integrations = await import("@/lib/integrations");

describe("GET /api/meta/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(assignments.getProviderAccountAssignments).mockResolvedValue({
      account_ids: ["act_1"],
    } as never);
    vi.mocked(readiness.getMetaRangePreparationContext).mockResolvedValue({
      isSelectedCurrentDay: false,
      currentDateInTimezone: "2026-04-05",
      primaryAccountTimezone: "UTC",
    });
    vi.mocked(integrations.getIntegration).mockResolvedValue({
      status: "connected",
    } as never);
    vi.mocked(serving.getMetaWarehouseSummary).mockResolvedValue({
      totals: {
        spend: 1200,
        revenue: 3600,
        cpa: 24,
        roas: 3,
      },
      isPartial: false,
    } as never);
    vi.mocked(live.getMetaLiveSummaryTotals).mockResolvedValue({
      spend: 0,
      revenue: 0,
      cpa: 0,
      roas: 0,
      impressions: 0,
    } as never);
  });

  it("returns the KPI-visible totals subset for historical requests", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/summary?businessId=biz&startDate=2026-04-01&endDate=2026-04-03"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertMetaSummaryPageContract(payload);
    expect(serving.getMetaWarehouseSummary).toHaveBeenCalledTimes(1);
    expect(live.getMetaLiveSummaryTotals).not.toHaveBeenCalled();
  });

  it("keeps current-day summary aligned with the live override when live totals are actually available", async () => {
    vi.mocked(readiness.getMetaRangePreparationContext).mockResolvedValue({
      isSelectedCurrentDay: true,
      currentDateInTimezone: "2026-04-05",
      primaryAccountTimezone: "UTC",
    });
    vi.mocked(live.getMetaLiveSummaryTotals).mockResolvedValue({
      spend: 55,
      revenue: 160,
      cpa: 11,
      roas: 2.91,
      impressions: 2400,
    } as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/summary?businessId=biz&startDate=2026-04-05&endDate=2026-04-05"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertMetaSummaryPageContract(payload);
    expect(payload.totals).toEqual(
      expect.objectContaining({
        spend: 55,
        revenue: 160,
        cpa: 11,
        roas: 2.91,
      })
    );
    expect(live.getMetaLiveSummaryTotals).toHaveBeenCalledTimes(1);
  });

  it("keeps the current-day KPI subset on the warehouse payload when live totals are not yet available", async () => {
    vi.mocked(readiness.getMetaRangePreparationContext).mockResolvedValue({
      isSelectedCurrentDay: true,
      currentDateInTimezone: "2026-04-05",
      primaryAccountTimezone: "UTC",
    });
    vi.mocked(live.getMetaLiveSummaryTotals).mockResolvedValue({
      spend: 0,
      revenue: 0,
      cpa: null,
      roas: 0,
      conversions: 0,
      ctr: null,
      cpc: null,
      impressions: 0,
      clicks: 0,
      reach: 0,
    } as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/summary?businessId=biz&startDate=2026-04-05&endDate=2026-04-05"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertMetaSummaryPageContract(payload);
    expect(payload.totals).toEqual(
      expect.objectContaining({
        spend: 1200,
        revenue: 3600,
        cpa: 24,
        roas: 3,
      })
    );
  });
});
