import { beforeEach, describe, expect, it, vi } from "vitest";

const readGoogleAdsSearchIntelligenceCoverage = vi.fn();
const getGoogleAdsRetentionRuntimeStatus = vi.fn();
const executeGoogleAdsRetentionPolicyDryRunOnly = vi.fn();
const getGoogleAdsSearchTermsReport = vi.fn();
const getGoogleAdsSearchIntelligenceReport = vi.fn();

vi.mock("@/lib/google-ads/search-intelligence-storage", () => ({
  readGoogleAdsSearchIntelligenceCoverage,
}));

vi.mock("@/lib/google-ads/warehouse-retention", () => ({
  getGoogleAdsRetentionRuntimeStatus,
  executeGoogleAdsRetentionPolicyDryRunOnly,
}));

vi.mock("@/lib/google-ads/serving", () => ({
  getGoogleAdsSearchTermsReport,
  getGoogleAdsSearchIntelligenceReport,
}));

const retentionCanary = await import("@/lib/google-ads/retention-canary");

describe("verifyGoogleAdsRetentionCanary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getGoogleAdsRetentionRuntimeStatus.mockReturnValue({
      runtimeAvailable: true,
      executionEnabled: false,
      mode: "dry_run",
      gateReason: "Retention execution is disabled by default.",
    });
    executeGoogleAdsRetentionPolicyDryRunOnly.mockResolvedValue({
      executionEnabled: false,
      dryRun: [
        {
          tableName: "google_ads_search_query_hot_daily",
          cutoffDate: "2025-12-12",
          observed: true,
          eligibleRows: 12,
          oldestEligibleValue: "2025-01-01",
          newestEligibleValue: "2025-12-11",
          retainedRows: 44,
          latestRetainedValue: "2026-04-10",
        },
        {
          tableName: "google_ads_search_term_daily",
          cutoffDate: "2025-12-12",
          observed: true,
          eligibleRows: 20,
          oldestEligibleValue: "2025-01-01",
          newestEligibleValue: "2025-12-11",
          retainedRows: 30,
          latestRetainedValue: "2026-04-10",
        },
      ],
    });
    getGoogleAdsSearchTermsReport.mockResolvedValue({
      rows: [],
      meta: {
        warnings: [
          "Search intelligence is only retained for the most recent 120 days starting 2025-12-12.",
        ],
      },
    });
    getGoogleAdsSearchIntelligenceReport.mockResolvedValue({
      rows: [{ source: "top_query_weekly", searchTerm: "Hiking Backpack" }],
      meta: {
        warnings: [
          "Long-range search intelligence is served from additive query and cluster aggregates; raw search-term rows remain limited to the most recent 120 days.",
        ],
      },
    });
    readGoogleAdsSearchIntelligenceCoverage.mockResolvedValue({
      completedDays: 84,
      readyThroughDate: "2026-04-10",
      latestUpdatedAt: "2026-04-10T00:00:00.000Z",
      totalRows: 120,
    });
  });

  it("passes when historical search intelligence stays aggregate-backed and advisor support is complete", async () => {
    const result = await retentionCanary.verifyGoogleAdsRetentionCanary({
      businessId: "biz",
      accountId: "acc_1",
      asOfDate: "2026-04-10",
    });

    expect(result.passed).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.retentionRuntime.defaultExecutionDisabled).toBe(true);
    expect(result.rawSearchTermsProbe.rowCount).toBe(0);
    expect(result.searchIntelligenceProbe).toMatchObject({
      rowCount: 1,
      aggregateBacked: true,
      sources: ["top_query_weekly"],
    });
    expect(result.recentAdvisorSupport).toMatchObject({
      completedDays: 84,
      ready: true,
    });
    expect(result.retentionDryRun.rawHotTables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: "google_ads_search_term_daily",
          eligibleRows: 20,
          retainedRows: 30,
        }),
      ])
    );
  });

  it("fails when the probe still returns raw rows or advisor coverage is incomplete", async () => {
    getGoogleAdsSearchTermsReport.mockResolvedValue({
      rows: [{ source: "search_query_hot_daily", searchTerm: "Should be empty" }],
      meta: { warnings: [] },
    });
    getGoogleAdsSearchIntelligenceReport.mockResolvedValue({
      rows: [{ source: "search_query_hot_daily", searchTerm: "Still raw-backed" }],
      meta: { warnings: [] },
    });
    readGoogleAdsSearchIntelligenceCoverage.mockResolvedValue({
      completedDays: 40,
      readyThroughDate: "2026-03-20",
      latestUpdatedAt: "2026-04-10T00:00:00.000Z",
      totalRows: 40,
    });

    const result = await retentionCanary.verifyGoogleAdsRetentionCanary({
      businessId: "biz",
      asOfDate: "2026-04-10",
    });

    expect(result.passed).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Raw search-term probe returned 1 row"),
        expect.stringContaining("Historical search-intelligence probe was not aggregate-backed"),
        expect.stringContaining("Recent advisor support is incomplete"),
      ])
    );
  });
});
