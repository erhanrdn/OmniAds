import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { MetaCreativeApiRow } from "@/app/api/meta/creatives/route";
import { GET } from "@/app/api/meta/copies/route";

vi.mock("@/lib/business-mode.server", () => ({
  isDemoBusiness: vi.fn(),
}));

vi.mock("@/lib/access", () => ({
  requireBusinessAccess: vi.fn(),
}));

vi.mock("@/lib/demo-business", () => ({
  getDemoMetaCopies: vi.fn(() => ({ status: "ok", rows: [] })),
}));

vi.mock("@/lib/meta/creatives-api", () => ({
  getMetaCreativesApiPayload: vi.fn(),
}));

const businessMode = await import("@/lib/business-mode.server");
const access = await import("@/lib/access");
const creativesApi = await import("@/lib/meta/creatives-api");

function buildCreativeRow(overrides: Partial<MetaCreativeApiRow> = {}): MetaCreativeApiRow {
  return {
    id: "ad_1",
    creative_id: "cr_1",
    object_story_id: null,
    effective_object_story_id: null,
    post_id: null,
    associated_ads_count: 1,
    account_id: "act_1",
    account_name: "Main",
    campaign_id: "cmp_1",
    campaign_name: "Campaign 1",
    adset_id: "adset_1",
    adset_name: "Ad Set 1",
    currency: "USD",
    name: "Winning copy",
    launch_date: "2026-03-01",
    copy_text: "Buy now",
    copy_variants: ["Buy now"],
    headline_variants: ["Headline"],
    description_variants: ["Description"],
    copy_source: "direct_creative_extraction",
    copy_debug_sources: ["direct_creative_extraction"],
    unresolved_reason: null,
    preview_url: "https://example.com/preview.jpg",
    thumbnail_url: "https://example.com/thumb.jpg",
    image_url: "https://example.com/image.jpg",
    table_thumbnail_url: "https://example.com/table.jpg",
    card_preview_url: "https://example.com/card.jpg",
    cached_thumbnail_url: null,
    is_catalog: false,
    preview_state: "preview",
    preview: {
      render_mode: "image",
      image_url: "https://example.com/image.jpg",
      video_url: null,
      poster_url: null,
      source: "image_url",
      is_catalog: false,
    },
    preview_status: "ready",
    preview_origin: "snapshot",
    tags: [],
    ai_tags: {},
    format: "image",
    creative_type: "feed",
    creative_type_label: "Feed",
    spend: 100,
    purchase_value: 250,
    roas: 2.5,
    cpa: 10,
    cpc_link: 2,
    cpm: 12,
    ctr_all: 1.5,
    purchases: 10,
    impressions: 1000,
    link_clicks: 50,
    landing_page_views: 0,
    add_to_cart: 15,
    initiate_checkout: 0,
    leads: 0,
    messages: 0,
    thumbstop: 12,
    click_to_atc: 20,
    atc_to_purchase: 66,
    video25: 0,
    video50: 0,
    video75: 0,
    video100: 0,
    ...overrides,
  };
}

describe("GET /api/meta/copies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(access.requireBusinessAccess).mockResolvedValue({
      session: {} as never,
      membership: {} as never,
    });
    vi.mocked(businessMode.isDemoBusiness).mockResolvedValue(false);
  });

  it("derives copy rows from the shared snapshot/live creatives payload", async () => {
    vi.mocked(creativesApi.getMetaCreativesApiPayload).mockResolvedValue({
      status: "ok",
      rows: [buildCreativeRow()],
      snapshot_source: "persisted",
    } as never);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/meta/copies?businessId=biz&start=2026-03-01&end=2026-03-31&groupBy=copy"
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0].copy_text).toBe("Buy now");
    expect(creativesApi.getMetaCreativesApiPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "biz",
        mediaMode: "metadata",
        enableCopyRecovery: true,
        enableCreativeDetails: false,
        enableThumbnailBackfill: false,
        enableCardThumbnailBackfill: false,
        enableMediaRecovery: false,
      })
    );
  });
});
