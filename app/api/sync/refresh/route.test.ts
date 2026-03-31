import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { POST } from "@/app/api/sync/refresh/route";

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
});
