import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/internal-sync-auth", () => ({
  requireInternalOrAdminSyncAccess: vi.fn(),
}));

vi.mock("@/lib/admin-operations-health", () => ({
  getAdminOperationsHealth: vi.fn(),
}));

const internalAuth = await import("@/lib/internal-sync-auth");
const adminHealth = await import("@/lib/admin-operations-health");
const { GET } = await import("@/app/api/sync/soak/route");

describe("GET /api/sync/soak", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects unauthorized callers", async () => {
    vi.mocked(internalAuth.requireInternalOrAdminSyncAccess).mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    });

    const response = await GET(new NextRequest("http://localhost/api/sync/soak"));

    expect(response.status).toBe(401);
  });

  it("returns 503 when the soak gate fails", async () => {
    vi.mocked(internalAuth.requireInternalOrAdminSyncAccess).mockResolvedValue({
      kind: "internal",
    });
    vi.mocked(adminHealth.getAdminOperationsHealth).mockResolvedValue({
      syncHealth: {
        summary: {
          impactedBusinesses: 1,
          runningJobs: 0,
          stuckJobs: 0,
          failedJobs24h: 0,
          activeCooldowns: 0,
          successJobs24h: 0,
          topIssue: "critical",
          workerOnline: true,
          googleAdsQueueDepth: 0,
          metaQueueDepth: 0,
          googleAdsDeadLetterPartitions: 0,
          metaDeadLetterPartitions: 0,
          googleAdsLeaseConflictRuns24h: 1,
          metaStaleRunCount24h: 0,
          googleAdsSkippedActiveLeaseRecoveries: 0,
          metaSkippedActiveLeaseRecoveries: 0,
        },
        issues: [
          {
            businessId: "biz",
            businessName: "Biz",
            provider: "google_ads",
            reportType: "lease_conflict_runs",
            severity: "critical",
            runbookKey: "google_ads:lease_conflict",
            status: "failed",
            detail: "critical",
            triggeredAt: null,
            completedAt: null,
          },
        ],
      },
    } as never);

    const response = await GET(new NextRequest("http://localhost/api/sync/soak"));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.outcome).toBe("fail");
  });

  it("returns 200 when the soak gate passes", async () => {
    vi.mocked(internalAuth.requireInternalOrAdminSyncAccess).mockResolvedValue({
      kind: "admin",
      session: { user: { id: "admin_1" } } as never,
    });
    vi.mocked(adminHealth.getAdminOperationsHealth).mockResolvedValue({
      syncHealth: {
        summary: {
          impactedBusinesses: 0,
          runningJobs: 0,
          stuckJobs: 0,
          failedJobs24h: 0,
          activeCooldowns: 0,
          successJobs24h: 0,
          topIssue: null,
          workerOnline: true,
          googleAdsQueueDepth: 0,
          metaQueueDepth: 0,
          googleAdsDeadLetterPartitions: 0,
          metaDeadLetterPartitions: 0,
          googleAdsLeaseConflictRuns24h: 0,
          metaStaleRunCount24h: 0,
          googleAdsSkippedActiveLeaseRecoveries: 0,
          metaSkippedActiveLeaseRecoveries: 0,
        },
        issues: [],
      },
    } as never);

    const response = await GET(new NextRequest("http://localhost/api/sync/soak"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.outcome).toBe("pass");
  });
});
