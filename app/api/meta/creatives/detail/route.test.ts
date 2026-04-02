import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/meta/creatives/detail/route";

vi.mock("@/lib/business-mode.server", () => ({
  isDemoBusiness: vi.fn(),
}));

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/meta/creatives-api", () => ({
  getMetaCreativeDetailPayload: vi.fn(),
}));

const businessMode = await import("@/lib/business-mode.server");
const access = await import("@/lib/access");
const creativesApi = await import("@/lib/meta/creatives-api");

describe("GET /api/meta/creatives/detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(businessMode.isDemoBusiness).mockResolvedValue(false);
  });

  it("rejects missing creative ids", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/meta/creatives/detail?businessId=biz")
    );

    expect(response.status).toBe(400);
  });

  it("routes detail requests through the live creative payload path", async () => {
    vi.mocked(creativesApi.getMetaCreativeDetailPayload).mockResolvedValue({
      status: "ok",
      detail_preview: {
        creative_id: "cr_1",
        mode: "html",
        html: "<div />",
      },
    } as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/creatives/detail?businessId=biz&creativeId=cr_1"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.detail_preview.creative_id).toBe("cr_1");
    expect(creativesApi.getMetaCreativeDetailPayload).toHaveBeenCalledWith({
      businessId: "biz",
      creativeId: "cr_1",
    });
  });
});
