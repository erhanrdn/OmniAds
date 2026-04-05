import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/meta/status/route";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/integrations", () => ({
  getIntegrationMetadata: vi.fn(),
}));

vi.mock("@/lib/provider-account-assignments", () => ({
  getProviderAccountAssignments: vi.fn(),
}));

vi.mock("@/lib/provider-account-snapshots", () => ({
  readProviderAccountSnapshot: vi.fn(),
}));

vi.mock("@/lib/meta/warehouse", () => ({
  getLatestMetaSyncHealth: vi.fn(),
  getMetaAccountDailyCoverage: vi.fn(),
  getMetaCampaignDailyCoverage: vi.fn(),
  getMetaAccountDailyStats: vi.fn(),
  getMetaAdDailyCoverage: vi.fn(),
  getMetaAdDailyPreviewCoverage: vi.fn(),
  getMetaAdSetDailyCoverage: vi.fn(),
  getMetaCheckpointHealth: vi.fn(),
  getMetaCreativeDailyCoverage: vi.fn(),
  getMetaQueueComposition: vi.fn(),
  getMetaQueueHealth: vi.fn(),
  getMetaRawSnapshotCoverageByEndpoint: vi.fn(),
  getMetaSyncJobHealth: vi.fn(),
  getMetaSyncState: vi.fn(),
}));

vi.mock("@/lib/meta/history", () => ({
  META_WAREHOUSE_HISTORY_DAYS: 365,
  dayCountInclusive: vi.fn((start: string, end: string) => {
    const startDate = new Date(`${start}T00:00:00Z`);
    const endDate = new Date(`${end}T00:00:00Z`);
    return Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  }),
}));

vi.mock("@/lib/meta/constraints", () => ({
  getMetaBreakdownSupportedStart: vi.fn((end: string) => end),
  META_BREAKDOWN_MAX_HISTORY_DAYS: 365,
}));

vi.mock("@/lib/demo-business", () => ({
  isDemoBusinessId: vi.fn(() => false),
  getDemoMetaStatus: vi.fn(),
}));

vi.mock("@/lib/sync/worker-health", () => ({
  getProviderWorkerHealthState: vi.fn(),
}));

vi.mock("@/lib/meta/status-operations", () => ({
  deriveMetaOperationsBlockReason: vi.fn(() => null),
}));

const access = await import("@/lib/access");
const integrations = await import("@/lib/integrations");
const assignments = await import("@/lib/provider-account-assignments");
const snapshots = await import("@/lib/provider-account-snapshots");
const warehouse = await import("@/lib/meta/warehouse");
const workerHealth = await import("@/lib/sync/worker-health");

function getUtcTodayIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

