import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchTermPerformanceRow } from "@/lib/google-ads/intelligence-model";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/migrations", () => ({
  runMigrations: vi.fn().mockResolvedValue(undefined),
}));

const db = await import("@/lib/db");
const storage = await import("@/lib/google-ads/search-intelligence-storage");

function buildSearchRow(
  overrides: Partial<SearchTermPerformanceRow> & Record<string, unknown> = {}
): Partial<SearchTermPerformanceRow> & Record<string, unknown> {
  return {
    searchTerm: "Running Shoes",
    campaignId: "cmp_1",
    campaignName: "Search",
    adGroupId: "ag_1",
    adGroupName: "Ad Group",
    intentClass: "category_high_intent",
    ownershipClass: "non_brand",
    clusterId: "running_shoes_cluster",
    spend: 12,
    revenue: 48,
    conversions: 2,
    impressions: 120,
    clicks: 12,
    ...overrides,
  } satisfies Partial<SearchTermPerformanceRow> & Record<string, unknown>;
}

describe("Google Ads search intelligence storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes query text and hashes equivalent variants deterministically", () => {
    expect(storage.normalizeGoogleAdsQueryText("  Running   Shoes ")).toBe("running shoes");
    expect(storage.buildGoogleAdsQueryHash("Running Shoes")).toBe(
      storage.buildGoogleAdsQueryHash(" running   shoes ")
    );
  });

  it("builds deduplicated query dictionary entries", () => {
    const entries = storage.buildGoogleAdsQueryDictionaryEntries({
      date: "2026-04-08",
      rows: [buildSearchRow(), buildSearchRow({ searchTerm: "running shoes" })],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      normalizedQuery: "running shoes",
      firstSeenDate: "2026-04-08",
      lastSeenDate: "2026-04-08",
    });
  });

  it("builds top-query weekly and cluster aggregates from hot-daily rows", () => {
    const hotDailyRows = storage.buildGoogleAdsSearchQueryHotDailyRows({
      businessId: "biz",
      providerAccountId: "acct",
      date: "2026-04-08",
      accountTimezone: "UTC",
      accountCurrency: "USD",
      rows: [buildSearchRow(), buildSearchRow({ spend: 8, revenue: 24, conversions: 1 })],
      sourceSnapshotId: "snap_1",
    });

    const weeklyRows = storage.buildGoogleAdsTopQueryWeeklyRowsFromHotDaily({ hotDailyRows });
    const clusterRows = storage.buildGoogleAdsSearchClusterDailyRows({
      businessId: "biz",
      providerAccountId: "acct",
      date: "2026-04-08",
      rows: [buildSearchRow(), buildSearchRow({ searchTerm: "best running shoes" })],
    });

    expect(weeklyRows).toHaveLength(1);
    expect(weeklyRows[0]).toMatchObject({
      weekStart: "2026-04-06",
      weekEnd: "2026-04-12",
      spend: 20,
      revenue: 72,
      conversions: 3,
    });
    expect(clusterRows).toHaveLength(1);
    expect(clusterRows[0]).toMatchObject({
      clusterKey: "running_shoes_cluster",
      uniqueQueryCount: 2,
      spend: 24,
    });
  });

  it("persists the search intelligence foundation through additive storage helpers", async () => {
    const calls: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      calls.push(strings.join(" "));
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const result = await storage.persistGoogleAdsSearchIntelligenceFoundation({
      businessId: "biz",
      providerAccountId: "acct",
      date: "2026-04-08",
      accountTimezone: "UTC",
      accountCurrency: "USD",
      rows: [buildSearchRow()],
      sourceSnapshotId: "snap_1",
    });

    expect(result).toMatchObject({
      dictionaryEntryCount: 1,
      hotDailyRowCount: 1,
      weeklyRowCount: 1,
      clusterRowCount: 1,
    });
    const joined = calls.join("\n");
    expect(joined).toContain("INSERT INTO google_ads_query_dictionary");
    expect(joined).toContain("INSERT INTO google_ads_search_query_hot_daily");
    expect(joined).toContain("INSERT INTO google_ads_top_query_weekly");
    expect(joined).toContain("INSERT INTO google_ads_search_cluster_daily");
  });

  it("matches nullable campaign and ad-group ids deterministically during hot-daily upserts", async () => {
    const calls: string[] = [];
    let callCount = 0;
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      calls.push(query);
      callCount += 1;
      if (query.includes("UPDATE google_ads_search_query_hot_daily")) {
        return callCount === 1 ? [{ "?column?": 1 }] : [];
      }
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    await storage.upsertGoogleAdsSearchQueryHotDailyRows([
      storage.buildGoogleAdsSearchQueryHotDailyRows({
        businessId: "biz",
        providerAccountId: "acct",
        date: "2026-04-08",
        accountTimezone: "UTC",
        accountCurrency: "USD",
        rows: [buildSearchRow({ campaignId: "cmp_1", adGroupId: undefined, adGroupName: undefined })],
        sourceSnapshotId: "snap_1",
      })[0]!,
      storage.buildGoogleAdsSearchQueryHotDailyRows({
        businessId: "biz",
        providerAccountId: "acct",
        date: "2026-04-08",
        accountTimezone: "UTC",
        accountCurrency: "USD",
        rows: [buildSearchRow({ campaignId: "cmp_2", adGroupId: undefined, adGroupName: undefined })],
        sourceSnapshotId: "snap_1",
      })[0]!,
    ]);

    const joined = calls.join("\n");
    expect(joined).toContain("UPDATE google_ads_search_query_hot_daily");
    expect(joined).toContain("campaign_id IS NOT DISTINCT FROM");
    expect(joined).toContain("ad_group_id IS NOT DISTINCT FROM");
    expect(calls.filter((query) => query.includes("INSERT INTO google_ads_search_query_hot_daily"))).toHaveLength(1);
  });
});
