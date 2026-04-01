import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/migrations", () => ({
  runMigrations: vi.fn(),
}));

const db = await import("@/lib/db");
const { renewSyncRunnerLease } = await import("@/lib/sync/worker-health");

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
});
