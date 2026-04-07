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

vi.mock("@/lib/meta/canonical-overview", () => ({
  getMetaCanonicalOverviewSummary: vi.fn(),
}));

vi.mock("@/lib/demo-business", () => ({
  isDemoBusinessId: vi.fn(() => false),
  getDemoMetaSummary: vi.fn(),
}));

const access = await import("@/lib/access");
const assignments = await import("@/lib/provider-account-assignments");
const canonical = await import("@/lib/meta/canonical-overview");

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
    vi.mocked(canonical.getMetaCanonicalOverviewSummary).mockResolvedValue({
      totals: {
        spend: 1200,
        revenue: 3600,
        cpa: 24,
        roas: 3,
      },
      isPartial: false,
      notReadyReason: null,
      readSource: "warehouse",
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
    expect(canonical.getMetaCanonicalOverviewSummary).toHaveBeenCalledTimes(1);
  });

  it("keeps current-day summary aligned with the live override when live totals are actually available", async () => {
    vi.mocked(canonical.getMetaCanonicalOverviewSummary).mockResolvedValue({
      totals: {
        spend: 55,
        revenue: 160,
        cpa: 11,
        roas: 2.91,
        impressions: 2400,
      },
      isPartial: false,
      notReadyReason: null,
      readSource: "warehouse_plus_live_override",
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
  });

  it("keeps the current-day KPI subset on the warehouse payload when live totals are not yet available", async () => {
    vi.mocked(canonical.getMetaCanonicalOverviewSummary).mockResolvedValue({
      totals: {
        spend: 1200,
        revenue: 3600,
        cpa: 24,
        roas: 3,
      },
      isPartial: false,
      notReadyReason: null,
      readSource: "warehouse",
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
