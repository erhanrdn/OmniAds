import { beforeEach, describe, expect, it, vi } from "vitest";
import { getActiveBusinesses } from "@/lib/sync/active-businesses";

const mocks = vi.hoisted(() => {
  const sqlTag = vi.fn();
  const getDb = vi.fn(() => sqlTag);
  const getDbSchemaReadiness = vi.fn();
  return {
    sqlTag,
    getDb,
    getDbSchemaReadiness,
  };
});

vi.mock("@/lib/db", () => ({
  getDb: mocks.getDb,
}));

vi.mock("@/lib/db-schema-readiness", () => ({
  getDbSchemaReadiness: mocks.getDbSchemaReadiness,
}));

describe("getActiveBusinesses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDbSchemaReadiness.mockResolvedValue({ ready: true });
    mocks.sqlTag.mockResolvedValue([]);
  });

  it("expands the effective limit so prioritized businesses cannot be trimmed out", async () => {
    await getActiveBusinesses(2, {
      prioritizedIds: ["biz-3", "biz-2", "biz-1"],
    });

    expect(mocks.sqlTag).toHaveBeenCalledTimes(1);
    const [strings, prioritizedIds, , effectiveLimit] = mocks.sqlTag.mock.calls[0] ?? [];
    expect(String.raw({ raw: strings }, prioritizedIds, prioritizedIds, effectiveLimit)).toContain(
      "priority_group",
    );
    expect(prioritizedIds).toEqual(["biz-3", "biz-2", "biz-1"]);
    expect(effectiveLimit).toBe(3);
  });

  it("keeps the requested limit when there are no prioritized businesses", async () => {
    await getActiveBusinesses(7, {
      prioritizedIds: [],
    });

    const [, prioritizedIds, , effectiveLimit] = mocks.sqlTag.mock.calls[0] ?? [];
    expect(prioritizedIds).toEqual([]);
    expect(effectiveLimit).toBe(7);
  });
});
