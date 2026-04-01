import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/internal-sync-auth", () => ({
  requireInternalOrAdminSyncAccess: vi.fn(),
  businessExists: vi.fn(),
}));

vi.mock("@/lib/meta/warehouse", () => ({
  expireStaleMetaSyncJobs: vi.fn(),
  getMetaQueueHealth: vi.fn(),
  hasBlockingMetaSyncJob: vi.fn(),
}));

vi.mock("@/lib/google-ads/warehouse", () => ({
  cleanupGoogleAdsObsoleteSyncJobs: vi.fn(),
  expireStaleGoogleAdsSyncJobs: vi.fn(),
  getGoogleAdsQueueHealth: vi.fn(),
}));

vi.mock("@/lib/sync/google-ads-sync", () => ({
  enqueueGoogleAdsScheduledWork: vi.fn(),
}));

vi.mock("@/lib/sync/meta-sync", () => ({
  enqueueMetaScheduledWork: vi.fn(),
}));

vi.mock("@/lib/sync/shopify-sync", () => ({
  syncShopifyCommerceReports: vi.fn(),
}));

vi.mock("@/lib/sync/ga4-sync", () => ({
  syncGA4Reports: vi.fn(),
}));

vi.mock("@/lib/sync/search-console-sync", () => ({
  syncSearchConsoleReports: vi.fn(),
}));

vi.mock("@/lib/admin-logger", () => ({
  logAdminAction: vi.fn(),
}));

vi.mock("@/lib/migrations", () => ({
  runMigrations: vi.fn(),
}));

