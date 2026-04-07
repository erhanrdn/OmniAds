import { describe, expect, it } from "vitest";
import { buildMetaCreativeApiRowLightweight } from "@/lib/meta/creatives-service-support";
import type { RawCreativeRow } from "@/lib/meta/creatives-types";

function buildRawRow(overrides: Partial<RawCreativeRow> = {}): RawCreativeRow {
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
    name: "Creative 1",
    launch_date: "2026-03-01",
    copy_text: "Buy now",
    copy_variants: ["Buy now"],
    headline_variants: ["Headline"],
    description_variants: ["Description"],
    copy_source: "creative.body",
    copy_debug_sources: ["creative.body"],
    unresolved_reason: null,
    preview_url: "https://example.com/preview.jpg",
    preview_source: "image_url",
    thumbnail_url: "https://example.com/thumb.jpg",
    image_url: "https://example.com/image.jpg",
    table_thumbnail_url: "https://example.com/table.jpg",
    card_preview_url: "https://example.com/card.jpg",
    preview_contract_version: "v5",
    preview_manifest: {
      table_src: "https://example.com/table.jpg",
      card_src: "https://example.com/card.jpg",
      detail_image_src: "https://example.com/image.jpg",
      detail_video_src: null,
      render_state: "renderable_high_quality",
      card_state: "ready",
      waiting_reason: null,
      table_source_kind: "thumbnail_static",
      card_source_kind: "non_thumbnail_static",
      resolution_class: "high_res",
      thumbnail_like: false,
      source_reason: "card_prefer_non_thumbnail",
      needs_card_enrichment: false,
      live_html_available: true,
    },
    card_preview_source_kind: "non_thumbnail_static",
    card_preview_resolution_class: "high_res",
    table_preview_source_kind: "thumbnail_static",
    preview_source_reason: "card_prefer_non_thumbnail",
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
    tags: [],
    ai_tags: {},
    format: "image",
    creative_type: "feed",
    creative_type_label: "Feed",
    creative_delivery_type: "standard",
    creative_visual_format: "image",
    creative_primary_type: "standard",
    creative_primary_label: "Standard",
    creative_secondary_type: null,
    creative_secondary_label: null,
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
    landing_page_views: 20,
    add_to_cart: 15,
    initiate_checkout: 5,
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

describe("buildMetaCreativeApiRowLightweight", () => {
  it("reuses persisted preview metadata without rebuilding derived preview fields", () => {
    const row = buildMetaCreativeApiRowLightweight({
      row: buildRawRow(),
      includeDebugFields: false,
    });

    expect(row.preview_manifest?.card_src).toBe("https://example.com/card.jpg");
    expect(row.preview_status).toBe("ready");
    expect(row.preview_origin).toBe("snapshot");
    expect(row.thumbnail_url).toBe("https://example.com/table.jpg");
    expect(row.image_url).toBe("https://example.com/card.jpg");
    expect(row.taxonomy_source).toBe("deterministic");
  });
});
