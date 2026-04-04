import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/migrations", () => ({
  runMigrations: vi.fn(),
}));

vi.mock("@/lib/reporting-cache", () => ({
  clearCachedReports: vi.fn(),
}));

const db = await import("@/lib/db");
const { closeSucceededMetaParentRunningCheckpoints } = await import("@/lib/meta/cleanup");

describe("closeSucceededMetaParentRunningCheckpoints", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("closes running checkpoints under succeeded parents and returns grouped diagnostics", async () => {
    const queries: string[] = [];
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      queries.push(strings.join(" "));
      return [
        {
          summary: {
            businessId: null,
            totalClosed: 3,
            remainingRunningChildrenOfSucceededParents: 0,
            groups: [
              {
                checkpointScope: "account_daily",
                phase: "fetch_raw",
                epochBucket: "epoch_match",
                timingBucket: "checkpoint_updated_before_or_at_parent_finished",
                count: 2,
              },
              {
                checkpointScope: "core_ad_insights",
                phase: "bulk_upsert",
                epochBucket: "checkpoint_epoch_null",
                timingBucket: "checkpoint_updated_after_parent_finished",
                count: 1,
              },
            ],
          },
        },
      ];
    });
    vi.mocked(db.getDb).mockReturnValue(sql as never);

    const summary = await closeSucceededMetaParentRunningCheckpoints();

    expect(summary).toEqual({
      businessId: null,
      totalClosed: 3,
      remainingRunningChildrenOfSucceededParents: 0,
      groups: [
        {
          checkpointScope: "account_daily",
          phase: "fetch_raw",
          epochBucket: "epoch_match",
          timingBucket: "checkpoint_updated_before_or_at_parent_finished",
          count: 2,
        },
        {
          checkpointScope: "core_ad_insights",
          phase: "bulk_upsert",
          epochBucket: "checkpoint_epoch_null",
          timingBucket: "checkpoint_updated_after_parent_finished",
          count: 1,
        },
      ],
    });
    expect(queries.some((query) => query.includes("partition.status = 'succeeded'"))).toBe(true);
    expect(queries.some((query) => query.includes("checkpoint.status = 'running'"))).toBe(true);
    expect(queries.some((query) => query.includes("phase = 'finalize'"))).toBe(true);
    expect(queries.some((query) => query.includes("epoch_match"))).toBe(true);
    expect(queries.some((query) => query.includes("checkpoint_updated_before_or_at_parent_finished"))).toBe(
      true
    );
  });
});
