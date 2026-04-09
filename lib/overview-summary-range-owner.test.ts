import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/google-ads/warehouse", () => ({
  readGoogleAdsDailyRange: vi.fn(),
}));

vi.mock("@/lib/meta/warehouse", () => ({
  getMetaAccountDailyRange: vi.fn(),
}));

vi.mock("@/lib/overview-summary-materializer", () => ({
  materializeOverviewSummaryRangeFromGoogle: vi.fn(),
  materializeOverviewSummaryRangeFromMeta: vi.fn(),
}));

vi.mock("@/lib/provider-account-assignments", () => ({
  getProviderAccountAssignments: vi.fn(),
}));

const googleWarehouse = await import("@/lib/google-ads/warehouse");
const metaWarehouse = await import("@/lib/meta/warehouse");
const materializer = await import("@/lib/overview-summary-materializer");
const assignments = await import("@/lib/provider-account-assignments");
const {
  materializeOverviewSummaryRangeForBusiness,
} = await import("@/lib/overview-summary-range-owner");

describe("overview summary range owner", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(assignments.getProviderAccountAssignments).mockResolvedValue({
      account_ids: ["act_2", "act_1", "act_1"],
    } as never);
    vi.mocked(metaWarehouse.getMetaAccountDailyRange).mockResolvedValue([
      { date: "2026-03-01" },
    ] as never);
    vi.mocked(googleWarehouse.readGoogleAdsDailyRange).mockResolvedValue([
      { date: "2026-03-01" },
    ] as never);
    vi.mocked(materializer.materializeOverviewSummaryRangeFromMeta).mockResolvedValue([
      { date: "2026-03-01" },
    ] as never);
    vi.mocked(materializer.materializeOverviewSummaryRangeFromGoogle).mockResolvedValue([
      { date: "2026-03-01" },
      { date: "2026-03-02" },
    ] as never);
  });

  it("resolves assigned provider accounts and materializes Meta ranges through the explicit owner", async () => {
    const result = await materializeOverviewSummaryRangeForBusiness({
      businessId: "biz_1",
      provider: "meta",
      startDate: "2026-03-01",
      endDate: "2026-03-07",
    });

    expect(assignments.getProviderAccountAssignments).toHaveBeenCalledWith("biz_1", "meta");
    expect(metaWarehouse.getMetaAccountDailyRange).toHaveBeenCalledWith({
      businessId: "biz_1",
      startDate: "2026-03-01",
      endDate: "2026-03-07",
      providerAccountIds: ["act_1", "act_2"],
      includeProvisional: false,
    });
    expect(materializer.materializeOverviewSummaryRangeFromMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        providerAccountIds: ["act_1", "act_2"],
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        provider: "meta",
        providerAccountIds: ["act_1", "act_2"],
        materialized: true,
        rowCount: 1,
        reason: "ok",
      }),
    );
  });

  it("materializes Google ranges through the explicit owner path", async () => {
    const result = await materializeOverviewSummaryRangeForBusiness({
      businessId: "biz_1",
      provider: "google",
      startDate: "2026-03-01",
      endDate: "2026-03-07",
      providerAccountIds: ["acc_9"],
    });

    expect(assignments.getProviderAccountAssignments).not.toHaveBeenCalled();
    expect(googleWarehouse.readGoogleAdsDailyRange).toHaveBeenCalledWith({
      scope: "account_daily",
      businessId: "biz_1",
      providerAccountIds: ["acc_9"],
      startDate: "2026-03-01",
      endDate: "2026-03-07",
    });
    expect(materializer.materializeOverviewSummaryRangeFromGoogle).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz_1",
        providerAccountIds: ["acc_9"],
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        provider: "google",
        materialized: true,
        rowCount: 2,
        reason: "ok",
      }),
    );
  });
});
