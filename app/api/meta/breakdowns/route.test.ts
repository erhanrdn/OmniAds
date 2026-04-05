import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/meta/breakdowns/route";
import { assertMetaBreakdownsPageContract } from "@/lib/meta/page-route-contract.test-helpers";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/business-mode.server", () => ({
  isDemoBusiness: vi.fn(() => false),
}));

vi.mock("@/lib/integrations", () => ({
  getIntegration: vi.fn(),
}));

vi.mock("@/lib/provider-account-assignments", () => ({
  getProviderAccountAssignments: vi.fn(),
}));

vi.mock("@/lib/migrations", () => ({
  runMigrations: vi.fn(),
}));

vi.mock("@/lib/meta/constraints", () => ({
  getMetaBreakdownGuardrail: vi.fn(() => ({ message: null })),
}));

vi.mock("@/lib/meta/readiness", () => ({
  getMetaPartialReason: vi.fn(() => "Breakdown data is still being prepared."),
  getMetaRangePreparationContext: vi.fn(),
}));

vi.mock("@/lib/meta/serving", () => ({
  getMetaWarehouseBreakdowns: vi.fn(),
}));

const access = await import("@/lib/access");
const integrations = await import("@/lib/integrations");
const assignments = await import("@/lib/provider-account-assignments");
const readiness = await import("@/lib/meta/readiness");
const serving = await import("@/lib/meta/serving");

describe("GET /api/meta/breakdowns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(integrations.getIntegration).mockResolvedValue({
      status: "connected",
      access_token: "token",
    } as never);
    vi.mocked(assignments.getProviderAccountAssignments).mockResolvedValue({
      account_ids: ["act_1"],
    } as never);
    vi.mocked(readiness.getMetaRangePreparationContext).mockResolvedValue({
      isSelectedCurrentDay: false,
      currentDateInTimezone: "2026-04-05",
      primaryAccountTimezone: "UTC",
    });
  });

  it("returns the visible breakdown sections used by the current page", async () => {
    vi.mocked(serving.getMetaWarehouseBreakdowns).mockResolvedValue({
      age: [{ key: "18-24", label: "18-24", spend: 10, revenue: 22 }],
      location: [{ key: "US", label: "United States", spend: 12, revenue: 30 }],
      placement: [{ key: "facebook|feed|mobile", label: "facebook • feed • mobile", spend: 9, revenue: 18 }],
      budget: { campaign: [{ key: "cmp", label: "Campaign", spend: 12 }], adset: [] },
    } as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/breakdowns?businessId=biz&startDate=2026-04-01&endDate=2026-04-03"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertMetaBreakdownsPageContract(payload);
    expect(payload.age).toHaveLength(1);
    expect(payload.location).toHaveLength(1);
    expect(payload.placement).toHaveLength(1);
  });

  it("keeps the page-contract assertions focused on age, location, and placement only", async () => {
    vi.mocked(serving.getMetaWarehouseBreakdowns).mockResolvedValue({
      age: [],
      location: [],
      placement: [],
      budget: { campaign: [{ key: "cmp", label: "Campaign", spend: 999 }], adset: [{ key: "adset", label: "Ad set", spend: 123 }] },
    } as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/breakdowns?businessId=biz&startDate=2026-04-01&endDate=2026-04-03"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertMetaBreakdownsPageContract(payload);
    expect(payload).toHaveProperty("budget");
    expect(payload).toHaveProperty("audience");
    expect(payload).toHaveProperty("products");
  });
});
