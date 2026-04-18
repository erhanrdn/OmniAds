import { describe, expect, it } from "vitest";

import { buildGoogleAdsAdvisorWindowMatrix } from "@/lib/google-ads/advisor-window-matrix";

describe("google ads advisor window matrix", () => {
  it("assigns rows once across selected and support windows and reuses identical ranges", () => {
    const matrix = buildGoogleAdsAdvisorWindowMatrix({
      selectedWindow: {
        key: "selected",
        label: "selected 7d",
        customStart: "2026-04-11",
        customEnd: "2026-04-17",
        days: 7,
      },
      supportWindows: [
        {
          key: "alarm_1d",
          label: "alarm 1d",
          customStart: "2026-04-17",
          customEnd: "2026-04-17",
          days: 1,
        },
        {
          key: "alarm_3d",
          label: "alarm 3d",
          customStart: "2026-04-15",
          customEnd: "2026-04-17",
          days: 3,
        },
        {
          key: "alarm_7d",
          label: "alarm 7d",
          customStart: "2026-04-11",
          customEnd: "2026-04-17",
          days: 7,
        },
        {
          key: "operational_28d",
          label: "operational 28d",
          customStart: "2026-03-21",
          customEnd: "2026-04-17",
          days: 28,
        },
        {
          key: "query_governance_56d",
          label: "query governance 56d",
          customStart: "2026-02-22",
          customEnd: "2026-04-17",
          days: 56,
        },
        {
          key: "baseline_84d",
          label: "baseline 84d",
          customStart: "2026-01-25",
          customEnd: "2026-04-17",
          days: 84,
        },
      ],
      campaignDailyRows: [
        {
          entityKey: "cmp_1",
          entityLabel: "Campaign 1",
          date: "2026-04-12",
          updatedAt: "2026-04-17T12:00:00Z",
          spend: 10,
          revenue: 20,
          conversions: 2,
          impressions: 100,
          clicks: 10,
          payloadJson: {},
        } as any,
      ],
      keywordDailyRows: [
        {
          entityKey: "kw_1",
          entityLabel: "keyword",
          date: "2026-04-12",
          updatedAt: "2026-04-17T12:00:00Z",
          spend: 5,
          revenue: 15,
          conversions: 1,
          impressions: 50,
          clicks: 8,
          payloadJson: {},
        } as any,
      ],
      productDailyRows: [
        {
          entityKey: "prod_1",
          entityLabel: "Product 1",
          date: "2026-04-12",
          updatedAt: "2026-04-17T12:00:00Z",
          spend: 7,
          revenue: 21,
          conversions: 2,
          impressions: 60,
          clicks: 6,
          payloadJson: {},
        } as any,
      ],
      hotQueryRows: [
        {
          date: "2026-04-12",
          weekStart: "2026-04-07",
        } as any,
      ],
      queryWeeklyRows: [
        {
          weekStart: "2026-04-07",
        } as any,
      ],
      clusterDailyRows: [
        {
          date: "2026-04-12",
        } as any,
      ],
    });

    expect(matrix.selectedView.slice).toBe(matrix.supportViews.alarm_7d.slice);
    expect(matrix.telemetry.windowCount).toBe(7);
    expect(matrix.telemetry.assignedCampaignRows).toBe(4);
    expect(matrix.telemetry.assignedKeywordRows).toBe(4);
    expect(matrix.telemetry.assignedProductRows).toBe(4);
    expect(matrix.telemetry.windowRowCounts.selected_custom).toEqual(
      expect.objectContaining({
        campaignDailyRows: 1,
        keywordDailyRows: 1,
        productDailyRows: 1,
        hotQueryRows: 1,
        queryWeeklyRows: 1,
        clusterDailyRows: 1,
      }),
    );
    expect(matrix.telemetry.windowRowCounts.alarm_1d).toEqual(
      expect.objectContaining({
        campaignDailyRows: 0,
        keywordDailyRows: 0,
        productDailyRows: 0,
      }),
    );
    expect(matrix.telemetry.windowRowCounts.baseline_84d).toEqual(
      expect.objectContaining({
        campaignDailyRows: 1,
        keywordDailyRows: 1,
        productDailyRows: 1,
      }),
    );
  });
});
