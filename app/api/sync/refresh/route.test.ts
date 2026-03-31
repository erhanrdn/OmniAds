import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { POST } from "@/app/api/sync/refresh/route";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/internal-sync-auth", () => ({
  requireInternalOrAdminSyncAccess: vi.fn(),
  businessExists: vi.fn(),
}));

vi.mock("@/lib/meta/warehouse", () => ({
  expireStaleMetaSyncJobs: vi.fn(),
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
const adminLogger = await import("@/lib/admin-logger");
const db = await import("@/lib/db");

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/sync/refresh", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/sync/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(internalAuth.businessExists).mockResolvedValue(true);
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
});
