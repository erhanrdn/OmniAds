import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/business-mode.server", () => ({
  isDemoBusiness: vi.fn(),
}));

vi.mock("@/lib/search-console", () => ({
  resolveSearchConsoleContext: vi.fn(),
  SearchConsoleAuthError: class SearchConsoleAuthError extends Error {
    status = 401;
    code = "search_console_not_connected";
  },
}));

vi.mock("@/lib/geo-momentum", () => ({
  computePreviousPeriod: vi.fn(() => ({
    prevStart: "2026-03-01",
    prevEnd: "2026-03-30",
  })),
}));

vi.mock("@/lib/seo/intelligence", () => ({
  buildDemoPreviousRows: vi.fn(),
  buildSeoOverviewPayload: vi.fn(),
  fetchSearchConsoleAnalyticsRows: vi.fn(),
  SearchConsoleApiError: class SearchConsoleApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.name = "SearchConsoleApiError";
      this.status = status;
    }
  },
}));

vi.mock("@/lib/seo/results-cache", () => ({
  getSeoResultsCache: vi.fn(),
}));

const access = await import("@/lib/access");
const businessMode = await import("@/lib/business-mode.server");
const searchConsole = await import("@/lib/search-console");
const seoIntelligence = await import("@/lib/seo/intelligence");
const seoResultsCache = await import("@/lib/seo/results-cache");
const { ProviderRequestCooldownError } = await import("@/lib/provider-request-governance");
const { GET } = await import("@/app/api/seo/overview/route");

describe("GET /api/seo/overview", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      businessId: "biz_1",
    } as never);
    vi.mocked(businessMode.isDemoBusiness).mockResolvedValue(false as never);
    vi.mocked(searchConsole.resolveSearchConsoleContext).mockResolvedValue({
      accessToken: "token",
      siteUrl: "https://example.com",
    } as never);
  });

  it("serves stale cached SEO data instead of failing when Search Console is in cooldown", async () => {
    const stalePayload = {
      summary: { clicks: 10 },
      movers: [],
    };
    vi.mocked(seoResultsCache.getSeoResultsCache)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(stalePayload as never);
    vi.mocked(seoIntelligence.fetchSearchConsoleAnalyticsRows).mockRejectedValue(
      new ProviderRequestCooldownError({
        provider: "search_console",
        businessId: "biz_1",
        requestType: "seo_overview:abc",
        message: "cooldown",
        retryAfterMs: 60_000,
        status: 503,
      }),
    );

    const request = new NextRequest(
      "http://localhost:3000/api/seo/overview?businessId=biz_1&startDate=2026-03-31&endDate=2026-04-14",
    );

    const response = await GET(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(stalePayload);
    expect(seoResultsCache.getSeoResultsCache).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        businessId: "biz_1",
        cacheType: "overview",
        maxAgeMs: 7 * 24 * 60 * 60 * 1000,
      }),
    );
  });
});
