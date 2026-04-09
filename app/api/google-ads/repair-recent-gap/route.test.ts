import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/db-schema-readiness", () => ({
  getDbSchemaReadiness: vi.fn(),
}));

vi.mock("@/lib/google-ads/warehouse", () => ({
  forceReplayGoogleAdsPoisonedPartitions: vi.fn(),
  getGoogleAdsCoveredDates: vi.fn(),
  replayGoogleAdsDeadLetterPartitions: vi.fn(),
}));

vi.mock("@/lib/google-ads/history", () => ({
  addDaysToIsoDate: vi.fn((date: string, days: number) => {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }),
  enumerateDays: vi.fn(() => ["2026-04-07"]),
}));

vi.mock("@/lib/sync/google-ads-sync", () => ({
  refreshGoogleAdsSyncStateForBusiness: vi.fn(),
  runGoogleAdsTargetedRepair: vi.fn(),
}));

vi.mock("@/lib/migrations", () => ({
  runMigrations: vi.fn(),
}));

const access = await import("@/lib/access");
const db = await import("@/lib/db");
const schemaReadiness = await import("@/lib/db-schema-readiness");
const warehouse = await import("@/lib/google-ads/warehouse");
const googleAdsSync = await import("@/lib/sync/google-ads-sync");
const migrations = await import("@/lib/migrations");
const { POST } = await import("@/app/api/google-ads/repair-recent-gap/route");

describe("POST /api/google-ads/repair-recent-gap", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(schemaReadiness.getDbSchemaReadiness).mockResolvedValue({
      ready: true,
      missingTables: [],
      checkedAt: "2026-04-09T00:00:00.000Z",
    });
    vi.mocked(warehouse.getGoogleAdsCoveredDates).mockResolvedValue(["2026-04-07"] as never);
    vi.mocked(db.getDb).mockReturnValue(vi.fn().mockResolvedValue([]) as never);
  });

  it("fails fast when repair tables are not ready", async () => {
    vi.mocked(schemaReadiness.getDbSchemaReadiness).mockResolvedValue({
      ready: false,
      missingTables: ["google_ads_sync_jobs"],
      checkedAt: "2026-04-09T00:00:00.000Z",
    });

    const request = new NextRequest(
      "http://localhost/api/google-ads/repair-recent-gap?businessId=biz",
      { method: "POST", body: JSON.stringify({}) },
    );
    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      error: "schema_not_ready",
      message:
        "Google Ads recent-gap repair is unavailable until request-external migrations are applied.",
      provider: "google_ads",
      missingTables: ["google_ads_sync_jobs"],
      checkedAt: "2026-04-09T00:00:00.000Z",
    });
    expect(warehouse.getGoogleAdsCoveredDates).not.toHaveBeenCalled();
    expect(migrations.runMigrations).not.toHaveBeenCalled();
  });

  it("preserves the no-gap response contract without migrations", async () => {
    const request = new NextRequest(
      "http://localhost/api/google-ads/repair-recent-gap?businessId=biz",
      { method: "POST", body: JSON.stringify({}) },
    );
    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      outcome: "no_missing_recent_gap",
      targetWindow: expect.objectContaining({
        startDate: expect.any(String),
        endDate: expect.any(String),
        source: "recent_window",
      }),
      chosenScope: null,
      chosenStartDate: null,
      chosenEndDate: null,
      reason:
        "No missing recent gap found in search_term_daily, product_daily, or asset_daily.",
    });
    expect(googleAdsSync.runGoogleAdsTargetedRepair).not.toHaveBeenCalled();
    expect(migrations.runMigrations).not.toHaveBeenCalled();
  });
});
