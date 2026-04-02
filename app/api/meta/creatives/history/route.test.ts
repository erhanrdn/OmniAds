import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/meta/creatives/history/route";

vi.mock("@/lib/business-mode.server", () => ({
  isDemoBusiness: vi.fn(),
}));

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/demo-business", () => ({
  getDemoMetaCreatives: vi.fn(() => ({ status: "ok", rows: [] })),
}));

vi.mock("@/lib/meta/creatives-api", () => ({
  getMetaCreativesDbPayload: vi.fn(),
}));

const businessMode = await import("@/lib/business-mode.server");
const access = await import("@/lib/access");
const creativesApi = await import("@/lib/meta/creatives-api");

describe("GET /api/meta/creatives/history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(businessMode.isDemoBusiness).mockResolvedValue(false);
  });

  it("serves warehouse-backed archive rows without triggering the live surface path", async () => {
    vi.mocked(creativesApi.getMetaCreativesDbPayload).mockResolvedValue({
      status: "ok",
      rows: [],
      snapshot_source: "persisted",
    } as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/creatives/history?businessId=biz&start=2026-03-01&end=2026-03-31&groupBy=creative"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(creativesApi.getMetaCreativesDbPayload).toHaveBeenCalledWith({
      businessId: "biz",
      mediaMode: "metadata",
      groupBy: "creative",
      format: "all",
      sort: "roas",
      start: "2026-03-01",
      end: "2026-03-31",
    });
  });
});
