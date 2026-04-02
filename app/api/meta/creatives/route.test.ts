import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/meta/creatives/route";

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
  getMetaCreativesApiPayload: vi.fn(),
}));

const businessMode = await import("@/lib/business-mode.server");
const access = await import("@/lib/access");
const creativesApi = await import("@/lib/meta/creatives-api");

describe("GET /api/meta/creatives", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(businessMode.isDemoBusiness).mockResolvedValue(false);
  });

  it("uses snapshot-first creatives payload for the main surface", async () => {
    vi.mocked(creativesApi.getMetaCreativesApiPayload).mockResolvedValue({
      status: "ok",
      rows: [],
      snapshot_source: "persisted",
    } as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/creatives?businessId=biz&start=2026-03-01&end=2026-03-31&groupBy=creative&mediaMode=full"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.snapshot_source).toBe("persisted");
    expect(creativesApi.getMetaCreativesApiPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz",
        start: "2026-03-01",
        end: "2026-03-31",
        groupBy: "creative",
        mediaMode: "full",
        snapshotBypass: false,
        snapshotWarm: false,
      })
    );
  });

  it("rejects deprecated detail preview requests on the main route", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/creatives?businessId=biz&detailPreviewCreativeId=cr_1"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("detail_preview_moved");
    expect(creativesApi.getMetaCreativesApiPayload).not.toHaveBeenCalled();
  });
});
