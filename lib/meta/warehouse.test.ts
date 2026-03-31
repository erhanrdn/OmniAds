import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/migrations", () => ({
  runMigrations: vi.fn(),
}));

const db = await import("@/lib/db");
const { replayMetaDeadLetterPartitions, upsertMetaSyncCheckpoint } = await import(
  "@/lib/meta/warehouse"
);

describe("meta warehouse ownership safety", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns null when checkpoint upsert loses partition ownership", async () => {
    const sql = vi.fn().mockResolvedValue([]);
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const checkpointId = await upsertMetaSyncCheckpoint({
      partitionId: "partition-1",
      businessId: "biz-1",
      providerAccountId: "acct-1",
      checkpointScope: "breakdown:age",
      phase: "fetch_raw",
      status: "running",
      pageIndex: 0,
      attemptCount: 1,
      leaseOwner: "worker-1",
    });

    expect(checkpointId).toBeNull();
  });

  it("keeps active leased dead-letter partitions out of replay", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.join(" "));
      return [];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    await replayMetaDeadLetterPartitions({
      businessId: "biz-1",
      scope: "ad_daily",
    });

    expect(queries[0]).toContain("COALESCE(lease_expires_at, now() - interval '1 second') <= now()");
  });
});
