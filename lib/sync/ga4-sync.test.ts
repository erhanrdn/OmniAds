import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

class MockGA4AuthError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 401) {
    super(message);
    this.name = "GA4AuthError";
    this.code = code;
    this.status = status;
  }
}

const sql = vi.fn();

vi.mock("@/lib/google-analytics-reporting", () => ({
  resolveGa4AnalyticsContext: vi.fn(),
  GA4AuthError: MockGA4AuthError,
}));

vi.mock("@/lib/route-report-cache", () => ({
  getNormalizedSearchParamsKey: vi.fn((searchParams: URLSearchParams) =>
    `${searchParams.get("startDate")}:${searchParams.get("endDate")}`,
  ),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => sql),
}));

vi.mock("@/lib/db-schema-readiness", () => ({
  getDbSchemaReadiness: vi.fn(),
}));

vi.mock("@/lib/user-facing-report-cache-owners", () => ({
  warmGa4EcommerceFallbackCache: vi.fn(),
  warmGa4UserFacingRouteReportCache: vi.fn(),
}));

const ga4 = await import("@/lib/google-analytics-reporting");
const schemaReadiness = await import("@/lib/db-schema-readiness");
const cacheOwners = await import("@/lib/user-facing-report-cache-owners");
const { syncGA4Reports } = await import("@/lib/sync/ga4-sync");

describe("syncGA4Reports", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-09T00:00:00.000Z"));
    vi.resetAllMocks();
    sql.mockResolvedValue([]);
    vi.mocked(ga4.resolveGa4AnalyticsContext).mockResolvedValue({
      propertyId: "properties/123",
    } as never);
    vi.mocked(schemaReadiness.getDbSchemaReadiness).mockResolvedValue({
      ready: true,
      missingTables: [],
      checkedAt: "2026-04-09T00:00:00.000Z",
    });
    vi.mocked(cacheOwners.warmGa4UserFacingRouteReportCache).mockResolvedValue({
      reportType: "ga4_analytics_overview",
    } as never);
    vi.mocked(cacheOwners.warmGa4EcommerceFallbackCache).mockResolvedValue({
      reportType: "ecommerce_fallback",
      wrote: true,
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("warms overview and ecommerce fallback caches through the sync owner", async () => {
    const result = await syncGA4Reports("biz_1");

    expect(cacheOwners.warmGa4UserFacingRouteReportCache).toHaveBeenNthCalledWith(1, {
      businessId: "biz_1",
      reportType: "ga4_analytics_overview",
      startDate: "2026-03-10",
      endDate: "2026-04-09",
    });
    expect(cacheOwners.warmGa4EcommerceFallbackCache).toHaveBeenNthCalledWith(1, {
      businessId: "biz_1",
      startDate: "2026-03-10",
      endDate: "2026-04-09",
    });
    expect(cacheOwners.warmGa4UserFacingRouteReportCache).toHaveBeenNthCalledWith(2, {
      businessId: "biz_1",
      reportType: "ga4_analytics_overview",
      startDate: "2026-04-02",
      endDate: "2026-04-09",
    });
    expect(cacheOwners.warmGa4EcommerceFallbackCache).toHaveBeenNthCalledWith(2, {
      businessId: "biz_1",
      startDate: "2026-04-02",
      endDate: "2026-04-09",
    });
    expect(result).toEqual({
      businessId: "biz_1",
      attempted: 2,
      succeeded: 2,
      failed: 0,
      skipped: false,
    });
  });

  it("skips warming when GA4 auth is unavailable", async () => {
    vi.mocked(ga4.resolveGa4AnalyticsContext).mockRejectedValue(
      new ga4.GA4AuthError("ga4_not_connected", "Not connected", 404),
    );

    const result = await syncGA4Reports("biz_1");

    expect(result).toEqual({
      businessId: "biz_1",
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: true,
    });
    expect(cacheOwners.warmGa4UserFacingRouteReportCache).not.toHaveBeenCalled();
    expect(cacheOwners.warmGa4EcommerceFallbackCache).not.toHaveBeenCalled();
  });
});
