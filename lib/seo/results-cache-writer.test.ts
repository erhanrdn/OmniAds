import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => sql),
}));

vi.mock("@/lib/db-schema-readiness", () => ({
  getDbSchemaReadiness: vi.fn(),
}));

const schemaReadiness = await import("@/lib/db-schema-readiness");
const { writeSeoResultsCacheEntry } = await import("@/lib/seo/results-cache-writer");

describe("seo results cache writer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sql.mockResolvedValue([]);
    vi.mocked(schemaReadiness.getDbSchemaReadiness).mockResolvedValue({
      ready: true,
      missingTables: [],
      checkedAt: "2026-04-09T00:00:00.000Z",
    });
  });

  it("writes only seo_results_cache rows", async () => {
    await writeSeoResultsCacheEntry({
      businessId: "biz_1",
      cacheType: "overview",
      startDate: "2026-03-01",
      endDate: "2026-03-30",
      payload: { metrics: [] },
    });

    expect(String(sql.mock.calls[0]?.[0]?.join(" ") ?? "")).toContain(
      "INSERT INTO seo_results_cache",
    );
  });
});