describe("GET /api/meta/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      id: "int_meta",
      business_id: "biz",
      provider: "meta",
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
      id: "asg_1",
      business_id: "biz",
      provider: "meta",
      account_ids: ["act_1"],
      created_at: "",
      updated_at: "",
    });
    vi.mocked(snapshots.readProviderAccountSnapshot).mockResolvedValue({
      accounts: [{ id: "act_1", name: "Main", timezone: "UTC" }],
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
    vi.mocked(warehouse.getLatestMetaSyncHealth).mockResolvedValue(null as never);
    vi.mocked(warehouse.getMetaAccountDailyStats).mockResolvedValue({
      row_count: 10,
      first_date: "2025-04-01",
      last_date: "2026-03-30",
    });
    vi.mocked(warehouse.getMetaAccountDailyCoverage).mockResolvedValue({
      completed_days: 365,
      ready_through_date: "2026-03-30",
    } as never);
    vi.mocked(warehouse.getMetaCampaignDailyCoverage).mockResolvedValue({
      completed_days: 365,
      ready_through_date: "2026-03-30",
    } as never);
    vi.mocked(warehouse.getMetaAdSetDailyCoverage).mockResolvedValue({
      completed_days: 365,
      ready_through_date: "2026-03-30",
    } as never);
    vi.mocked(warehouse.getMetaAdDailyCoverage).mockResolvedValue({
      completed_days: 365,
      ready_through_date: "2026-03-30",
    } as never);
    vi.mocked(warehouse.getMetaCreativeDailyCoverage).mockResolvedValue({
      completed_days: 365,
      ready_through_date: "2026-03-30",
    } as never);
    vi.mocked(warehouse.getMetaAdDailyPreviewCoverage).mockResolvedValue({
      total_rows: 0,
      preview_ready_rows: 0,
    } as never);
    vi.mocked(warehouse.getMetaRawSnapshotCoverageByEndpoint).mockResolvedValue(
      new Map([
        ["breakdown_age", { completed_days: 365, ready_through_date: "2026-03-30" }],
        ["breakdown_country", { completed_days: 365, ready_through_date: "2026-03-30" }],
        [
          "breakdown_publisher_platform,platform_position,impression_device",
          { completed_days: 365, ready_through_date: "2026-03-30" },
        ],
      ]) as never
    );
    vi.mocked(warehouse.getMetaQueueHealth).mockResolvedValue(null as never);
    vi.mocked(warehouse.getMetaQueueComposition).mockResolvedValue(null as never);
    vi.mocked(warehouse.getMetaCheckpointHealth).mockResolvedValue(null as never);
    vi.mocked(warehouse.getMetaSyncJobHealth).mockResolvedValue(null as never);
    vi.mocked(warehouse.getMetaSyncState).mockResolvedValue([]);
    vi.mocked(workerHealth.getProviderWorkerHealthState).mockResolvedValue(null as never);
  });

  it("reports warehouse readiness even when the provider is disconnected", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/meta/status?businessId=biz")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.state).toBe("not_connected");
    expect(payload.credentialState).toBe("not_connected");
    expect(payload.assignmentState).toBe("assigned");
    expect(payload.warehouseState).toBe("ready");
    expect(payload.pageReadiness).toMatchObject({
      state: "not_connected",
      usable: false,
      complete: false,
      missingRequiredSurfaces: [
        "summary",
        "campaigns",
        "breakdowns.age",
        "breakdowns.location",
        "breakdowns.placement",
      ],
    });
  });

  it("keeps historical core progress while removing creative backlog from the summary", async () => {
    const today = getUtcTodayIso();
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      id: "int_meta",
      business_id: "biz",
      provider: "meta",
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
    vi.mocked(warehouse.getMetaQueueHealth).mockResolvedValue({
      queueDepth: 12,
      leasedPartitions: 1,
      retryableFailedPartitions: 0,
      deadLetterPartitions: 0,
      latestCoreActivityAt: "2026-04-03T09:00:00.000Z",
      latestExtendedActivityAt: "2026-04-03T09:00:00.000Z",
      latestMaintenanceActivityAt: null,
      oldestQueuedPartition: "2026-03-01",
      historicalCoreQueueDepth: 0,
      historicalCoreLeasedPartitions: 0,
      extendedRecentQueueDepth: 0,
      extendedRecentLeasedPartitions: 0,
      extendedHistoricalQueueDepth: 12,
      extendedHistoricalLeasedPartitions: 1,
    } as never);
    vi.mocked(warehouse.getMetaAccountDailyCoverage).mockImplementation(async (input: {
      startDate: string;
      endDate: string;
    }) => {
      if (input.startDate === today && input.endDate === today) {
        return {
          completed_days: 1,
          ready_through_date: today,
        } as never;
      }
      const start = new Date(`${input.startDate}T00:00:00Z`).getTime();
      const end = new Date(`${input.endDate}T00:00:00Z`).getTime();
      const spanDays = Math.floor((end - start) / 86_400_000) + 1;
      if (spanDays <= 14) {
        return {
          completed_days: 14,
          ready_through_date: "2026-04-02",
        } as never;
      }
      return {
        completed_days: 35,
        ready_through_date: "2026-04-02",
      } as never;
    });
    vi.mocked(warehouse.getMetaCampaignDailyCoverage).mockImplementation(async (input: {
      startDate: string;
      endDate: string;
    }) => {
      if (input.startDate === today && input.endDate === today) {
        return {
          completed_days: 1,
          ready_through_date: today,
        } as never;
      }
      const start = new Date(`${input.startDate}T00:00:00Z`).getTime();
      const end = new Date(`${input.endDate}T00:00:00Z`).getTime();
      const spanDays = Math.floor((end - start) / 86_400_000) + 1;
      if (spanDays <= 14) {
        return {
          completed_days: 14,
          ready_through_date: "2026-04-02",
        } as never;
      }
      return {
        completed_days: 35,
        ready_through_date: "2026-04-02",
      } as never;
    });
    vi.mocked(warehouse.getMetaAdSetDailyCoverage).mockResolvedValue({
      completed_days: 35,
      ready_through_date: "2026-04-02",
    } as never);
    vi.mocked(warehouse.getMetaAdDailyCoverage).mockResolvedValue({
      completed_days: 24,
      ready_through_date: "2026-04-02",
    } as never);
    vi.mocked(warehouse.getMetaCreativeDailyCoverage).mockResolvedValue({
      completed_days: 24,
      ready_through_date: "2026-04-02",
    } as never);
    vi.mocked(warehouse.getMetaRawSnapshotCoverageByEndpoint).mockResolvedValue(
      new Map([
        ["breakdown_age", { completed_days: 10, ready_through_date: "2026-04-02" }],
        ["breakdown_country", { completed_days: 10, ready_through_date: "2026-04-02" }],
        [
          "breakdown_publisher_platform,platform_position,impression_device",
          { completed_days: 10, ready_through_date: "2026-04-02" },
        ],
      ]) as never
    );
    vi.mocked(warehouse.getMetaSyncState).mockImplementation(async ({ scope }: { scope: string }) => {
      if (scope === "account_daily") {
        return [
          {
            providerAccountId: "act_1",
            completedDays: 35,
            readyThroughDate: "2026-04-02",
            latestBackgroundActivityAt: "2026-04-03T09:00:00.000Z",
            deadLetterCount: 0,
          },
        ] as never;
      }
      return [] as never;
    });

    const response = await GET(
      new NextRequest(
        `http://localhost/api/meta/status?businessId=biz&startDate=${today}&endDate=${today}`
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.state).toBe("stale");
    expect(payload.readinessLevel).toBe("ready");
    expect(payload.domainReadiness?.summary ?? null).toBeNull();
    expect(payload.currentCoreUsable).toBe(true);
    expect(payload.currentCoreProgressPercent).toBe(100);
    expect(payload.historicalArchiveComplete).toBe(false);
    expect(payload.historicalArchiveProgressPercent).toBe(10);
    expect(payload.latestSync?.progressPercent).toBe(100);
    expect(payload.latestSync?.completedDays).toBe(1);
    expect(payload.latestSync?.totalDays).toBe(1);
    expect(payload.latestSync?.readyThroughDate).toBe(today);
    expect(payload.pageReadiness).toMatchObject({
      state: "ready",
      usable: true,
      complete: true,
      selectedRangeMode: "current_day_live",
    });
  });

  it("reports selected-range truth as ready when the requested range is complete and no blocker is present", async () => {
    const today = getUtcTodayIso();
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      id: "int_meta",
      business_id: "biz",
      provider: "meta",
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
    vi.mocked(warehouse.getMetaQueueHealth).mockResolvedValue({
      queueDepth: 0,
      leasedPartitions: 0,
      retryableFailedPartitions: 0,
      deadLetterPartitions: 0,
      latestCoreActivityAt: null,
      latestExtendedActivityAt: null,
      latestMaintenanceActivityAt: null,
      oldestQueuedPartition: null,
      historicalCoreQueueDepth: 0,
      historicalCoreLeasedPartitions: 0,
      extendedRecentQueueDepth: 0,
      extendedRecentLeasedPartitions: 0,
      extendedHistoricalQueueDepth: 0,
      extendedHistoricalLeasedPartitions: 0,
    } as never);
    vi.mocked(warehouse.getMetaAccountDailyCoverage).mockResolvedValue({
      completed_days: 1,
      ready_through_date: today,
    } as never);
    vi.mocked(warehouse.getMetaCampaignDailyCoverage).mockResolvedValue({
      completed_days: 1,
      ready_through_date: today,
    } as never);

    const response = await GET(
      new NextRequest(
        `http://localhost/api/meta/status?businessId=biz&startDate=${today}&endDate=${today}`
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.state).toBe("ready");
    expect(payload.readinessLevel).toBe("ready");
    expect(payload.currentCoreUsable).toBe(true);
    expect(payload.latestSync?.progressPercent).toBe(100);
    expect(payload.latestSync?.completedDays).toBe(1);
    expect(payload.latestSync?.totalDays).toBe(1);
    expect(payload.pageReadiness).toMatchObject({
      state: "ready",
      usable: true,
      complete: true,
      selectedRangeMode: "current_day_live",
      missingRequiredSurfaces: [],
    });
  });

  it("reports selected-range truth as partial when breakdowns are missing but summary and campaigns are ready", async () => {
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      id: "int_meta",
      business_id: "biz",
      provider: "meta",
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
    vi.mocked(warehouse.getMetaAccountDailyCoverage).mockResolvedValue({
      completed_days: 2,
      ready_through_date: "2026-04-02",
    } as never);
    vi.mocked(warehouse.getMetaCampaignDailyCoverage).mockResolvedValue({
      completed_days: 2,
      ready_through_date: "2026-04-02",
    } as never);
    vi.mocked(warehouse.getMetaAdSetDailyCoverage).mockResolvedValue({
      completed_days: 0,
      ready_through_date: null,
    } as never);
    vi.mocked(warehouse.getMetaRawSnapshotCoverageByEndpoint).mockResolvedValue(
      new Map([
        ["breakdown_age", { completed_days: 1, ready_through_date: "2026-04-01" }],
        ["breakdown_country", { completed_days: 1, ready_through_date: "2026-04-01" }],
        [
          "breakdown_publisher_platform,platform_position,impression_device",
          { completed_days: 1, ready_through_date: "2026-04-01" },
        ],
      ]) as never
    );

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/status?businessId=biz&startDate=2026-04-01&endDate=2026-04-02"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.pageReadiness).toMatchObject({
      state: "partial",
      usable: true,
      complete: false,
      selectedRangeMode: "historical_warehouse",
      missingRequiredSurfaces: [
        "breakdowns.age",
        "breakdowns.location",
        "breakdowns.placement",
      ],
    });
    expect(payload.pageReadiness.requiredSurfaces.summary.state).toBe("ready");
    expect(payload.pageReadiness.requiredSurfaces.campaigns.state).toBe("ready");
    expect(payload.pageReadiness.optionalSurfaces.adsets.countsForPageCompleteness).toBe(false);
    expect(payload.pageReadiness.optionalSurfaces.recommendations.countsForPageCompleteness).toBe(false);
  });

  it("reports selected-range truth as syncing when no required surface is usable and active work exists", async () => {
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      id: "int_meta",
      business_id: "biz",
      provider: "meta",
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
    vi.mocked(warehouse.getMetaAccountDailyCoverage).mockResolvedValue({
      completed_days: 0,
      ready_through_date: null,
    } as never);
    vi.mocked(warehouse.getMetaCampaignDailyCoverage).mockResolvedValue({
      completed_days: 0,
      ready_through_date: null,
    } as never);
    vi.mocked(warehouse.getMetaAdSetDailyCoverage).mockResolvedValue({
      completed_days: 0,
      ready_through_date: null,
    } as never);
    vi.mocked(warehouse.getMetaRawSnapshotCoverageByEndpoint).mockResolvedValue(
      new Map([
        ["breakdown_age", { completed_days: 0, ready_through_date: null }],
        ["breakdown_country", { completed_days: 0, ready_through_date: null }],
        [
          "breakdown_publisher_platform,platform_position,impression_device",
          { completed_days: 0, ready_through_date: null },
        ],
      ]) as never
    );
    vi.mocked(warehouse.getMetaQueueHealth).mockResolvedValue({
      queueDepth: 4,
      leasedPartitions: 1,
      retryableFailedPartitions: 0,
      deadLetterPartitions: 0,
      latestCoreActivityAt: "2026-04-03T09:00:00.000Z",
      latestExtendedActivityAt: null,
      latestMaintenanceActivityAt: null,
      oldestQueuedPartition: "2026-04-01",
      historicalCoreQueueDepth: 4,
      historicalCoreLeasedPartitions: 1,
      extendedRecentQueueDepth: 0,
      extendedRecentLeasedPartitions: 0,
      extendedHistoricalQueueDepth: 0,
      extendedHistoricalLeasedPartitions: 0,
    } as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/status?businessId=biz&startDate=2026-04-02&endDate=2026-04-02"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.pageReadiness).toMatchObject({
      state: "syncing",
      usable: false,
      complete: false,
      selectedRangeMode: "historical_warehouse",
    });
    expect(payload.pageReadiness.requiredSurfaces.summary.state).toBe("syncing");
    expect(payload.pageReadiness.requiredSurfaces.campaigns.state).toBe("syncing");
  });

  it("reports current-day selected-range truth as partial when live breakdowns are still preparing", async () => {
    const today = getUtcTodayIso();
    vi.mocked(integrations.getIntegrationMetadata).mockResolvedValue({
      id: "int_meta",
      business_id: "biz",
      provider: "meta",
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
    vi.mocked(warehouse.getMetaAccountDailyCoverage).mockResolvedValue({
      completed_days: 1,
      ready_through_date: today,
    } as never);
    vi.mocked(warehouse.getMetaCampaignDailyCoverage).mockResolvedValue({
      completed_days: 1,
      ready_through_date: today,
    } as never);
    vi.mocked(warehouse.getMetaRawSnapshotCoverageByEndpoint).mockResolvedValue(
      new Map([
        ["breakdown_age", { completed_days: 0, ready_through_date: null }],
        ["breakdown_country", { completed_days: 0, ready_through_date: null }],
        [
          "breakdown_publisher_platform,platform_position,impression_device",
          { completed_days: 0, ready_through_date: null },
        ],
      ]) as never
    );
    vi.mocked(warehouse.getMetaQueueHealth).mockResolvedValue({
      queueDepth: 1,
      leasedPartitions: 1,
      retryableFailedPartitions: 0,
      deadLetterPartitions: 0,
      latestCoreActivityAt: `${today}T09:00:00.000Z`,
      latestExtendedActivityAt: null,
      latestMaintenanceActivityAt: null,
      oldestQueuedPartition: today,
      historicalCoreQueueDepth: 0,
      historicalCoreLeasedPartitions: 0,
      extendedRecentQueueDepth: 1,
      extendedRecentLeasedPartitions: 1,
      extendedHistoricalQueueDepth: 0,
      extendedHistoricalLeasedPartitions: 0,
    } as never);

    const response = await GET(
      new NextRequest(
        `http://localhost/api/meta/status?businessId=biz&startDate=${today}&endDate=${today}`
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.pageReadiness).toMatchObject({
      state: "partial",
      usable: true,
      complete: false,
      selectedRangeMode: "current_day_live",
      missingRequiredSurfaces: [
        "breakdowns.age",
        "breakdowns.location",
        "breakdowns.placement",
      ],
    });
  });
});
