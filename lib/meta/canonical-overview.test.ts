import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations", () => ({
  getIntegration: vi.fn(),
}));

vi.mock("@/lib/meta/live", () => ({
  getMetaLiveSummaryTotals: vi.fn(),
}));

vi.mock("@/lib/meta/readiness", () => ({
  getMetaPartialReason: vi.fn(),
  getMetaRangePreparationContext: vi.fn(),
}));

vi.mock("@/lib/meta/serving", () => ({
  getMetaWarehouseSummary: vi.fn(),
  getMetaWarehouseTrends: vi.fn(),
}));

vi.mock("@/lib/provider-account-assignments", () => ({
  getProviderAccountAssignments: vi.fn(),
}));

vi.mock("@/lib/sync/meta-sync", () => ({
  getMetaSelectedRangeTruthReadiness: vi.fn(),
}));

const integrations = await import("@/lib/integrations");
const live = await import("@/lib/meta/live");
const readiness = await import("@/lib/meta/readiness");
const serving = await import("@/lib/meta/serving");
const assignments = await import("@/lib/provider-account-assignments");
const metaSync = await import("@/lib/sync/meta-sync");
const canonical = await import("@/lib/meta/canonical-overview");

describe("meta canonical overview summary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(assignments.getProviderAccountAssignments).mockResolvedValue({
      account_ids: ["act_1"],
    } as never);
    vi.mocked(integrations.getIntegration).mockResolvedValue({
      status: "connected",
    } as never);
    vi.mocked(readiness.getMetaRangePreparationContext).mockResolvedValue({
      isSelectedCurrentDay: false,
      currentDateInTimezone: "2026-04-08",
      primaryAccountTimezone: "America/Los_Angeles",
    } as never);
    vi.mocked(readiness.getMetaPartialReason).mockReturnValue(
      "Warehouse data is still being prepared for the requested range.",
    );
    vi.mocked(live.getMetaLiveSummaryTotals).mockResolvedValue({
      spend: 0,
      revenue: 0,
      conversions: 0,
      roas: 0,
      cpa: null,
      ctr: null,
      cpc: null,
      impressions: 0,
      clicks: 0,
      reach: 0,
    } as never);
  });

  it("treats historical non-finalized-only ranges as ready", async () => {
    vi.mocked(serving.getMetaWarehouseSummary).mockResolvedValue({
      freshness: {
        dataState: "ready",
        lastSyncedAt: "2026-04-08T00:00:00Z",
        liveRefreshedAt: null,
        isPartial: false,
        missingWindows: [],
        warnings: [],
      },
      historicalSync: {
        progressPercent: 100,
        completedDays: 394,
        totalDays: 394,
        readyThroughDate: "2026-04-06",
        state: "ready",
      },
      isPartial: true,
      verification: null,
      totals: {
        spend: 0,
        revenue: 0,
        conversions: 0,
        roas: 0,
        cpa: null,
        ctr: null,
        cpc: null,
        impressions: 0,
        clicks: 0,
        reach: 0,
      },
      accounts: [],
    } as never);
    vi.mocked(metaSync.getMetaSelectedRangeTruthReadiness).mockResolvedValue({
      truthReady: false,
      state: "processing",
      totalDays: 1,
      completedCoreDays: 1,
      blockingReasons: ["non_finalized"],
      reasonCounts: { non_finalized: 1 },
    } as never);

    const result = await canonical.getMetaCanonicalOverviewSummary({
      businessId: "biz-1",
      startDate: "2026-04-07",
      endDate: "2026-04-07",
    });

    expect(result.isPartial).toBe(false);
    expect(result.notReadyReason).toBeNull();
    expect(result.readSource).toBe("warehouse");
  });
});