const internalAuth = await import("@/lib/internal-sync-auth");
const googleAdsSync = await import("@/lib/sync/google-ads-sync");
const metaSync = await import("@/lib/sync/meta-sync");
const shopifySync = await import("@/lib/sync/shopify-sync");
const adminLogger = await import("@/lib/admin-logger");
const db = await import("@/lib/db");
const { POST } = await import("@/app/api/sync/refresh/route");

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/sync/refresh", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("POST /api/sync/refresh", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete (globalThis as typeof globalThis & { __syncRefreshInFlightKeys?: Set<string> })
      .__syncRefreshInFlightKeys;
    vi.mocked(internalAuth.businessExists).mockResolvedValue(true);
    vi.mocked(db.getDb).mockReturnValue(
      vi.fn().mockResolvedValue([{ already_running: false, acquired: true }]) as never
    );
  });

  it("rejects unauthorized callers", async () => {
    vi.mocked(internalAuth.requireInternalOrAdminSyncAccess).mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    });

    const response = await POST(buildRequest({ businessId: "biz", provider: "meta" }));

    expect(response.status).toBe(401);
  });

  it("rejects non-admin callers that fail the sync access gate", async () => {
    vi.mocked(internalAuth.requireInternalOrAdminSyncAccess).mockResolvedValue({
      error: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    });

    const response = await POST(buildRequest({ businessId: "biz", provider: "meta" }));

    expect(response.status).toBe(403);
  });

  it("rejects unsupported providers", async () => {
    vi.mocked(internalAuth.requireInternalOrAdminSyncAccess).mockResolvedValue({
      kind: "internal",
    });

    const response = await POST(buildRequest({ businessId: "biz", provider: "ga4" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("unsupported_provider_for_refresh");
  });

  it("rejects deprecated mode and range fields", async () => {
    vi.mocked(internalAuth.requireInternalOrAdminSyncAccess).mockResolvedValue({
      kind: "internal",
    });

    const response = await POST(
      buildRequest({
        businessId: "biz",
        provider: "meta",
        mode: "repair",
        startDate: "2026-03-01",
        endDate: "2026-03-02",
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns not found for unknown businesses", async () => {
    vi.mocked(internalAuth.requireInternalOrAdminSyncAccess).mockResolvedValue({
      kind: "internal",
    });
    vi.mocked(internalAuth.businessExists).mockResolvedValue(false);

    const response = await POST(buildRequest({ businessId: "missing", provider: "meta" }));

    expect(response.status).toBe(404);
  });

  it("returns started after durable enqueue succeeds", async () => {
    vi.mocked(internalAuth.requireInternalOrAdminSyncAccess).mockResolvedValue({
      kind: "internal",
    });
    vi.mocked(metaSync.enqueueMetaScheduledWork).mockResolvedValue({
      businessId: "biz",
      queuedCore: 1,
      queuedMaintenance: 0,
    });

    const response = await POST(buildRequest({ businessId: "biz", provider: "meta" }));
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.status).toBe("started");
    expect(metaSync.enqueueMetaScheduledWork).toHaveBeenCalledWith("biz");
  });

  it("supports manual Shopify refresh", async () => {
    vi.mocked(internalAuth.requireInternalOrAdminSyncAccess).mockResolvedValue({
      kind: "internal",
    });
    vi.mocked(db.getDb).mockReturnValue(
      vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ already_running: false, acquired: true }]) as never
    );
    vi.mocked(shopifySync.syncShopifyCommerceReports).mockResolvedValue({
      success: true,
      reason: "ok",
    } as never);

    const response = await POST(buildRequest({ businessId: "biz", provider: "shopify" }));
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.status).toBe("started");
    expect(shopifySync.syncShopifyCommerceReports).toHaveBeenCalledWith("biz");
  });

  it("returns already_running when work is already active", async () => {
    vi.mocked(internalAuth.requireInternalOrAdminSyncAccess).mockResolvedValue({
      kind: "admin",
      session: { user: { id: "admin_1" } } as never,
    });
    vi.mocked(db.getDb).mockReturnValue(
      vi.fn().mockResolvedValue([{ leased_count: 1 }]) as never
    );

    const response = await POST(buildRequest({ businessId: "biz", provider: "meta" }));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, status: "already_running" });
    expect(adminLogger.logAdminAction).toHaveBeenCalled();
  });

  it("returns already_running when meta enqueue finds existing backlog without new work", async () => {
    vi.mocked(internalAuth.requireInternalOrAdminSyncAccess).mockResolvedValue({
      kind: "internal",
    });
    vi.mocked(metaSync.enqueueMetaScheduledWork).mockResolvedValue({
      businessId: "biz",
      queuedCore: 0,
      queuedMaintenance: 0,
      queueDepth: 2,
      leasedPartitions: 0,
    } as never);

    const response = await POST(buildRequest({ businessId: "biz", provider: "meta" }));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      ok: true,
      status: "already_running",
      provider: "meta",
      result: {
        businessId: "biz",
        queuedCore: 0,
        queuedMaintenance: 0,
        queueDepth: 2,
        leasedPartitions: 0,
      },
    });
  });

  it("returns already_running when Google Ads enqueue finds existing backlog without new work", async () => {
    vi.mocked(internalAuth.requireInternalOrAdminSyncAccess).mockResolvedValue({
      kind: "internal",
    });
    vi.mocked(googleAdsSync.enqueueGoogleAdsScheduledWork).mockResolvedValue({
      businessId: "biz",
      queuedCore: 0,
      queueDepth: 3,
      leasedPartitions: 0,
    } as never);

    const response = await POST(buildRequest({ businessId: "biz", provider: "google_ads" }));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      ok: true,
      status: "already_running",
      provider: "google_ads",
      result: {
        businessId: "biz",
        queuedCore: 0,
        queueDepth: 3,
        leasedPartitions: 0,
      },
    });
  });

  it("returns 500 and logs failed audits when enqueue throws", async () => {
    vi.mocked(internalAuth.requireInternalOrAdminSyncAccess).mockResolvedValue({
      kind: "admin",
      session: { user: { id: "admin_1" } } as never,
    });
    vi.mocked(googleAdsSync.enqueueGoogleAdsScheduledWork).mockRejectedValue(
      new Error("enqueue failed")
    );

    const response = await POST(buildRequest({ businessId: "biz", provider: "google_ads" }));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error).toBe("internal_error");
    expect(adminLogger.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sync.refresh",
        meta: expect.objectContaining({ outcome: "failed" }),
      })
    );
  });

  it("returns already_running for overlapping in-process refresh requests", async () => {
    vi.mocked(internalAuth.requireInternalOrAdminSyncAccess).mockResolvedValue({
      kind: "internal",
    });
    vi.mocked(db.getDb).mockReturnValue(
      vi.fn().mockResolvedValue([{ already_running: false, acquired: true }]) as never
    );
    const pending = deferred<{
      businessId: string;
      queuedCore: number;
      queueDepth: number;
      leasedPartitions: number;
    }>();
    vi.mocked(googleAdsSync.enqueueGoogleAdsScheduledWork).mockReturnValue(pending.promise as never);

    const firstResponsePromise = POST(buildRequest({ businessId: "biz", provider: "google_ads" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const secondResponse = await POST(buildRequest({ businessId: "biz", provider: "google_ads" }));

    expect(secondResponse.status).toBe(202);
    expect(await secondResponse.json()).toEqual({ ok: true, status: "already_running" });
    expect(googleAdsSync.enqueueGoogleAdsScheduledWork).toHaveBeenCalledTimes(1);

    pending.resolve({
      businessId: "biz",
      queuedCore: 1,
      queueDepth: 1,
      leasedPartitions: 0,
    });

    const firstResponse = await firstResponsePromise;
    expect(firstResponse.status).toBe(202);
    await firstResponse.json();
  });

  it("returns already_running when the durable refresh lock is already held", async () => {
    vi.mocked(internalAuth.requireInternalOrAdminSyncAccess).mockResolvedValue({
      kind: "admin",
      session: { user: { id: "admin_1" } } as never,
    });
    vi.mocked(db.getDb).mockReturnValue(
      vi.fn().mockResolvedValue([{ already_running: true, acquired: false }]) as never
    );

    const response = await POST(buildRequest({ businessId: "biz", provider: "google_ads" }));

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, status: "already_running" });
    expect(googleAdsSync.enqueueGoogleAdsScheduledWork).not.toHaveBeenCalled();
    expect(adminLogger.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sync.refresh",
        meta: expect.objectContaining({ duplicateReason: "durable_refresh_lock" }),
      })
    );
  });

  it("fails closed when durable refresh lock acquisition errors", async () => {
    vi.mocked(internalAuth.requireInternalOrAdminSyncAccess).mockResolvedValue({
      kind: "admin",
      session: { user: { id: "admin_1" } } as never,
    });
    vi.mocked(db.getDb).mockReturnValue(
      vi.fn().mockRejectedValue(new Error("db unavailable")) as never
    );

    const response = await POST(buildRequest({ businessId: "biz", provider: "google_ads" }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "refresh_lock_unavailable",
      message: "Could not acquire durable refresh lock.",
    });
    expect(googleAdsSync.enqueueGoogleAdsScheduledWork).not.toHaveBeenCalled();
    expect(adminLogger.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sync.refresh",
        meta: expect.objectContaining({ error: "durable_refresh_lock_acquisition_failed" }),
      })
    );
  });
});
