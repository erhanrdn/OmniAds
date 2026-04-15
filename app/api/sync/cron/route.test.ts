import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/sync/active-businesses", () => ({
  getActiveBusinesses: vi.fn(),
}));

vi.mock("@/lib/sync/meta-sync", () => ({
  enqueueMetaScheduledWork: vi.fn(),
}));

vi.mock("@/lib/sync/google-ads-sync", () => ({
  enqueueGoogleAdsScheduledWork: vi.fn(),
}));

vi.mock("@/lib/sync/ga4-sync", () => ({
  syncGA4Reports: vi.fn(),
}));

vi.mock("@/lib/sync/search-console-sync", () => ({
  syncSearchConsoleReports: vi.fn(),
}));

vi.mock("@/lib/sync/shopify-sync", () => ({
  syncShopifyCommerceReports: vi.fn(),
}));

vi.mock("@/lib/sync/soak-gate", () => ({
  runSyncSoakGate: vi.fn(),
}));

vi.mock("@/lib/sync/release-gates", () => ({
  evaluateAndPersistSyncGates: vi.fn(),
}));

const activeBusinesses = await import("@/lib/sync/active-businesses");
const metaSync = await import("@/lib/sync/meta-sync");
const googleSync = await import("@/lib/sync/google-ads-sync");
const ga4Sync = await import("@/lib/sync/ga4-sync");
const searchConsoleSync = await import("@/lib/sync/search-console-sync");
const shopifySync = await import("@/lib/sync/shopify-sync");
const soakGate = await import("@/lib/sync/soak-gate");
const releaseGates = await import("@/lib/sync/release-gates");
const { POST } = await import("@/app/api/sync/cron/route");

describe("POST /api/sync/cron", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.CRON_SECRET = "secret";
    delete process.env.SYNC_CRON_ENFORCE_SOAK_GATE;
    delete process.env.SHOPIFY_SYNC_ENABLED;
    vi.mocked(activeBusinesses.getActiveBusinesses).mockResolvedValue([
      { id: "biz_1", name: "Biz 1" },
    ] as never);
    vi.mocked(metaSync.enqueueMetaScheduledWork).mockResolvedValue({ queued: 1 } as never);
    vi.mocked(googleSync.enqueueGoogleAdsScheduledWork).mockResolvedValue({ queued: 1 } as never);
    vi.mocked(ga4Sync.syncGA4Reports).mockResolvedValue({ synced: true } as never);
    vi.mocked(searchConsoleSync.syncSearchConsoleReports).mockResolvedValue({ synced: true } as never);
    vi.mocked(shopifySync.syncShopifyCommerceReports).mockResolvedValue({
      success: true,
      returns: 2,
    } as never);
    vi.mocked(releaseGates.evaluateAndPersistSyncGates).mockResolvedValue({
      checkedAt: "2026-04-15T00:00:00.000Z",
      deployGate: {
        gateKind: "deploy_gate",
        buildId: "sha",
        environment: "test",
        mode: "measure_only",
        baseResult: "pass",
        verdict: "pass",
        blockerClass: null,
        summary: "ok",
        breakGlass: false,
        overrideReason: null,
        evidence: {},
        emittedAt: "2026-04-15T00:00:00.000Z",
      },
      releaseGate: {
        gateKind: "release_gate",
        buildId: "sha",
        environment: "test",
        mode: "measure_only",
        baseResult: "pass",
        verdict: "pass",
        blockerClass: null,
        summary: "ok",
        breakGlass: false,
        overrideReason: null,
        evidence: {},
        emittedAt: "2026-04-15T00:00:00.000Z",
      },
    } as never);
  });

  it("returns 503 when soak enforcement is enabled and the gate fails", async () => {
    process.env.SYNC_CRON_ENFORCE_SOAK_GATE = "true";
    vi.mocked(soakGate.runSyncSoakGate).mockResolvedValue({
      health: {} as never,
      result: {
        outcome: "fail",
        checkedAt: "2026-04-01T00:00:00.000Z",
        thresholds: {
          maxStaleRuns24h: 0,
          maxLeaseConflicts24h: 0,
          maxSkippedActiveLeaseRecoveries24h: 5,
          maxQueueDepth: 25,
          maxDeadLetters: 0,
          maxCriticalIssues: 0,
        },
        checks: [],
        blockingChecks: [{ key: "critical_issue_count", ok: false, actual: 1, threshold: 0 }],
        issueCount: 1,
        criticalIssueCount: 1,
        unresolvedRunbookKeys: [],
        topIssue: "critical",
        releaseReadiness: "blocked",
        summary: "Sync soak gate failed: critical_issue_count",
      },
    } as never);

    const request = new NextRequest("http://localhost/api/sync/cron", {
      method: "POST",
      headers: { authorization: "Bearer secret" },
    });
    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.ok).toBe(true);
    expect(payload.soakGate.outcome).toBe("fail");
  });

  it("returns 200 without a soak payload when soak enforcement is disabled", async () => {
    const request = new NextRequest("http://localhost/api/sync/cron", {
      method: "POST",
      headers: { authorization: "Bearer secret" },
    });
    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.soakGate).toBeUndefined();
    expect(payload.gateVerdicts).toBeDefined();
    expect(soakGate.runSyncSoakGate).not.toHaveBeenCalled();
    expect(payload.results[0].shopify).toEqual({ skipped: true, reason: "disabled" });
  });

  it("runs Shopify sync when enabled", async () => {
    process.env.SHOPIFY_SYNC_ENABLED = "true";

    const request = new NextRequest("http://localhost/api/sync/cron", {
      method: "POST",
      headers: { authorization: "Bearer secret" },
    });
    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(shopifySync.syncShopifyCommerceReports).toHaveBeenCalledWith("biz_1");
    expect(payload.results[0].shopify).toEqual(expect.objectContaining({ success: true, returns: 2 }));
  });
});
