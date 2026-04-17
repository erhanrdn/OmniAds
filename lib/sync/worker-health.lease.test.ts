import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/migrations", () => ({
  runMigrations: vi.fn(),
}));

vi.mock("@/lib/provider-account-reference-store", () => ({
  resolveBusinessReferenceIds: vi.fn(async (businessIds: string[]) => {
    return new Map(
      businessIds.map((businessId) => [businessId, `business-ref-${businessId}`] as const),
    );
  }),
}));

const db = await import("@/lib/db");
const { acquireSyncRunnerLease, renewSyncRunnerLease } = await import("@/lib/sync/worker-health");

describe("renewSyncRunnerLease", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns true when the same owner renews an active lease", async () => {
    const sql = vi.fn().mockResolvedValue([{ lease_owner: "worker-1" }]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const renewed = await renewSyncRunnerLease({
      businessId: "biz-1",
      providerScope: "google_ads",
      leaseOwner: "worker-1",
      leaseMinutes: 2,
    });

    expect(renewed).toBe(true);
    expect(String(sql.mock.calls[0]?.[0]?.join(" ") ?? "")).toContain("business_ref_id");
  });

  it("returns false when ownership is already lost", async () => {
    const sql = vi.fn().mockResolvedValue([]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const renewed = await renewSyncRunnerLease({
      businessId: "biz-1",
      providerScope: "meta",
      leaseOwner: "worker-1",
      leaseMinutes: 2,
    });

    expect(renewed).toBe(false);
  });

  it("writes canonical business refs when acquiring a lease", async () => {
    const sql = vi.fn().mockResolvedValue([{ lease_owner: "worker-1" }]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const acquired = await acquireSyncRunnerLease({
      businessId: "biz-1",
      providerScope: "google_ads",
      leaseOwner: "worker-1",
      leaseMinutes: 2,
    });

    expect(acquired).toBe(true);
    expect(String(sql.mock.calls[0]?.[0]?.join(" ") ?? "")).toContain("business_ref_id");
  });
});
