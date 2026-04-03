import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/meta/recommendations/route";

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/business-mode.server", () => ({
  isDemoBusiness: vi.fn(),
}));

vi.mock("@/lib/request-language", () => ({
  resolveRequestLanguage: vi.fn(),
}));

vi.mock("@/lib/meta/config-snapshots", () => ({
  readMetaBidRegimeHistorySummaries: vi.fn(),
}));

vi.mock("@/lib/meta/recommendations", () => ({
  buildMetaRecommendations: vi.fn(() => ({ status: "ok", items: [] })),
}));

vi.mock("@/lib/meta/creative-intelligence", () => ({
  buildMetaCreativeIntelligence: vi.fn(() => ({ rows: [] })),
}));

vi.mock("@/lib/meta/creative-score-service", () => ({
  getCreativeScoreSnapshot: vi.fn(async () => ({
    selectedRows: [],
    historyById: new Map(),
    decisionsById: new Map(),
    computedAt: new Date().toISOString(),
    freshnessState: "fresh",
    ruleVersion: "meta-creative-score-v1",
  })),
}));

const access = await import("@/lib/access");
const businessMode = await import("@/lib/business-mode.server");
const requestLanguage = await import("@/lib/request-language");
const configSnapshots = await import("@/lib/meta/config-snapshots");

describe("GET /api/meta/recommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(businessMode.isDemoBusiness).mockResolvedValue(false);
    vi.mocked(requestLanguage.resolveRequestLanguage).mockResolvedValue("en");
    vi.mocked(configSnapshots.readMetaBidRegimeHistorySummaries).mockResolvedValue(new Map());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
        const pathname = url.pathname;

        if (pathname === "/api/meta/campaigns") {
          return new Response(JSON.stringify({ rows: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (pathname === "/api/meta/breakdowns") {
          return new Response(JSON.stringify({ rows: [], summary: null }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response("not found", { status: 404 });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads creative scoring from the score snapshot service without creative history fanout", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/recommendations?businessId=biz&startDate=2026-03-01&endDate=2026-03-31"
      )
    );
    const payload = await response.json();
    const calls = vi.mocked(global.fetch).mock.calls.map(([input]) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      return url.pathname;
    });

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(calls).not.toContain("/api/meta/creatives");
    expect(calls).not.toContain("/api/meta/creatives/history");
  });
});
