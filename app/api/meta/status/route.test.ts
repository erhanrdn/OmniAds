import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/meta/status/route";
import { assertMetaStatusPageContract } from "@/lib/meta/page-route-contract.test-helpers";
import {
  META_PAGE_OPTIONAL_SURFACES,
  META_PAGE_REQUIRED_SURFACE_ORDER,
} from "@/lib/meta/page-contract";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
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
  getMetaAuthoritativeDayVerification: vi.fn(),
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

vi.mock("@/lib/meta/history", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/meta/history")>();
  return {
    ...actual,
    META_WAREHOUSE_HISTORY_DAYS: 365,
    dayCountInclusive: vi.fn((start: string, end: string) => {
      const startDate = new Date(`${start}T00:00:00Z`);
      const endDate = new Date(`${end}T00:00:00Z`);
      return Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
    }),
  };
});

vi.mock("@/lib/meta/constraints", () => ({
  getMetaBreakdownSupportedStart: vi.fn(() => "2000-01-01"),
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

vi.mock("@/lib/meta/live", () => ({
  getMetaCurrentDayLiveAvailability: vi.fn(),
}));

vi.mock("@/lib/sync/meta-sync", () => ({
  getMetaSelectedRangeTruthReadiness: vi.fn(),
}));

vi.mock("@/lib/meta/warehouse-retention", () => ({
  getMetaProtectedPublishedTruthReview: vi.fn(async () => ({
    runtimeAvailable: false,
    asOfDate: "2026-04-13",
    scope: {
      kind: "selected_businesses",
      businessIds: ["biz"],
    },
    hasNonZeroProtectedPublishedRows: false,
    protectedPublishedRows: 0,
    activePublicationPointerRows: 0,
    protectedTruthClassesPresent: [],
    protectedTruthClassesAbsent: [
      "core_daily_rows",
      "breakdown_daily_rows",
      "active_publication_pointers",
      "active_published_slice_versions",
      "active_source_manifests",
      "published_day_state",
    ],
    classes: [],
  })),
  getLatestMetaRetentionCanaryRun: vi.fn(),
  getLatestMetaRetentionRun: vi.fn(),
  getMetaRetentionCanaryRuntimeStatus: vi.fn(() => ({
    runtimeAvailable: false,
    globalExecutionEnabled: false,
    businessId: "biz",
    executeRequested: false,
    executeAllowed: false,
    mode: "dry_run",
    gateReason:
      "Scoped Meta retention verification defaults to dry-run until --execute is supplied.",
  })),
  getMetaRetentionDeleteScope: vi.fn(() => "horizon_outside_residue"),
  getMetaRetentionRunMetadata: vi.fn(() => ({
    scope: {
      kind: "all_businesses",
      businessIds: null,
    },
    executionDisposition: "dry_run",
    canary: null,
  })),
  getMetaRetentionRunRows: vi.fn(() => []),
  getMetaRetentionRuntimeStatus: vi.fn(() => ({
    runtimeAvailable: false,
    executionEnabled: false,
    mode: "dry_run",
    gateReason: "Meta retention execution is disabled by default. Dry-run remains available.",
  })),
  summarizeMetaRetentionRunRows: vi.fn(() => null),
}));

const access = await import("@/lib/access");
const db = await import("@/lib/db");
const integrations = await import("@/lib/integrations");
const assignments = await import("@/lib/provider-account-assignments");
const snapshots = await import("@/lib/provider-account-snapshots");
const warehouse = await import("@/lib/meta/warehouse");
const workerHealth = await import("@/lib/sync/worker-health");
const live = await import("@/lib/meta/live");
const constraints = await import("@/lib/meta/constraints");
const metaSync = await import("@/lib/sync/meta-sync");
const metaRetention = await import("@/lib/meta/warehouse-retention");

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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T12:00:00Z"));
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
    vi.mocked(warehouse.getMetaAuthoritativeDayVerification).mockResolvedValue({
      businessId: "biz",
      providerAccountId: "act_1",
      day: "2026-04-12",
      verificationState: "finalized_verified",
      sourceManifestState: "completed",
      validationState: "finalized_verified",
      activePublication: {
        publishedAt: "2026-04-13T00:05:00.000Z",
        publicationReason: "finalize_day",
        activeSliceVersionId: "slice-1",
      },
      surfaces: [],
      lastFailure: null,
      detectorReasonCodes: [],
      repairBacklog: 0,
      deadLetters: 0,
      staleLeases: 0,
      queuedPartitions: 0,
      leasedPartitions: 0,
    } as never);
    const sql = vi.fn(async () => [
      {
        has_account_row: false,
        has_campaign_row: false,
        active_finalize_count: 0,
      },
    ]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);
    vi.mocked(workerHealth.getProviderWorkerHealthState).mockResolvedValue(null as never);
    vi.mocked(metaRetention.getLatestMetaRetentionRun).mockResolvedValue(null as never);
    vi.mocked(metaRetention.getLatestMetaRetentionCanaryRun).mockResolvedValue(null as never);
    vi.mocked(metaRetention.getMetaRetentionRunRows).mockReturnValue([] as never);
    vi.mocked(metaRetention.getMetaRetentionRunMetadata).mockReturnValue({
      scope: {
        kind: "all_businesses",
        businessIds: null,
      },
      executionDisposition: "dry_run",
      canary: null,
    } as never);
    vi.mocked(metaRetention.summarizeMetaRetentionRunRows).mockReturnValue(null as never);
    vi.mocked(metaRetention.getMetaProtectedPublishedTruthReview).mockResolvedValue({
      runtimeAvailable: false,
      asOfDate: "2026-04-13",
      scope: {
        kind: "selected_businesses",
        businessIds: ["biz"],
      },
      hasNonZeroProtectedPublishedRows: false,
      protectedPublishedRows: 0,
      activePublicationPointerRows: 0,
      protectedTruthClassesPresent: [],
      protectedTruthClassesAbsent: [
        "core_daily_rows",
        "breakdown_daily_rows",
        "active_publication_pointers",
        "active_published_slice_versions",
        "active_source_manifests",
        "published_day_state",
      ],
      classes: [],
    } as never);
    vi.mocked(live.getMetaCurrentDayLiveAvailability).mockResolvedValue({
      summaryAvailable: true,
      campaignsAvailable: true,
    } as never);
    vi.mocked(metaSync.getMetaSelectedRangeTruthReadiness).mockResolvedValue({
      truthReady: true,
      state: "finalized_verified",
      verificationState: "finalized_verified",
      totalDays: 1,
      completedCoreDays: 1,
      blockingReasons: [],
      reasonCounts: {},
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports warehouse readiness even when the provider is disconnected", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/meta/status?businessId=biz")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertMetaStatusPageContract(payload);
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
    expect(payload.completionBasis).toEqual(
      expect.objectContaining({
        requiredScopes: ["account_daily", "campaign_daily"],
        percent: 100,
        complete: true,
      })
    );
    expect(payload.retention).toMatchObject({
      runtimeAvailable: false,
      executionEnabled: false,
      defaultExecutionDisabled: true,
      mode: "dry_run",
      policy: {
        coreDailyAuthoritativeDays: 761,
        breakdownDailyAuthoritativeDays: 394,
      },
      latestRun: null,
      summary: null,
      tables: [],
      scopedExecution: {
        available: true,
        command: "npm run meta:retention-canary -- biz",
        executeCommand: "npm run meta:retention-canary -- biz --execute",
        globalExecutionEnabled: false,
        executeAllowed: false,
      },
    });
    expect(payload.dataContract).toEqual({
      todayMode: "live_only",
      historicalInsideHorizon: "published_verified_truth",
      historicalOutsideCoreHorizon: "live_fallback",
      breakdownOutsideHorizon: "unsupported_degraded",
    });
  });

  it("surfaces Meta retention dry-run protection evidence", async () => {
    vi.mocked(metaRetention.getMetaRetentionRuntimeStatus).mockReturnValue({
      runtimeAvailable: true,
      executionEnabled: false,
      mode: "dry_run",
      gateReason:
        "Meta retention execution is disabled by default. Dry-run remains available.",
    } as never);
    vi.mocked(metaRetention.getLatestMetaRetentionRun).mockResolvedValue({
      id: "meta_retention_run_1",
      executionMode: "dry_run",
      executionEnabled: false,
      skippedDueToActiveLease: false,
      totalDeletedRows: 0,
      summaryJson: {},
      errorMessage: null,
      startedAt: "2026-04-13T12:00:00.000Z",
      finishedAt: "2026-04-13T12:01:00.000Z",
      createdAt: "2026-04-13T12:00:00.000Z",
      updatedAt: "2026-04-13T12:01:00.000Z",
    } as never);
    vi.mocked(metaRetention.getMetaRetentionRunRows).mockReturnValue([
      {
        tier: "core_authoritative",
        label: "Meta core daily authoritative",
        tableName: "meta_account_daily",
        summaryKey: "meta_account_daily",
        retentionDays: 761,
        cutoffDate: "2024-03-13",
        executionEnabled: false,
        mode: "dry_run",
        observed: true,
        eligibleRows: 12,
        eligibleDistinctDays: 3,
        oldestEligibleValue: "2024-03-01",
        newestEligibleValue: "2024-03-12",
        retainedRows: 144,
        latestRetainedValue: "2026-04-12",
        protectedRows: 8,
        protectedDistinctDays: 2,
        latestProtectedValue: "2026-04-12",
        deletedRows: 0,
        surfaceFilter: null,
      },
      {
        tier: "breakdown_authoritative",
        label: "Meta authoritative publication pointers",
        tableName: "meta_authoritative_publication_pointers",
        summaryKey: "meta_authoritative_publication_pointers:breakdown",
        retentionDays: 394,
        cutoffDate: "2025-03-15",
        executionEnabled: false,
        mode: "dry_run",
        observed: true,
        eligibleRows: 4,
        eligibleDistinctDays: 1,
        oldestEligibleValue: "2025-03-14",
        newestEligibleValue: "2025-03-14",
        retainedRows: 10,
        latestRetainedValue: "2026-04-12",
        protectedRows: 10,
        protectedDistinctDays: 4,
        latestProtectedValue: "2026-04-12",
        deletedRows: 0,
        surfaceFilter: ["breakdown_daily"],
      },
    ] as never);
    vi.mocked(metaRetention.getMetaRetentionRunMetadata).mockReturnValue({
      scope: {
        kind: "all_businesses",
        businessIds: null,
      },
      executionDisposition: "dry_run",
      canary: null,
    } as never);
    vi.mocked(metaRetention.summarizeMetaRetentionRunRows).mockReturnValue({
      observedTables: 2,
      tablesWithDeletableRows: 2,
      tablesWithProtectedRows: 2,
      deletableRows: 16,
      retainedRows: 154,
      protectedRows: 18,
    } as never);

    const response = await GET(
      new NextRequest("http://localhost/api/meta/status?businessId=biz")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.retention).toMatchObject({
      runtimeAvailable: true,
      executionEnabled: false,
      defaultExecutionDisabled: true,
      mode: "dry_run",
      latestRun: {
        id: "meta_retention_run_1",
        executionMode: "dry_run",
        totalDeletedRows: 0,
      },
      summary: {
        observedTables: 2,
        deletableRows: 16,
        protectedRows: 18,
      },
      scopedExecution: {
        command: "npm run meta:retention-canary -- biz",
        executeCommand: "npm run meta:retention-canary -- biz --execute",
        globalExecutionEnabled: false,
        executeAllowed: false,
      },
    });
    expect(payload.retention.tables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: "meta_account_daily",
          deletableRows: 12,
          protectedRows: 8,
          newestDeletableValue: "2024-03-12",
        }),
        expect.objectContaining({
          tableName: "meta_authoritative_publication_pointers",
          surfaceFilter: ["breakdown_daily"],
          protectedRows: 10,
        }),
      ]),
    );
  });

  it("surfaces Meta retention scoped execute posture and latest scoped proof", async () => {
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
    vi.mocked(workerHealth.getProviderWorkerHealthState).mockResolvedValue({
      workerHealthy: true,
      heartbeatAgeMs: 30_000,
      ownerWorkerId: "worker_1",
      consumeStage: "consume_started",
    } as never);
    vi.mocked(metaRetention.getMetaRetentionCanaryRuntimeStatus).mockReturnValue({
      runtimeAvailable: true,
      globalExecutionEnabled: false,
      businessId: "biz",
      executeRequested: false,
      executeAllowed: false,
      mode: "dry_run",
      gateReason:
        "Scoped Meta retention verification defaults to dry-run until --execute is supplied.",
    } as never);
    vi.mocked(metaRetention.getLatestMetaRetentionRun).mockResolvedValue(null);
    vi.mocked(metaRetention.getLatestMetaRetentionCanaryRun).mockResolvedValue({
      id: "meta_retention_canary_run_1",
      executionMode: "execute",
      executionEnabled: false,
      skippedDueToActiveLease: false,
      totalDeletedRows: 5,
      summaryJson: {},
      errorMessage: null,
      startedAt: "2026-04-13T12:00:00.000Z",
      finishedAt: "2026-04-13T12:01:00.000Z",
      createdAt: "2026-04-13T12:00:00.000Z",
      updatedAt: "2026-04-13T12:01:00.000Z",
    } as never);
    vi.mocked(metaRetention.getMetaRetentionRunRows)
      .mockReturnValueOnce([])
      .mockReturnValueOnce([
        {
          tier: "core_authoritative",
          label: "Meta core daily authoritative",
          tableName: "meta_account_daily",
          summaryKey: "meta_account_daily",
          retentionDays: 761,
          cutoffDate: "2024-03-13",
          executionEnabled: false,
          mode: "execute",
          observed: true,
          eligibleRows: 3,
          eligibleDistinctDays: 1,
          oldestEligibleValue: "2024-03-01",
          newestEligibleValue: "2024-03-12",
          retainedRows: 16,
          latestRetainedValue: "2026-04-12",
          protectedRows: 6,
          protectedDistinctDays: 2,
          latestProtectedValue: "2026-04-12",
          deletedRows: 3,
          surfaceFilter: null,
        },
        {
          tier: "core_authoritative",
          label: "Meta authoritative slice versions",
          tableName: "meta_authoritative_slice_versions",
          summaryKey: "meta_authoritative_slice_versions:core",
          retentionDays: 761,
          cutoffDate: "2024-03-13",
          executionEnabled: false,
          mode: "execute",
          observed: true,
          eligibleRows: 2,
          eligibleDistinctDays: 1,
          oldestEligibleValue: "2024-01-01",
          newestEligibleValue: "2024-01-15",
          retainedRows: 8,
          latestRetainedValue: "2026-04-12",
          protectedRows: 2,
          protectedDistinctDays: 1,
          latestProtectedValue: "2026-04-12",
          deletedRows: 2,
          surfaceFilter: ["account_daily"],
        },
      ] as never);
    vi.mocked(metaRetention.getMetaRetentionRunMetadata)
      .mockReturnValueOnce({
        scope: {
          kind: "all_businesses",
          businessIds: null,
        },
        executionDisposition: "dry_run",
        canary: null,
      } as never)
      .mockReturnValueOnce({
        scope: {
          kind: "selected_businesses",
          businessIds: ["biz"],
        },
        executionDisposition: "scoped_execute",
        canary: {
          runtimeAvailable: true,
          globalExecutionEnabled: true,
          businessId: "biz",
          executeRequested: true,
          executeAllowed: true,
          mode: "execute",
          gateReason:
            "Meta retention execute mode is globally enabled. The scoped command will execute only the requested business slice.",
        },
      } as never);
    vi.mocked(metaRetention.summarizeMetaRetentionRunRows).mockReturnValue({
      observedTables: 2,
      tablesWithDeletableRows: 2,
      tablesWithProtectedRows: 2,
      deletableRows: 5,
      retainedRows: 24,
      protectedRows: 8,
    } as never);
    vi.mocked(metaRetention.getMetaRetentionDeleteScope)
      .mockReturnValueOnce("horizon_outside_residue" as never)
      .mockReturnValueOnce("orphaned_stale_artifact" as never);

    const response = await GET(
      new NextRequest("http://localhost/api/meta/status?businessId=biz")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.operations).toMatchObject({
      retentionScopedCommand: "npm run meta:retention-canary -- biz",
      retentionScopedExecuteCommand:
        "npm run meta:retention-canary -- biz --execute",
      retentionScopedExecuteAllowed: false,
      latestRetentionScopedRunMode: "execute",
      latestRetentionScopedRunDisposition: "scoped_execute",
    });
    expect(payload.retention.scopedExecution).toMatchObject({
      available: true,
      businessId: "biz",
      command: "npm run meta:retention-canary -- biz",
      executeCommand: "npm run meta:retention-canary -- biz --execute",
      globalExecutionEnabled: false,
      executeAllowed: false,
      latestRun: {
        id: "meta_retention_canary_run_1",
        executionMode: "execute",
        executionDisposition: "scoped_execute",
        totalDeletedRows: 5,
        scope: {
          kind: "selected_businesses",
          businessIds: ["biz"],
        },
      },
      summary: {
        deletableRows: 5,
        protectedRows: 8,
      },
    });
    expect(payload.retention.scopedExecution.tables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tableName: "meta_account_daily",
          deleteScope: "horizon_outside_residue",
          deletedRows: 3,
        }),
        expect.objectContaining({
          tableName: "meta_authoritative_slice_versions",
          deleteScope: "orphaned_stale_artifact",
          deletedRows: 2,
        }),
      ]),
    );
  });

  it("exposes provider platform boundaries when account dates diverge", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T12:30:00.000Z"));
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
    vi.mocked(assignments.getProviderAccountAssignments).mockResolvedValue({
      id: "asg_1",
      business_id: "biz",
      provider: "meta",
      account_ids: ["act_1", "act_2"],
      created_at: "",
      updated_at: "",
    });
    vi.mocked(snapshots.readProviderAccountSnapshot).mockResolvedValue({
      accounts: [
        { id: "act_1", name: "Main", timezone: "America/Anchorage" },
        { id: "act_2", name: "Second", timezone: "Pacific/Kiritimati" },
      ],
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
      new NextRequest("http://localhost/api/meta/status?businessId=biz")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.platformDateBoundary).toMatchObject({
      primaryAccountId: "act_1",
      primaryAccountTimezone: "America/Anchorage",
      currentDateInTimezone: "2026-04-07",
      previousDateInTimezone: "2026-04-06",
      mixedCurrentDates: true,
      selectedRangeMode: "historical_warehouse",
    });
    expect(payload.platformDateBoundary.accounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerAccountId: "act_1",
          currentDate: "2026-04-07",
          previousDate: "2026-04-06",
        }),
        expect.objectContaining({
          providerAccountId: "act_2",
          currentDate: "2026-04-08",
          previousDate: "2026-04-07",
        }),
      ])
    );

    vi.useRealTimers();
  });

  it("exposes the current page status contract subset with deterministic surface keys", async () => {
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

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/status?businessId=biz&startDate=2026-03-01&endDate=2026-03-31"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    assertMetaStatusPageContract(payload);
    expect(Object.keys(payload.pageReadiness.requiredSurfaces)).toEqual([
      ...META_PAGE_REQUIRED_SURFACE_ORDER,
    ]);
    expect(Object.keys(payload.pageReadiness.optionalSurfaces)).toEqual([
      ...META_PAGE_OPTIONAL_SURFACES,
    ]);
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
    expect(payload.currentDayLive).toEqual({
      summaryAvailable: true,
      campaignsAvailable: true,
    });
  });

  it("exposes live Meta protected published truth review when protected rows are visible", async () => {
    vi.mocked(metaRetention.getMetaProtectedPublishedTruthReview).mockResolvedValue({
      runtimeAvailable: true,
      asOfDate: "2026-04-13",
      scope: {
        kind: "selected_businesses",
        businessIds: ["biz"],
      },
      hasNonZeroProtectedPublishedRows: true,
      protectedPublishedRows: 24,
      activePublicationPointerRows: 6,
      protectedTruthClassesPresent: [
        "core_daily_rows",
        "active_publication_pointers",
        "active_published_slice_versions",
      ],
      protectedTruthClassesAbsent: [
        "breakdown_daily_rows",
        "active_source_manifests",
        "published_day_state",
      ],
      classes: [
        {
          key: "core_daily_rows",
          label: "Protected core daily rows",
          present: true,
          observed: true,
          protectedRows: 24,
          latestProtectedValue: "2026-04-12",
        },
        {
          key: "active_publication_pointers",
          label: "Active publication pointers",
          present: true,
          observed: true,
          protectedRows: 6,
          latestProtectedValue: "2026-04-12",
        },
      ],
    } as never);

    const response = await GET(
      new NextRequest("http://localhost/api/meta/status?businessId=biz")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.operatorTruth).toMatchObject({
      protectedPublishedTruth: {
        state: "present",
        hasNonZeroProtectedPublishedRows: true,
        protectedPublishedRows: 24,
        activePublicationPointerRows: 6,
      },
    });
    expect(payload.protectedPublishedTruth).toMatchObject({
      state: "present",
      runtimeAvailable: true,
      hasNonZeroProtectedPublishedRows: true,
      protectedPublishedRows: 24,
      activePublicationPointerRows: 6,
      protectedTruthClassesPresent: [
        "core_daily_rows",
        "active_publication_pointers",
        "active_published_slice_versions",
      ],
    });
  });

  it("surfaces blocked publication mismatches as action-required selected-range truth", async () => {
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
    vi.mocked(workerHealth.getProviderWorkerHealthState).mockResolvedValue({
      workerHealthy: true,
      heartbeatAgeMs: 5_000,
      runnerLeaseActive: true,
      ownerWorkerId: "worker-1",
      consumeStage: "consuming",
    } as never);
    vi.mocked(metaSync.getMetaSelectedRangeTruthReadiness).mockResolvedValue({
      truthReady: false,
      state: "blocked",
      totalDays: 1,
      completedCoreDays: 0,
      blockingReasons: [],
      reasonCounts: {
        blocked: 1,
        publication_pointer_missing_after_finalize: 1,
      },
      detectorReasonCodes: ["publication_pointer_missing_after_finalize"],
      verificationState: "blocked",
    } as never);
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
      completed_days: 0,
      ready_through_date: null,
    } as never);
    vi.mocked(warehouse.getMetaCampaignDailyCoverage).mockResolvedValue({
      completed_days: 0,
      ready_through_date: null,
    } as never);
    vi.mocked(metaRetention.getMetaProtectedPublishedTruthReview).mockResolvedValue({
      runtimeAvailable: true,
      asOfDate: "2026-04-13",
      scope: {
        kind: "selected_businesses",
        businessIds: ["biz"],
      },
      hasNonZeroProtectedPublishedRows: false,
      protectedPublishedRows: 0,
      activePublicationPointerRows: 0,
      protectedTruthClassesPresent: [],
      protectedTruthClassesAbsent: [
        "core_daily_rows",
        "breakdown_daily_rows",
        "active_publication_pointers",
        "active_published_slice_versions",
        "active_source_manifests",
        "published_day_state",
      ],
      classes: [],
    } as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/status?businessId=biz&startDate=2026-04-10&endDate=2026-04-10"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.state).toBe("action_required");
    expect(payload.selectedRangeTruth).toMatchObject({
      verificationState: "blocked",
      detectorReasonCodes: ["publication_pointer_missing_after_finalize"],
    });
    expect(payload.pageReadiness.requiredSurfaces.summary).toMatchObject({
      state: "blocked",
      reason:
        "Historical Meta publication is blocked because finalized work does not match the required published truth.",
    });
    expect(payload.operations).not.toBeNull();
    expect(payload.operations.blockingReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "blocked_publication_mismatch",
        }),
      ]),
    );
    expect(payload.operatorTruth).toMatchObject({
      rolloutModel: "global",
      reviewWorkflow: {
        adminSurface: "/admin/sync-health",
        executionReviewCommand: "npm run ops:execution-readiness-review",
        readyMeans: "evidence_only",
        automaticEnablement: false,
      },
      rebuild: {
        state: "blocked",
        blocked: true,
        repairRequired: false,
      },
      protectedPublishedTruth: {
        state: "publication_missing",
        hasNonZeroProtectedPublishedRows: false,
      },
    });
    expect(payload.protectedPublishedTruth).toMatchObject({
      state: "publication_missing",
      protectedPublishedRows: 0,
      activePublicationPointerRows: 0,
    });
  });

  it("does not treat historical coverage alone as ready when selected-range publication truth is unavailable", async () => {
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
    vi.mocked(metaSync.getMetaSelectedRangeTruthReadiness).mockRejectedValue(
      new Error("verification unavailable"),
    );
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

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/status?businessId=biz&startDate=2026-04-10&endDate=2026-04-10"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.state).toBe("partial");
    expect(payload.selectedRangeTruth).toBeNull();
    expect(payload.currentCoreUsable).toBe(false);
    expect(payload.pageReadiness.requiredSurfaces.summary.state).toBe("partial");
    expect(payload.pageReadiness.requiredSurfaces.campaigns.state).toBe("partial");
    expect(payload.warehouse.coverage.selectedRange).toMatchObject({
      completedDays: 0,
      totalDays: 1,
      isComplete: false,
    });
    expect(payload.latestSync).toMatchObject({
      completedDays: 0,
      totalDays: 1,
      readyThroughDate: null,
    });
  });

  it("surfaces cold rebuild and quota pressure without overstating readiness", async () => {
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
    vi.mocked(snapshots.readProviderAccountSnapshot).mockResolvedValue({
      accounts: [{ id: "act_1", name: "Main", timezone: "UTC" }],
      meta: {
        source: "snapshot",
        sourceHealth: "stale_cached",
        fetchedAt: null,
        stale: true,
        refreshFailed: true,
        failureClass: "quota",
        lastError: "Rate limit exceeded",
        lastKnownGoodAvailable: true,
        refreshRequestedAt: null,
        lastRefreshAttemptAt: null,
        nextRefreshAfter: "2026-04-13T12:30:00.000Z",
        retryAfterAt: "2026-04-13T12:30:00.000Z",
        refreshInProgress: false,
        sourceReason: "rate_limited",
      },
    });
    vi.mocked(warehouse.getMetaAccountDailyStats).mockResolvedValue({
      row_count: 0,
      first_date: null,
      last_date: null,
    } as never);
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
    vi.mocked(warehouse.getMetaAdDailyCoverage).mockResolvedValue({
      completed_days: 0,
      ready_through_date: null,
    } as never);
    vi.mocked(warehouse.getMetaCreativeDailyCoverage).mockResolvedValue({
      completed_days: 0,
      ready_through_date: null,
    } as never);
    vi.mocked(warehouse.getMetaQueueHealth).mockResolvedValue({
      queueDepth: 3,
      leasedPartitions: 0,
      retryableFailedPartitions: 0,
      deadLetterPartitions: 0,
      latestCoreActivityAt: null,
      latestExtendedActivityAt: null,
      latestMaintenanceActivityAt: null,
      oldestQueuedPartition: "2026-04-10",
      historicalCoreQueueDepth: 3,
      historicalCoreLeasedPartitions: 0,
      extendedRecentQueueDepth: 0,
      extendedRecentLeasedPartitions: 0,
      extendedHistoricalQueueDepth: 0,
      extendedHistoricalLeasedPartitions: 0,
    } as never);
    vi.mocked(metaSync.getMetaSelectedRangeTruthReadiness).mockResolvedValue({
      truthReady: false,
      state: "processing",
      totalDays: 1,
      completedCoreDays: 0,
      blockingReasons: [],
      reasonCounts: {},
      detectorReasonCodes: [],
      verificationState: "processing",
    } as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/status?businessId=biz&startDate=2026-04-10&endDate=2026-04-10"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.readinessLevel).not.toBe("ready");
    expect(payload.operatorTruth).toMatchObject({
      rolloutModel: "global",
      rebuild: {
        state: "quota_limited",
        coldBootstrap: true,
        backfillInProgress: true,
        quotaLimited: true,
      },
    });
  });

  it("does not mark current-day summary or campaigns ready when live availability is missing", async () => {
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
    vi.mocked(live.getMetaCurrentDayLiveAvailability).mockResolvedValue({
      summaryAvailable: false,
      campaignsAvailable: false,
    } as never);
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
    expect(payload.currentDayLive).toEqual({
      summaryAvailable: false,
      campaignsAvailable: false,
    });
    expect(payload.pageReadiness.usable).toBe(false);
    expect(payload.pageReadiness.requiredSurfaces.summary.state).not.toBe("ready");
    expect(payload.pageReadiness.requiredSurfaces.campaigns.state).not.toBe("ready");
    expect(payload.pageReadiness.missingRequiredSurfaces).toEqual(
      expect.arrayContaining(["summary", "campaigns"])
    );
  });

  it("keeps current-day unusable when only live summary is available", async () => {
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
    vi.mocked(live.getMetaCurrentDayLiveAvailability).mockResolvedValue({
      summaryAvailable: true,
      campaignsAvailable: false,
    } as never);
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
    expect(payload.currentDayLive).toEqual({
      summaryAvailable: true,
      campaignsAvailable: false,
    });
    expect(payload.pageReadiness.usable).toBe(false);
    expect(payload.pageReadiness.requiredSurfaces.summary.state).toBe("ready");
    expect(payload.pageReadiness.requiredSurfaces.campaigns.state).not.toBe("ready");
    expect(payload.pageReadiness.missingRequiredSurfaces).toEqual(
      expect.arrayContaining(["campaigns"])
    );
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
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.age"].state).toBe("syncing");
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.location"].state).toBe("syncing");
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.placement"].state).toBe("syncing");
    expect(payload.pageReadiness.optionalSurfaces.adsets.countsForPageCompleteness).toBe(false);
    expect(payload.pageReadiness.optionalSurfaces.recommendations.countsForPageCompleteness).toBe(false);
    expect(payload.warehouse.coverage.breakdownsBySurface).toEqual({
      age: {
        completedDays: 1,
        totalDays: 2,
        readyThroughDate: "2026-04-01",
        isComplete: false,
        supportStartDate: "2000-01-01",
        isBlocked: false,
      },
      location: {
        completedDays: 1,
        totalDays: 2,
        readyThroughDate: "2026-04-01",
        isComplete: false,
        supportStartDate: "2000-01-01",
        isBlocked: false,
      },
      placement: {
        completedDays: 1,
        totalDays: 2,
        readyThroughDate: "2026-04-01",
        isComplete: false,
        supportStartDate: "2000-01-01",
        isBlocked: false,
      },
    });
  });

  it("keeps historical surfaces syncing while finalize is pending", async () => {
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
    vi.mocked(metaSync.getMetaSelectedRangeTruthReadiness).mockResolvedValue({
      truthReady: false,
      state: "processing",
      totalDays: 1,
      completedCoreDays: 1,
      blockingReasons: ["non_finalized"],
      reasonCounts: {
        non_finalized: 1,
        validation_failed: 1,
        missing_breakdown: 1,
      },
    } as never);
    vi.mocked(warehouse.getMetaAccountDailyCoverage).mockResolvedValue({
      completed_days: 1,
      ready_through_date: "2026-04-07",
    } as never);
    vi.mocked(warehouse.getMetaCampaignDailyCoverage).mockResolvedValue({
      completed_days: 1,
      ready_through_date: "2026-04-07",
    } as never);
    vi.mocked(warehouse.getMetaAdSetDailyCoverage).mockResolvedValue({
      completed_days: 1,
      ready_through_date: "2026-04-07",
    } as never);
    vi.mocked(warehouse.getMetaRawSnapshotCoverageByEndpoint).mockResolvedValue(
      new Map([
        ["breakdown_age", { completed_days: 1, ready_through_date: "2026-04-07" }],
        ["breakdown_country", { completed_days: 1, ready_through_date: "2026-04-07" }],
        [
          "breakdown_publisher_platform,platform_position,impression_device",
          { completed_days: 1, ready_through_date: "2026-04-07" },
        ],
      ]) as never
    );
    vi.mocked(warehouse.getMetaAuthoritativeDayVerification).mockResolvedValue({
      businessId: "biz",
      providerAccountId: "act_1",
      day: "2026-04-12",
      verificationState: "processing",
      sourceManifestState: "running",
      validationState: "processing",
      activePublication: null,
      surfaces: [],
      lastFailure: null,
      detectorReasonCodes: [],
      repairBacklog: 0,
      deadLetters: 0,
      staleLeases: 0,
      queuedPartitions: 0,
      leasedPartitions: 1,
    } as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/status?businessId=biz&startDate=2026-04-07&endDate=2026-04-07"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.pageReadiness.requiredSurfaces.summary.state).toBe("syncing");
    expect(payload.pageReadiness.requiredSurfaces.campaigns.state).toBe("syncing");
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.age"].state).toBe("syncing");
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.location"].state).toBe("syncing");
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.placement"].state).toBe("syncing");
    expect(payload.d1FinalizeState).toBe("processing");
    expect(payload.d1BlockedReason).toBe("active_finalize_day_partition");
  });

  it("reports only the age breakdown surface as ready when only the age endpoint is complete", async () => {
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
    vi.mocked(warehouse.getMetaRawSnapshotCoverageByEndpoint).mockResolvedValue(
      new Map([
        ["breakdown_age", { completed_days: 2, ready_through_date: "2026-04-02" }],
        ["breakdown_country", { completed_days: 0, ready_through_date: null }],
        [
          "breakdown_publisher_platform,platform_position,impression_device",
          { completed_days: 0, ready_through_date: null },
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
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.age"].state).toBe("ready");
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.location"].state).toBe("syncing");
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.placement"].state).toBe("syncing");
    expect(payload.pageReadiness.missingRequiredSurfaces).toEqual([
      "breakdowns.location",
      "breakdowns.placement",
    ]);
  });

  it("reports only the placement breakdown surface as missing when only placement lags", async () => {
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
    vi.mocked(warehouse.getMetaRawSnapshotCoverageByEndpoint).mockResolvedValue(
      new Map([
        ["breakdown_age", { completed_days: 2, ready_through_date: "2026-04-02" }],
        ["breakdown_country", { completed_days: 2, ready_through_date: "2026-04-02" }],
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
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.age"].state).toBe("ready");
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.location"].state).toBe("ready");
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.placement"].state).toBe("syncing");
    expect(payload.pageReadiness.missingRequiredSurfaces).toEqual(["breakdowns.placement"]);
    expect(payload.pageReadiness.reason).toBe(
      "Placement breakdown data is still being prepared for the selected range."
    );
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
    vi.mocked(metaSync.getMetaSelectedRangeTruthReadiness).mockResolvedValue({
      truthReady: false,
      state: "processing",
      totalDays: 1,
      completedCoreDays: 0,
      blockingReasons: ["non_finalized"],
      reasonCounts: { non_finalized: 1 },
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

  it("reports current-day breakdown surfaces independently", async () => {
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
    vi.mocked(warehouse.getMetaRawSnapshotCoverageByEndpoint).mockResolvedValue(
      new Map([
        ["breakdown_age", { completed_days: 1, ready_through_date: today }],
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
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.age"].state).toBe("ready");
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.location"].state).toBe("syncing");
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.placement"].state).toBe("syncing");
    expect(payload.pageReadiness.missingRequiredSurfaces).toEqual([
      "breakdowns.location",
      "breakdowns.placement",
    ]);
  });

  it("marks each breakdown surface blocked independently when the range is outside support", async () => {
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
    vi.mocked(constraints.getMetaBreakdownSupportedStart).mockReturnValue("2026-04-10");
    vi.mocked(warehouse.getMetaAccountDailyCoverage).mockResolvedValue({
      completed_days: 2,
      ready_through_date: "2026-04-02",
    } as never);
    vi.mocked(warehouse.getMetaCampaignDailyCoverage).mockResolvedValue({
      completed_days: 2,
      ready_through_date: "2026-04-02",
    } as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/status?businessId=biz&startDate=2020-04-01&endDate=2020-04-02"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.age"].state).toBe("blocked");
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.location"].state).toBe("blocked");
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.placement"].state).toBe("blocked");
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.age"].reason).toBe(
      "Age breakdown data is only supported from 2026-04-10 onward for the selected range."
    );
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.location"].reason).toBe(
      "Country breakdown data is only supported from 2026-04-10 onward for the selected range."
    );
    expect(payload.pageReadiness.requiredSurfaces["breakdowns.placement"].reason).toBe(
      "Placement breakdown data is only supported from 2026-04-10 onward for the selected range."
    );
    expect(payload.pageReadiness.missingRequiredSurfaces).toEqual([]);
  });
});
