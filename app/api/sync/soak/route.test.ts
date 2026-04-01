import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/internal-sync-auth", () => ({
  requireInternalOrAdminSyncAccess: vi.fn(),
}));

vi.mock("@/lib/sync/soak-gate", () => ({
  runSyncSoakGate: vi.fn(),
}));

const internalAuth = await import("@/lib/internal-sync-auth");
const soakGate = await import("@/lib/sync/soak-gate");
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
    vi.mocked(soakGate.runSyncSoakGate).mockResolvedValue({
      health: {} as never,
      result: {
        outcome: "pass",
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
        blockingChecks: [],
        issueCount: 0,
        criticalIssueCount: 0,
        unresolvedRunbookKeys: [],
        topIssue: null,
        releaseReadiness: "publishable",
        summary: "Sync soak gate passed.",
      },
    } as never);

    const response = await GET(new NextRequest("http://localhost/api/sync/soak"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.outcome).toBe("pass");
  });
});
