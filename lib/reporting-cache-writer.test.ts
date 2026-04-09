import { beforeEach, describe, expect, it, vi } from "vitest";

const sql = vi.fn();

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => sql),
}));

vi.mock("@/lib/db-schema-readiness", () => ({
  assertDbSchemaReady: vi.fn(),
  getDbSchemaReadiness: vi.fn(),
}));

vi.mock("@/lib/route-report-cache", () => ({
  getNormalizedSearchParamsKey: vi.fn(() => "range-key"),
  shouldBypassRouteCachePayload: vi.fn(() => false),
}));

const schemaReadiness = await import("@/lib/db-schema-readiness");
const routeReportCache = await import("@/lib/route-report-cache");
const {
  writeCachedReportSnapshot,
  writeCachedRouteReport,
  clearCachedReportSnapshots,
} = await import("@/lib/reporting-cache-writer");

describe("reporting cache writer", () => {
  const readinessResult = {
    ready: true,
    missingTables: [],
    checkedAt: "2026-04-09T00:00:00.000Z",
  } satisfies Awaited<ReturnType<typeof schemaReadiness.getDbSchemaReadiness>>;

  beforeEach(() => {
    vi.resetAllMocks();
    sql.mockResolvedValue([{ count: 1 }]);
    vi.mocked(schemaReadiness.getDbSchemaReadiness).mockResolvedValue(readinessResult);
    vi.mocked(schemaReadiness.assertDbSchemaReady).mockResolvedValue(readinessResult);
    vi.mocked(routeReportCache.shouldBypassRouteCachePayload).mockReturnValue(false);
  });

  it("writes provider_reporting_snapshots for explicit materialization only", async () => {
    await writeCachedReportSnapshot({
      businessId: "biz_1",
      provider: "ga4",
      reportType: "ga4_analytics_overview",
      dateRangeKey: "2026-03-01:2026-03-30",
      payload: { ok: true },
    });

    expect(String(sql.mock.calls[0]?.[0]?.join(" ") ?? "")).toContain(
      "INSERT INTO provider_reporting_snapshots",
    );
  });

  it("supports explicit route-cache warming owners without leaking read helpers", async () => {
    await writeCachedRouteReport({
      businessId: "biz_1",
      provider: "ga4",
      reportType: "ga4_overview",
      searchParams: new URLSearchParams({ startDate: "2026-03-01", endDate: "2026-03-30" }),
      payload: { rows: [] },
    });

    expect(routeReportCache.getNormalizedSearchParamsKey).toHaveBeenCalled();
    expect(String(sql.mock.calls[0]?.[0]?.join(" ") ?? "")).toContain(
      "INSERT INTO provider_reporting_snapshots",
    );
  });

  it("clears provider_reporting_snapshots only through the explicit writer", async () => {
    await clearCachedReportSnapshots({
      provider: "meta",
      businessId: "biz_1",
    });

    expect(schemaReadiness.assertDbSchemaReady).toHaveBeenCalled();
    expect(String(sql.mock.calls[0]?.[0]?.join(" ") ?? "")).toContain(
      "DELETE FROM provider_reporting_snapshots",
    );
  });
});
