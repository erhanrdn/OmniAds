import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { MetaCreativesSnapshotRecord } from "@/lib/meta-creatives-snapshot";
import type { MetaCreativeApiRow } from "@/lib/meta/creatives-types";
import { buildMetaCreativesSnapshotPayload } from "@/lib/meta/creatives-snapshot-helpers";
import { buildCreativesResponse, type CreativesQueryParams } from "@/lib/meta/creatives-service";

vi.mock("@/lib/media-cache/media-service", () => ({
  MediaCacheService: {
    resolveUrls: vi.fn(async () => new Map()),
  },
}));

vi.mock("@/lib/meta-creatives-snapshot", async () => {
  const actual = await vi.importActual<typeof import("@/lib/meta-creatives-snapshot")>(
    "@/lib/meta-creatives-snapshot"
  );
  return {
    ...actual,
    getMetaCreativesSnapshot: vi.fn(),
    persistMetaCreativesSnapshot: vi.fn(),
  };
});

vi.mock("@/lib/meta/creatives-snapshot-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/meta/creatives-snapshot-helpers")>(
    "@/lib/meta/creatives-snapshot-helpers"
  );
  return {
    ...actual,
    triggerSnapshotRefresh: vi.fn(),
  };
});

const snapshotStore = await import("@/lib/meta-creatives-snapshot");
const snapshotHelpers = await import("@/lib/meta/creatives-snapshot-helpers");

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

function buildSnapshotRecord(input: {
  payload: Record<string, unknown>;
  lastSyncedAt?: string;
}): MetaCreativesSnapshotRecord {
  return {
    snapshotKey: "snapshot-key",
    businessId: "biz",
    assignedAccountsHash: "hash",
    payload: input.payload,
    snapshotLevel: "metadata",
    rowCount: Array.isArray(input.payload.rows) ? input.payload.rows.length : 0,
    previewReadyCount: Array.isArray(input.payload.rows) ? input.payload.rows.length : 0,
    lastSyncedAt: input.lastSyncedAt ?? new Date().toISOString(),
    refreshStartedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function buildQuery(): CreativesQueryParams {
  return {
    businessId: "biz",
    assignedAccountIds: [],
    accessToken: "token",
    mediaMode: "metadata",
    enableFullMediaHydration: false,
    groupBy: "creative",
    format: "all",
    sort: "roas",
    start: "2026-03-01",
    end: "2026-03-31",
    debugPreview: false,
    debugThumbnail: false,
    debugPerf: false,
    snapshotBypass: false,
    snapshotWarm: false,
    enableCopyRecovery: true,
    enableCreativeBasicsFallback: false,
    enableCreativeDetails: false,
    enableThumbnailBackfill: false,
    enableCardThumbnailBackfill: false,
    enableImageHashLookup: false,
    enableMediaRecovery: false,
    enableMediaCache: false,
    enableDeepAudit: false,
    perAccountSampleLimit: 5,
    requestStartedAt: Date.now(),
  };
}

describe("buildCreativesResponse snapshot freshness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(snapshotStore.getMetaCreativesSnapshot).mockResolvedValue(null);
  });

  it("reuses a healthy deterministic v2 snapshot", async () => {
    vi.mocked(snapshotStore.getMetaCreativesSnapshot).mockResolvedValue(
      buildSnapshotRecord({
        payload: buildMetaCreativesSnapshotPayload({
          status: "ok",
          rows: [buildRow()],
          mediaHydrated: false,
        }),
      })
    );

    const response = await buildCreativesResponse(
      buildQuery(),
      new NextRequest("http://localhost/api/meta/creatives?businessId=biz")
    );

    expect(response.status).toBe("ok");
    expect(response.snapshot_source).toBe("persisted");
    expect(response.rows).toHaveLength(1);
    expect(snapshotHelpers.triggerSnapshotRefresh).not.toHaveBeenCalled();
    expect(snapshotStore.persistMetaCreativesSnapshot).not.toHaveBeenCalled();
  });

  it("bypasses a snapshot missing taxonomy schema metadata and falls through to live", async () => {
    vi.mocked(snapshotStore.getMetaCreativesSnapshot).mockResolvedValue(
      buildSnapshotRecord({
        payload: {
          status: "ok",
          rows: [buildRow()],
          media_hydrated: false,
        },
      })
    );

    const response = await buildCreativesResponse(
      buildQuery(),
      new NextRequest("http://localhost/api/meta/creatives?businessId=biz")
    );

    expect(response.status).toBe("no_data");
    expect(snapshotHelpers.triggerSnapshotRefresh).toHaveBeenCalledTimes(1);
  });

  it("bypasses a snapshot missing preview contract metadata and falls through to live", async () => {
    const payload = buildMetaCreativesSnapshotPayload({
      status: "ok",
      rows: [buildRow()],
      mediaHydrated: false,
    });
    delete payload.preview_contract_version;

    vi.mocked(snapshotStore.getMetaCreativesSnapshot).mockResolvedValue(
      buildSnapshotRecord({
        payload,
      })
    );

    const response = await buildCreativesResponse(
      buildQuery(),
      new NextRequest("http://localhost/api/meta/creatives?businessId=biz")
    );

    expect(response.status).toBe("no_data");
    expect(snapshotHelpers.triggerSnapshotRefresh).toHaveBeenCalledTimes(1);
  });

  it("returns a healthy stale-by-time snapshot immediately and schedules refresh", async () => {
    vi.mocked(snapshotStore.getMetaCreativesSnapshot).mockResolvedValue(
      buildSnapshotRecord({
        payload: buildMetaCreativesSnapshotPayload({
          status: "ok",
          rows: [buildRow()],
          mediaHydrated: false,
        }),
        lastSyncedAt: new Date(Date.now() - 11 * 60_000).toISOString(),
      })
    );

    const response = await buildCreativesResponse(
      buildQuery(),
      new NextRequest("http://localhost/api/meta/creatives?businessId=biz")
    );

    expect(response.status).toBe("ok");
    expect(response.snapshot_source).toBe("persisted");
    expect(snapshotHelpers.triggerSnapshotRefresh).toHaveBeenCalledTimes(1);
  });

  it("still bypasses suspicious empty-copy snapshots", async () => {
    vi.mocked(snapshotStore.getMetaCreativesSnapshot).mockResolvedValue(
      buildSnapshotRecord({
        payload: buildMetaCreativesSnapshotPayload({
          status: "ok",
          rows: [
            buildRow({
              copy_text: null,
              copy_variants: [],
              headline_variants: [],
              description_variants: [],
              copy_source: null,
              copy_debug_sources: [],
              unresolved_reason: null,
            }),
          ],
          mediaHydrated: false,
        }),
      })
    );

    const response = await buildCreativesResponse(
      buildQuery(),
      new NextRequest("http://localhost/api/meta/creatives?businessId=biz")
    );

    expect(response.status).toBe("no_data");
    expect(snapshotHelpers.triggerSnapshotRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not persist metadata over an existing full preview snapshot", async () => {
    vi.mocked(snapshotStore.getMetaCreativesSnapshot).mockResolvedValue(
      buildSnapshotRecord({
        payload: buildMetaCreativesSnapshotPayload({
          status: "ok",
          rows: [buildRow()],
          mediaHydrated: true,
        }),
      })
    );

    const response = await buildCreativesResponse(
      {
        ...buildQuery(),
        snapshotBypass: true,
      },
      new NextRequest("http://localhost/api/meta/creatives?businessId=biz")
    );

    expect(response.status).toBe("no_data");
    expect(snapshotStore.persistMetaCreativesSnapshot).not.toHaveBeenCalled();
  });
});
