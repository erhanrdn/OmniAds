import { describe, expect, it } from "vitest";
import type { MetaCreativeApiRow } from "@/lib/meta/creatives-types";
import {
  buildMetaCreativesSnapshotPayload,
  buildMetaCreativesSnapshotTaxonomySummary,
  evaluateMetaCreativesSnapshotTaxonomyHealth,
  META_CREATIVES_SNAPSHOT_SCHEMA_VERSION,
} from "@/lib/meta/creatives-snapshot-helpers";

function buildRow(overrides: Partial<MetaCreativeApiRow> = {}): MetaCreativeApiRow {
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

describe("creatives snapshot taxonomy health", () => {
  it("builds persisted payload metadata for deterministic rows", () => {
    const rows = [buildRow(), buildRow({ id: "ad_2", creative_id: "cr_2" })];
    const payload = buildMetaCreativesSnapshotPayload({
      status: "ok",
      rows,
      mediaHydrated: true,
    });

    expect(payload.snapshot_schema_version).toBe(META_CREATIVES_SNAPSHOT_SCHEMA_VERSION);
    expect(payload.taxonomy_version).toBe("v2");
    expect(payload.preview_contract_version).toBe("v2");
    expect(payload.taxonomy_summary).toEqual({
      total_rows: 2,
      deterministic_rows: 2,
      legacy_fallback_rows: 0,
      missing_taxonomy_version_rows: 0,
      missing_taxonomy_source_rows: 0,
    });
  });

  it("counts deterministic, legacy fallback, and missing taxonomy fields", () => {
    const summary = buildMetaCreativesSnapshotTaxonomySummary([
      buildRow(),
      buildRow({
        id: "ad_2",
        creative_id: "cr_2",
        taxonomy_source: "legacy_fallback",
        creative_primary_label: null,
      }),
      buildRow({
        id: "ad_3",
        creative_id: "cr_3",
        taxonomy_version: undefined,
        taxonomy_source: undefined,
        creative_primary_label: null,
      }),
    ]);

    expect(summary).toEqual({
      total_rows: 3,
      deterministic_rows: 1,
      legacy_fallback_rows: 1,
      missing_taxonomy_version_rows: 1,
      missing_taxonomy_source_rows: 1,
    });
  });

  it("treats a v2 deterministic snapshot as fresh", () => {
    const payload = buildMetaCreativesSnapshotPayload({
      status: "ok",
      rows: [buildRow()],
      mediaHydrated: false,
    });

    expect(evaluateMetaCreativesSnapshotTaxonomyHealth(payload)).toEqual({
      snapshotSchemaVersion: META_CREATIVES_SNAPSHOT_SCHEMA_VERSION,
      taxonomyVersion: "v2",
      previewContractVersion: "v2",
      taxonomySummary: {
        total_rows: 1,
        deterministic_rows: 1,
        legacy_fallback_rows: 0,
        missing_taxonomy_version_rows: 0,
        missing_taxonomy_source_rows: 0,
      },
      isTaxonomyStale: false,
      reasonCodes: [],
    });
  });

  it("marks snapshots stale when persisted metadata is missing", () => {
    const health = evaluateMetaCreativesSnapshotTaxonomyHealth({
      status: "ok",
      rows: [buildRow()],
      media_hydrated: false,
    });

    expect(health.isTaxonomyStale).toBe(true);
    expect(health.reasonCodes).toEqual([
      "snapshot_schema_version_mismatch",
      "taxonomy_version_mismatch",
      "preview_contract_version_mismatch",
    ]);
  });

  it("marks snapshots stale when rows are missing taxonomy fields or use legacy fallback", () => {
    const health = evaluateMetaCreativesSnapshotTaxonomyHealth(
      buildMetaCreativesSnapshotPayload({
        status: "ok",
        rows: [
          buildRow({
            taxonomy_source: "legacy_fallback",
            creative_primary_label: null,
          }),
          buildRow({
            id: "ad_2",
            creative_id: "cr_2",
            taxonomy_version: undefined,
            taxonomy_source: undefined,
            creative_primary_label: null,
          }),
        ],
        mediaHydrated: false,
      })
    );

    expect(health.isTaxonomyStale).toBe(true);
    expect(health.reasonCodes).toEqual([
      "rows_missing_taxonomy_version",
      "rows_missing_taxonomy_source",
      "rows_legacy_fallback",
    ]);
    expect(health.taxonomySummary).toEqual({
      total_rows: 2,
      deterministic_rows: 0,
      legacy_fallback_rows: 1,
      missing_taxonomy_version_rows: 1,
      missing_taxonomy_source_rows: 1,
    });
  });

  it("marks snapshots stale when preview contract metadata is missing", () => {
    const payload = buildMetaCreativesSnapshotPayload({
      status: "ok",
      rows: [buildRow()],
      mediaHydrated: false,
    });
    delete payload.preview_contract_version;

    const health = evaluateMetaCreativesSnapshotTaxonomyHealth(payload);

    expect(health.isTaxonomyStale).toBe(true);
    expect(health.reasonCodes).toEqual(["preview_contract_version_mismatch"]);
  });
});
