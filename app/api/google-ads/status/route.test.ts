import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/google-ads/status/route";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/integrations", () => ({
  getIntegrationMetadata: vi.fn(),
}));

vi.mock("@/lib/provider-account-snapshots", () => ({
  readProviderAccountSnapshot: vi.fn(),
}));

vi.mock("@/lib/provider-account-assignments", () => ({
  getProviderAccountAssignments: vi.fn(),
}));

vi.mock("@/lib/google-ads/history", () => ({
  GOOGLE_ADS_WAREHOUSE_HISTORY_DAYS: 365,
  addDaysToIsoDate: vi.fn((date: string, days: number) => {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }),
  dayCountInclusive: vi.fn((start: string, end: string) => {
    const startDate = new Date(`${start}T00:00:00Z`);
    const endDate = new Date(`${end}T00:00:00Z`);
    return Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  }),
  getHistoricalWindowStart: vi.fn((end: string, days: number) => {
    const value = new Date(`${end}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() - (days - 1));
    return value.toISOString().slice(0, 10);
  }),
}));

vi.mock("@/lib/google-ads/core-readiness", () => ({
  buildGoogleAdsCoreReadiness: vi.fn(() => ({
    effectiveHistoricalTotalDays: 365,
    overallCompletedDays: 365,
    overallAccountCompletedDays: 365,
    historicalReadyThroughDate: "2026-03-30",
    productPendingSurfaces: [],
    needsBootstrap: false,
    historicalProgressPercent: 100,
  })),
}));

vi.mock("@/lib/google-ads/warehouse", () => ({
  getGoogleAdsCheckpointHealth: vi.fn(),
  getGoogleAdsCoveredDates: vi.fn(),
  getGoogleAdsDailyCoverage: vi.fn(),
  getGoogleAdsAdvisorQueueHealth: vi.fn(),
  getGoogleAdsQueueHealth: vi.fn(),
  getGoogleAdsSyncState: vi.fn(),
  getLatestGoogleAdsSyncHealth: vi.fn(),
}));

vi.mock("@/lib/google-ads/status-machine", () => ({
  decideGoogleAdsAdvisorReadiness: vi.fn(() => ({ ready: false, notReady: true })),
  decideGoogleAdsFullSyncPriority: vi.fn(() => ({
    required: false,
    reason: null,
    targetScopes: [],
  })),
  decideGoogleAdsStatusState: vi.fn(() => "not_connected"),
}));

vi.mock("@/lib/google-ads/advisor-windows", () => ({
  countInclusiveDays: vi.fn((start: string, end: string) => {
    const startDate = new Date(`${start}T00:00:00Z`);
    const endDate = new Date(`${end}T00:00:00Z`);
    return Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  }),
}));

vi.mock("@/lib/google-ads/advisor-snapshots", () => ({
  getLatestGoogleAdsAdvisorSnapshot: vi.fn(),
  isGoogleAdsAdvisorSnapshotFresh: vi.fn(() => false),
}));

vi.mock("@/lib/google-ads/advisor-progress", () => ({
  buildGoogleAdsAdvisorProgress: vi.fn(() => ({
    percent: 0,
    visible: false,
    summary: "Finalizing growth analysis.",
  })),
}));

vi.mock("@/lib/migrations", () => ({
  runMigrations: vi.fn(),
}));

vi.mock("@/lib/provider-readiness", async () => {
  const actual = await vi.importActual<typeof import("@/lib/provider-readiness")>(
    "@/lib/provider-readiness"
  );
  return actual;
});

vi.mock("@/lib/provider-request-governance", () => ({
  getProviderCircuitBreakerRecoveryState: vi.fn(() => "closed"),
  getProviderQuotaBudgetState: vi.fn(() => null),
}));

vi.mock("@/lib/sync/google-ads-sync", () => ({
  buildGoogleAdsLaneAdmissionPolicy: vi.fn(() => ({})),
  getGoogleAdsExtendedRecoveryBlockReason: vi.fn(() => null),
  getGoogleAdsWorkerSchedulingState: vi.fn(() => null),
  isGoogleAdsExtendedCanaryBusiness: vi.fn(() => false),
  isGoogleAdsIncidentSafeModeEnabled: vi.fn(() => false),
}));

const access = await import("@/lib/access");
const db = await import("@/lib/db");
const integrations = await import("@/lib/integrations");
const snapshots = await import("@/lib/provider-account-snapshots");
const assignments = await import("@/lib/provider-account-assignments");
const warehouse = await import("@/lib/google-ads/warehouse");
const advisorSnapshots = await import("@/lib/google-ads/advisor-snapshots");

describe("GET /api/google-ads/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      id: "int_google",
      business_id: "biz",
      provider: "google",
      status: "disconnected",
      provider_account_id: null,
      provider_account_name: null,
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      scopes: null,
      error_message: null,
      metadata: {},
      connected_at: null,
      disconnected_at: null,
      created_at: "",
      updated_at: "",
    });
    vi.mocked(assignments.getProviderAccountAssignments).mockResolvedValue({
      id: "asg_google",
      business_id: "biz",
      provider: "google",
      account_ids: ["acc_1"],
      created_at: "",
      updated_at: "",
    });
    vi.mocked(snapshots.readProviderAccountSnapshot).mockResolvedValue({
      accounts: [{ id: "acc_1", name: "Main", timezone: "UTC" }],
      meta: {
        source: "snapshot",
        sourceHealth: "healthy_cached",
        fetchedAt: null,
        stale: false,
        refreshFailed: false,
        failureClass: null,
        lastError: null,
        lastKnownGoodAvailable: true,
        refreshRequestedAt: null,
        lastRefreshAttemptAt: null,
        nextRefreshAfter: null,
        retryAfterAt: null,
        refreshInProgress: false,
        sourceReason: null,
      },
    });
    vi.mocked(warehouse.getLatestGoogleAdsSyncHealth).mockResolvedValue(null as never);
    vi.mocked(warehouse.getGoogleAdsCheckpointHealth).mockResolvedValue(null as never);
    vi.mocked(warehouse.getGoogleAdsDailyCoverage).mockResolvedValue({
      completed_days: 365,
      ready_through_date: "2026-03-30",
      latest_updated_at: null,
      total_rows: 10,
    } as never);
    vi.mocked(warehouse.getGoogleAdsCoveredDates).mockResolvedValue([] as never);
    vi.mocked(warehouse.getGoogleAdsAdvisorQueueHealth).mockResolvedValue(null as never);
    vi.mocked(warehouse.getGoogleAdsQueueHealth).mockResolvedValue(null as never);
    vi.mocked(warehouse.getGoogleAdsSyncState).mockResolvedValue([]);
    vi.mocked(advisorSnapshots.getLatestGoogleAdsAdvisorSnapshot).mockResolvedValue(null);

    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("COUNT(*)::int AS stale_run_pressure")) return [];
      if (query.includes("COUNT(*)::int AS active_count")) {
        return [{ active_count: 0 }];
      }
      if (query.includes("FROM google_ads_sync_partitions")) return [];
      if (query.includes("FROM google_ads_sync_runs")) return [];
      if (query.includes("COUNT(*) AS row_count")) {
        return [
          {
            row_count: 10,
            first_date: "2025-04-01",
            last_date: "2026-03-30",
            primary_account_timezone: "UTC",
          },
        ];
      }
      throw new Error(`Unexpected query: ${query}`);
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);
  });

  it("uses the account platform timezone for current-day live mode", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T12:30:00.000Z"));
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      id: "int_google",
      business_id: "biz",
      provider: "google",
      status: "connected",
      provider_account_id: null,
      provider_account_name: null,
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      scopes: null,
      error_message: null,
      metadata: {},
      connected_at: null,
      disconnected_at: null,
      created_at: "",
      updated_at: "",
    });
    vi.mocked(snapshots.readProviderAccountSnapshot).mockResolvedValue({
      accounts: [{ id: "acc_1", name: "Main", timezone: "Pacific/Kiritimati" }],
      meta: {
        source: "snapshot",
        sourceHealth: "healthy_cached",
        fetchedAt: null,
        stale: false,
        refreshFailed: false,
        failureClass: null,
        lastError: null,
        lastKnownGoodAvailable: true,
        refreshRequestedAt: null,
        lastRefreshAttemptAt: null,
        nextRefreshAfter: null,
        retryAfterAt: null,
        refreshInProgress: false,
        sourceReason: null,
      },
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/google-ads/status?businessId=biz&startDate=2026-04-08&endDate=2026-04-08"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.servingMode).toBe("warehouse_with_live_overlay");
    expect(payload.currentDateInTimezone).toBe("2026-04-08");
    expect(payload.dataContract).toEqual({
      todayMode: "live_overlay",
      historicalMode: "warehouse_only",
    });
    expect(payload.platformDateBoundary).toMatchObject({
      currentDateInTimezone: "2026-04-08",
      previousDateInTimezone: "2026-04-07",
      selectedRangeMode: "current_day_live",
      mixedCurrentDates: false,
    });
    expect(payload.currentDayLiveStatus).toMatchObject({
      active: true,
      currentDate: "2026-04-08",
      warehouseSegmentEndDate: "2026-04-07",
      liveSegmentStartDate: "2026-04-08",
    });
    expect(payload.advisor.selectedWindow).toMatchObject({
      missingSurfaces: [],
    });
    expect(payload.selectedRangeReadinessBasis).toMatchObject({
      mode: "current_day_live",
      warehouseCoverageIgnored: true,
    });
    vi.useRealTimers();
  });

  it("reports warehouse readiness even when Google is disconnected", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/google-ads/status?businessId=biz")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.state).toBe("not_connected");
    expect(payload.credentialState).toBe("not_connected");
    expect(payload.assignmentState).toBe("assigned");
    expect(payload.warehouseState).toBe("ready");
    expect(payload.completionBasis).toEqual(
      expect.objectContaining({
        requiredScopes: ["account_daily", "campaign_daily"],
        percent: 100,
        complete: true,
      })
    );
  });

  it("returns selected-range readiness for all visible Google Ads extended surfaces", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/google-ads/status?businessId=biz&startDate=2026-03-01&endDate=2026-03-30"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.panel.surfaceStates.map((entry: { scope: string }) => entry.scope)).toEqual([
      "search_term_daily",
      "product_daily",
      "asset_daily",
      "asset_group_daily",
      "geo_daily",
      "device_daily",
      "audience_daily",
    ]);
    expect(payload.rangeCompletionBySurface).toMatchObject({
      search_term_daily: { selectedRange: expect.any(Object), historical: expect.any(Object) },
      product_daily: { selectedRange: expect.any(Object), historical: expect.any(Object) },
      asset_daily: { selectedRange: expect.any(Object), historical: expect.any(Object) },
      asset_group_daily: { selectedRange: expect.any(Object), historical: expect.any(Object) },
      geo_daily: { selectedRange: expect.any(Object), historical: expect.any(Object) },
      device_daily: { selectedRange: expect.any(Object), historical: expect.any(Object) },
      audience_daily: { selectedRange: expect.any(Object), historical: expect.any(Object) },
    });
    expect(payload.domains).toHaveProperty("core");
    expect(payload.domains).toHaveProperty("selectedRange");
    expect(payload.domains).toHaveProperty("advisor");
  });
});
