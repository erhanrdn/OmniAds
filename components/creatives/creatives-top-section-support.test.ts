import { describe, expect, it } from "vitest";
import { mapApiRowToUiRow } from "@/app/(dashboard)/creatives/page-support";
import { applyCreativeFilters } from "@/components/creatives/creatives-top-section-support";
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
    preview_manifest: null,
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
    ai_tags: {
      messagingAngle: ["utility"],
      hookTactic: ["travel_pack"],
    },
    format: "image",
    creative_type: "feed",
    creative_type_label: "Feed",
    creative_delivery_type: "standard",
    creative_visual_format: "image",
    creative_primary_type: "standard",
    creative_primary_label: "Standard",
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
    clicks: 75,
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

describe("applyCreativeFilters", () => {
  it("filters deterministic taxonomy fields directly from the creative row", () => {
    const rows = [
      mapApiRowToUiRow(buildApiRow()),
      mapApiRowToUiRow(
        buildApiRow({
          id: "ad_2",
          creative_id: "cr_2",
          creative_primary_label: "Catalog",
          creative_visual_format: "video",
        }),
      ),
    ];

    const result = applyCreativeFilters(rows, [
      {
        id: "rule_1",
        field: "creativePrimaryLabel",
        operator: "equals",
        query: "Catalog",
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("ad_2");
  });

  it("filters Decision OS fields and AI tags without mixing the provenance sources", () => {
    const rows = [
      mapApiRowToUiRow(buildApiRow()),
      mapApiRowToUiRow(
        buildApiRow({
          id: "ad_2",
          creative_id: "cr_2",
          ai_tags: {
            messagingAngle: ["social_proof"],
            hookTactic: ["before_after"],
          },
        }),
      ),
    ];

    const decisionOs = {
      creatives: [
        {
          creativeId: "ad_1",
          lifecycleState: "scale_ready",
          primaryAction: "promote_to_scaling",
          familySource: "copy_signature",
          trust: { surfaceLane: "action_core" },
          deployment: {
            targetLane: "Scaling",
            compatibility: { status: "compatible" },
          },
        },
        {
          creativeId: "ad_2",
          lifecycleState: "validating",
          primaryAction: "keep_in_test",
          familySource: "singleton",
          trust: { surfaceLane: "watchlist" },
          deployment: {
            targetLane: "Test",
            compatibility: { status: "limited" },
          },
        },
      ],
    } as any;

    const result = applyCreativeFilters(
      rows,
      [
        {
          id: "rule_1",
          field: "deploymentCompatibilityStatus",
          operator: "equals",
          query: "compatible",
        },
        {
          id: "rule_2",
          field: "messagingAngle",
          operator: "equals",
          query: "utility",
        },
      ],
      decisionOs,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("ad_1");
  });
});
