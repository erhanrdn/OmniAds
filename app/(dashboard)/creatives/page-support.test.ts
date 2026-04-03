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
    preview_manifest: {
      table_src: "https://example.com/table.jpg",
      card_src: "https://example.com/card.jpg",
      detail_image_src: "https://example.com/image.jpg",
      detail_video_src: null,
      render_state: "renderable_high_quality",
      table_source_kind: "thumbnail_static",
      card_source_kind: "non_thumbnail_static",
      resolution_class: "high_res",
      thumbnail_like: false,
      source_reason: "card_prefer_non_thumbnail",
      needs_card_enrichment: false,
      live_html_available: true,
    },
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
    taxonomy_version: "v2",
    taxonomy_source: "deterministic",
    taxonomy_reconciled_by_video_evidence: false,
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

    expect(row.creativePrimaryType).toBe("catalog");
    expect(row.creativePrimaryLabel).toBe("Catalog");
    expect(row.creativeSecondaryType).toBe("video");
    expect(row.creativeSecondaryLabel).toBe("Video");
    expect(row.taxonomyVersion).toBe("v2");
    expect(row.taxonomySource).toBe("deterministic");
    expect(row.taxonomyReconciledByVideoEvidence).toBe(false);
  });

  it("keeps legacy aliases exactly as provided by the API", () => {
    const row = mapApiRowToUiRow(
      buildApiRow({
        format: "image",
        creative_type: "feed",
        creative_type_label: "Feed",
        creative_delivery_type: "catalog",
        creative_visual_format: "video",
        creative_primary_type: "video",
        creative_primary_label: "Video",
        creative_secondary_type: null,
        creative_secondary_label: null,
      })
    );

    expect(row.format).toBe("image");
    expect(row.creativeType).toBe("feed");
    expect(row.creativeTypeLabel).toBe("Feed");
    expect(row.creativeVisualFormat).toBe("video");
    expect(row.creativePrimaryType).toBe("video");
  });

  it("does not reinterpret taxonomy on the client from preview evidence", () => {
    const row = mapApiRowToUiRow(
      buildApiRow({
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
        taxonomy_reconciled_by_video_evidence: false,
      })
    );

    expect(row.creativeVisualFormat).toBe("image");
    expect(row.creativePrimaryType).toBe("standard");
    expect(row.creativePrimaryLabel).toBe("Standard");
    expect(row.taxonomyReconciledByVideoEvidence).toBe(false);
  });

  it("defaults rows without taxonomy metadata to legacy fallback", () => {
    const row = mapApiRowToUiRow(
      buildApiRow({
        creative_delivery_type: undefined as never,
        creative_visual_format: undefined as never,
        creative_primary_type: undefined as never,
        creative_primary_label: undefined as never,
        creative_secondary_type: undefined as never,
        creative_secondary_label: undefined as never,
        taxonomy_version: undefined,
        taxonomy_source: undefined,
        taxonomy_reconciled_by_video_evidence: undefined,
        format: "video",
        creative_type: "video",
        creative_type_label: "Video",
      })
    );

    expect(row.creativePrimaryType).toBe("standard");
    expect(row.creativePrimaryLabel).toBeNull();
    expect(row.creativeSecondaryType).toBeNull();
    expect(row.taxonomySource).toBe("legacy_fallback");
    expect(row.format).toBe("video");
    expect(row.creativeType).toBe("video");
    expect(row.creativeTypeLabel).toBe("Video");
  });
});
