import { describe, expect, it } from "vitest";
import { dedupeGoogleAdsWarehouseRows } from "@/lib/google-ads/warehouse";
import type { GoogleAdsWarehouseDailyRow } from "@/lib/google-ads/warehouse-types";

function buildRow(
  overrides: Partial<GoogleAdsWarehouseDailyRow> = {}
): GoogleAdsWarehouseDailyRow {
  return {
    businessId: "biz_1",
    providerAccountId: "acct_1",
    date: "2026-03-30",
    accountTimezone: "UTC",
    accountCurrency: "USD",
    entityKey: "entity_1",
    entityLabel: "Entity",
    campaignId: "cmp_1",
    campaignName: "Campaign",
    adGroupId: null,
    adGroupName: null,
    status: "enabled",
    channel: "search",
    classification: "brand",
    payloadJson: { source: "first" },
    spend: 1,
    revenue: 2,
    conversions: 3,
    impressions: 4,
    clicks: 5,
    ctr: 6,
    cpc: 7,
    cpa: 8,
    roas: 9,
    conversionRate: 10,
    interactionRate: 11,
    sourceSnapshotId: "snap_1",
    ...overrides,
  };
}

describe("dedupeGoogleAdsWarehouseRows", () => {
  it("keeps the last conflicting row for a warehouse conflict key", () => {
    const rows = [
      buildRow({
        entityKey: "entity_1",
        payloadJson: { source: "first" },
        spend: 1,
      }),
      buildRow({
        entityKey: "entity_2",
        payloadJson: { source: "middle" },
        spend: 2,
      }),
      buildRow({
        entityKey: "entity_1",
        payloadJson: { source: "last" },
        spend: 99,
      }),
    ];

    const result = dedupeGoogleAdsWarehouseRows(rows);

    expect(result.duplicateCount).toBe(1);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.entityKey)).toEqual(["entity_2", "entity_1"]);
    expect(result.rows.find((row) => row.entityKey === "entity_1")?.spend).toBe(99);
    expect(result.rows.find((row) => row.entityKey === "entity_1")?.payloadJson).toEqual({
      source: "last",
    });
  });
});
