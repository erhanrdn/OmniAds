import { describe, expect, it } from "vitest";
import { summarizeGoogleAdsAdvisorAggregateIntelligence } from "@/lib/google-ads/advisor-aggregate-intelligence";

describe("summarizeGoogleAdsAdvisorAggregateIntelligence", () => {
  it("groups weekly query rows and daily cluster rows into operator-usable support summaries", () => {
    const intelligence = summarizeGoogleAdsAdvisorAggregateIntelligence({
      queryWeeklyRows: [
        {
          businessId: "biz",
          providerAccountId: "acct",
          weekStart: "2026-03-02",
          weekEnd: "2026-03-08",
          queryHash: "q1",
          queryCountDays: 3,
          spend: 80,
          revenue: 240,
          conversions: 2,
          impressions: 400,
          clicks: 30,
          normalizedQuery: "carry on backpack",
          displayQuery: "Carry On Backpack",
        },
        {
          businessId: "biz",
          providerAccountId: "acct",
          weekStart: "2026-03-09",
          weekEnd: "2026-03-15",
          queryHash: "q1",
          queryCountDays: 2,
          spend: 60,
          revenue: 180,
          conversions: 2,
          impressions: 320,
          clicks: 22,
          normalizedQuery: "carry on backpack",
          displayQuery: "carry on backpack",
        },
      ],
      clusterDailyRows: [
        {
          businessId: "biz",
          providerAccountId: "acct",
          date: "2026-03-10",
          clusterKey: "travel-backpack-theme",
          clusterLabel: "Travel backpack demand",
          themeKey: "category_mid_intent",
          dominantIntentClass: "category_mid_intent",
          dominantOwnershipClass: "non_brand",
          uniqueQueryCount: 6,
          spend: 40,
          revenue: 110,
          conversions: 1,
          impressions: 180,
          clicks: 14,
        },
        {
          businessId: "biz",
          providerAccountId: "acct",
          date: "2026-03-11",
          clusterKey: "travel-backpack-theme",
          clusterLabel: "Travel backpack demand",
          themeKey: "category_mid_intent",
          dominantIntentClass: "category_mid_intent",
          dominantOwnershipClass: "non_brand",
          uniqueQueryCount: 7,
          spend: 45,
          revenue: 130,
          conversions: 2,
          impressions: 220,
          clicks: 16,
        },
      ],
      supportWindowStart: "2026-01-15",
      supportWindowEnd: "2026-04-08",
    });

    expect(intelligence.queryWeeklySupport[0]).toMatchObject({
      normalizedQuery: "carry on backpack",
      weeksPresent: 2,
      totalSpend: 140,
      totalConversions: 4,
    });
    expect(intelligence.clusterDailySupport[0]).toMatchObject({
      clusterKey: "travel-backpack-theme",
      clusterLabel: "Travel backpack demand",
      daysPresent: 2,
      totalUniqueQueries: 13,
      totalSpend: 85,
    });
    expect(intelligence.metadata).toMatchObject({
      topQueryWeeklyAvailable: true,
      clusterDailyAvailable: true,
      queryWeeklyRows: 2,
      clusterDailyRows: 2,
    });
  });
});
