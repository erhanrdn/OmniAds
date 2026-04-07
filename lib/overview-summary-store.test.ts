import { beforeEach, describe, expect, it, vi } from "vitest";

const dbQuery = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({
    query: dbQuery,
  })),
}));

vi.mock("@/lib/migrations", () => ({
  runMigrations: vi.fn(),
}));

const { hydrateOverviewSummaryRangeFromMeta } = await import("@/lib/overview-summary-store");

describe("overview summary store", () => {
  beforeEach(() => {
    dbQuery.mockReset();
    dbQuery.mockResolvedValue([]);
  });

  it("normalizes Date-based Meta warehouse rows before hydrating the summary range", async () => {
    const rows = await hydrateOverviewSummaryRangeFromMeta({
      businessId: "biz",
      providerAccountIds: ["act_1"],
      startDate: "2026-03-29",
      endDate: "2026-03-31",
      rows: [
        {
          businessId: "biz",
          providerAccountId: "act_1",
          date: new Date("2026-03-29T00:00:00.000Z"),
          accountName: "Main",
          accountTimezone: "America/Anchorage",
          accountCurrency: "USD",
          spend: 459.43,
          impressions: 1000,
          clicks: 50,
          reach: 800,
          frequency: 1.25,
          conversions: 8,
          revenue: 1200,
          roas: 2.61,
          cpa: 57.43,
          ctr: 5,
          cpc: 9.19,
          sourceSnapshotId: "snap_1",
          finalizedAt: "2026-04-07T08:51:32.721Z",
          createdAt: "2026-04-07T08:51:38.063Z",
          updatedAt: "2026-04-07T08:51:38.063Z",
        },
      ] as never,
    });

    expect(rows).toEqual([
      expect.objectContaining({
        date: "2026-03-29",
        spend: 459.43,
        purchases: 8,
      }),
    ]);
    expect(dbQuery).toHaveBeenCalled();
  });
});
