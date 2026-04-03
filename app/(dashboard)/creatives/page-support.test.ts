import { describe, expect, it } from "vitest";
import { mapApiRowToUiRow } from "@/app/(dashboard)/creatives/page-support";
import type { MetaCreativeApiRow } from "@/app/api/meta/creatives/route";

function buildApiRow(overrides: Partial<MetaCreativeApiRow> = {}): MetaCreativeApiRow {
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
    name: "Creative name",
    launch_date: "2026-03-01",
    copy_text: "Buy now",
    copy_variants: ["Buy now"],
    headline_variants: ["Headline"],
    description_variants: ["Description"],
    copy_source: null,
    copy_debug_sources: [],
    unresolved_reason: null,
    preview_url: "https://example.com/preview.jpg",
    preview_source: "image_url",
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
    creative_delivery_type: "catalog",
    creative_visual_format: "video",
    creative_primary_type: "catalog",
    creative_primary_label: "Catalog",
    creative_secondary_type: "video",
    creative_secondary_label: "Video",
    classification_signals: null,
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

describe("mapApiRowToUiRow", () => {
  it("maps new taxonomy labels to the UI row", () => {
    const row = mapApiRowToUiRow(buildApiRow());

    expect(row.format).toBe("catalog");
    expect(row.creativeType).toBe("feed_catalog");
    expect(row.creativeTypeLabel).toBe("Feed (Catalog ads)");
    expect(row.creativePrimaryType).toBe("catalog");
    expect(row.creativePrimaryLabel).toBe("Catalog");
    expect(row.creativeSecondaryType).toBe("video");
    expect(row.creativeSecondaryLabel).toBe("Video");
  });

  it("prefers taxonomy over stale legacy format fields", () => {
    const row = mapApiRowToUiRow(
      buildApiRow({
        format: "image",
        creative_type: "feed",
        creative_type_label: "Feed",
        creative_delivery_type: "standard",
        creative_visual_format: "video",
        creative_primary_type: "video",
        creative_primary_label: "Video",
        creative_secondary_type: null,
        creative_secondary_label: null,
      })
    );

    expect(row.format).toBe("video");
    expect(row.creativeType).toBe("video");
    expect(row.creativeTypeLabel).toBe("Video");
    expect(row.creativeVisualFormat).toBe("video");
  });

  it("upgrades stale image taxonomy when preview evidence proves video", () => {
    const row = mapApiRowToUiRow(
      buildApiRow({
        format: "image",
        creative_type: "feed",
        creative_type_label: "Feed",
        creative_delivery_type: "standard",
        creative_visual_format: "image",
        creative_primary_type: "standard",
        creative_primary_label: "Standard",
        creative_secondary_type: null,
        creative_secondary_label: null,
        preview: {
          render_mode: "video",
          image_url: "https://example.com/poster.jpg",
          video_url: "https://example.com/video.mp4",
          poster_url: "https://example.com/poster.jpg",
          source: "image_url",
          is_catalog: false,
        },
        thumbstop: 0,
        video25: 0,
        video50: 0,
        video75: 0,
        video100: 0,
      })
    );

    expect(row.format).toBe("video");
    expect(row.creativeType).toBe("video");
    expect(row.creativeTypeLabel).toBe("Video");
    expect(row.creativeVisualFormat).toBe("video");
    expect(row.creativePrimaryType).toBe("video");
    expect(row.creativePrimaryLabel).toBe("Video");
  });

  it("backfills taxonomy from legacy fields when new fields are missing", () => {
    const row = mapApiRowToUiRow(
      buildApiRow({
        creative_delivery_type: undefined as never,
        creative_visual_format: undefined as never,
        creative_primary_type: undefined as never,
        creative_primary_label: undefined as never,
        creative_secondary_type: undefined as never,
        creative_secondary_label: undefined as never,
        format: "video",
        creative_type: "video",
      })
    );

    expect(row.creativePrimaryType).toBe("video");
    expect(row.creativePrimaryLabel).toBe("Video");
    expect(row.creativeSecondaryType).toBeNull();
  });
});
