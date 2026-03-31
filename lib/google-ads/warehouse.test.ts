import { beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
  getDbWithTimeout: vi.fn(),
}));

vi.mock("@/lib/migrations", () => ({
  runMigrations: vi.fn(),
}));

const db = await import("@/lib/db");
const { replayGoogleAdsDeadLetterPartitions, upsertGoogleAdsSyncCheckpoint } = await import(
  "@/lib/google-ads/warehouse"
);

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

describe("google ads warehouse ownership safety", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns null when checkpoint upsert loses partition ownership", async () => {
    const sql = vi.fn().mockResolvedValue([]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const checkpointId = await upsertGoogleAdsSyncCheckpoint({
      partitionId: "partition-1",
      businessId: "biz-1",
      providerAccountId: "acct-1",
      checkpointScope: "campaign_daily",
      phase: "bulk_upsert",
      status: "running",
      pageIndex: 0,
      attemptCount: 1,
      leaseOwner: "worker-1",
    });

    expect(checkpointId).toBeNull();
  });

  it("keeps active leased dead-letter partitions out of replay", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.join(" "));
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    await replayGoogleAdsDeadLetterPartitions({
      businessId: "biz-1",
      scope: "campaign_daily",
    });

    expect(queries[0]).toContain("COALESCE(lease_expires_at, now() - interval '1 second') <= now()");
  });
});
