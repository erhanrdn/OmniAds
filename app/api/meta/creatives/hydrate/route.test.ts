import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/meta/creatives/hydrate/route";

vi.mock("@/lib/business-mode.server", () => ({
  isDemoBusiness: vi.fn(),
}));

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/meta/creatives-api", () => ({
  getMetaCreativeHydrationPayload: vi.fn(),
}));

const businessMode = await import("@/lib/business-mode.server");
const access = await import("@/lib/access");
const creativesApi = await import("@/lib/meta/creatives-api");

describe("POST /api/meta/creatives/hydrate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(businessMode.isDemoBusiness).mockResolvedValue(false);
  });

  it("rejects missing hydration items", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/meta/creatives/hydrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: "biz", items: [] }),
      })
    );

    expect(response.status).toBe(400);
  });

  it("routes bounded preview hydration through the meta creatives api helper", async () => {
    vi.mocked(creativesApi.getMetaCreativeHydrationPayload).mockResolvedValue({
      status: "ok",
      rows: [
        {
          rowId: "creative_1",
          creative_id: "cr_1",
          thumbnail_url: "https://example.com/thumb.jpg",
          table_thumbnail_url: "https://example.com/thumb.jpg",
          card_preview_url: "https://example.com/card.jpg",
          preview_url: "https://example.com/card.jpg",
          image_url: "https://example.com/card.jpg",
          cached_thumbnail_url: null,
          preview: {
            render_mode: "image",
            image_url: "https://example.com/card.jpg",
            video_url: null,
            poster_url: "https://example.com/thumb.jpg",
            source: "image_url",
            is_catalog: false,
          },
        },
      ],
    } as never);

    const response = await POST(
      new NextRequest("http://localhost/api/meta/creatives/hydrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: "biz",
          items: [{ rowId: "creative_1", creativeId: "cr_1" }],
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows).toHaveLength(1);
    expect(creativesApi.getMetaCreativeHydrationPayload).toHaveBeenCalledWith({
      businessId: "biz",
      items: [{ rowId: "creative_1", creativeId: "cr_1" }],
    });
  });
});
