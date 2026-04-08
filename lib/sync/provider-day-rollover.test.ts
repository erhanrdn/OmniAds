import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/migrations", () => ({
  runMigrations: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/provider-platform-date", () => ({
  getProviderPlatformDateBoundaries: vi.fn(),
}));

const migrations = await import("@/lib/migrations");
const db = await import("@/lib/db");
const platformDate = await import("@/lib/provider-platform-date");
const rollover = await import("@/lib/sync/provider-day-rollover");

describe("provider day rollover state", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(migrations.runMigrations).mockResolvedValue(undefined);
  });

  it("detects rollover on first observation and stores provider-account D-1 target", async () => {
    const sql = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);
    vi.mocked(platformDate.getProviderPlatformDateBoundaries).mockResolvedValue([
      {
        provider: "google",
        businessId: "biz-1",
        providerAccountId: "acct-1",
        timeZone: "America/Los_Angeles",
        currentDate: "2026-04-08",
        previousDate: "2026-04-07",
        isPrimary: true,
      },
    ] as never);

    const result = await rollover.syncProviderDayRolloverState({
      provider: "google_ads",
      businessId: "biz-1",
    });

    expect(result).toEqual([
      expect.objectContaining({
        provider: "google_ads",
        providerAccountId: "acct-1",
        currentD1TargetDate: "2026-04-07",
        rolloverDetected: true,
      }),
    ]);
  });

  it("does not flag rollover when the same provider date is observed again", async () => {
    const sql = vi
      .fn()
      .mockResolvedValueOnce([
        {
          provider: "meta",
          business_id: "biz-1",
          provider_account_id: "act_1",
          last_observed_current_date: "2026-04-08",
          current_d1_target_date: "2026-04-07",
          rollover_detected_at: "2026-04-08T00:00:01.000Z",
          d1_finalize_started_at: "2026-04-08T00:00:05.000Z",
          d1_finalize_completed_at: null,
          last_recovery_at: null,
          created_at: "2026-04-08T00:00:01.000Z",
          updated_at: "2026-04-08T00:00:05.000Z",
        },
      ])
      .mockResolvedValueOnce([]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);
    vi.mocked(platformDate.getProviderPlatformDateBoundaries).mockResolvedValue([
      {
        provider: "meta",
        businessId: "biz-1",
        providerAccountId: "act_1",
        timeZone: "America/Anchorage",
        currentDate: "2026-04-08",
        previousDate: "2026-04-07",
        isPrimary: true,
      },
    ] as never);

    const result = await rollover.syncProviderDayRolloverState({
      provider: "meta",
      businessId: "biz-1",
    });

    expect(result).toEqual([
      expect.objectContaining({
        provider: "meta",
        providerAccountId: "act_1",
        currentD1TargetDate: "2026-04-07",
        rolloverDetected: false,
        d1FinalizeStartedAt: "2026-04-08T00:00:05.000Z",
      }),
    ]);
  });
});
