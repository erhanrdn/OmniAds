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
    vi.mocked(warehouse.getLatestMetaSyncHealth).mockResolvedValue(null);
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
    vi.mocked(warehouse.getMetaQueueHealth).mockResolvedValue(null);
    vi.mocked(warehouse.getMetaQueueComposition).mockResolvedValue(null);
    vi.mocked(warehouse.getMetaCheckpointHealth).mockResolvedValue(null);
    vi.mocked(warehouse.getMetaSyncJobHealth).mockResolvedValue(null);
    vi.mocked(warehouse.getMetaSyncState).mockResolvedValue([]);
    vi.mocked(workerHealth.getProviderWorkerHealthState).mockResolvedValue(null);
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
  });
});
