import { NextRequest } from "next/server";
import { getIntegration } from "@/lib/integrations";
import {
  coerceCreativeTaxonomyFromLegacy,
  deriveLegacyCreativeClassification,
  reconcileCreativeTaxonomyWithVideoEvidence,
} from "@/lib/meta/creative-taxonomy";
import { fetchAssignedAccountIds } from "@/lib/meta/creatives-fetchers";
import { buildCreativesResponse } from "@/lib/meta/creatives-service";
import type {
  FormatFilter,
  GroupBy,
  MetaCreativeApiRow,
  RawCreativeRow,
  SortKey,
} from "@/lib/meta/creatives-types";
import { buildMetaCreativeApiRow } from "@/lib/meta/creatives-service-support";
import {
  groupRows,
  sortRows,
} from "@/lib/meta/creatives-row-mappers";
import {
  getMetaAdDailyCoverage,
  getMetaAdDailyPreviewCoverage,
  getMetaAdDailyRange,
  getMetaCreativeDailyRange,
  upsertMetaAdDailyRows,
  upsertMetaCreativeDailyRows,
} from "@/lib/meta/warehouse";
import type { MetaAdDailyRow, MetaCreativeDailyRow } from "@/lib/meta/warehouse-types";
import {
  getCreativeMediaRetentionStart,
} from "@/lib/meta/history";
import { pruneMetaCreativeMediaOutsideRetention } from "@/lib/meta/cleanup";

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function enumerateDays(startDate: string, endDate: string, recentFirst = true) {
  const rows: string[] = [];
  let cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    rows.push(toIsoDate(cursor));
    cursor = addDays(cursor, 1);
  }
  return recentFirst ? rows.reverse() : rows;
}

function normalizeCreativeRows(rows: RawCreativeRow[], format: FormatFilter) {
  if (format === "all") return rows;
  return rows.filter((row) => row.format === format);
}

function buildCreativeUsageMap(rows: RawCreativeRow[]) {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const bucket = map.get(row.creative_id) ?? new Set<string>();
    bucket.add(row.id);
    map.set(row.creative_id, bucket);
  }
  return map;
}

function coerceRawCreativeRow(value: unknown): RawCreativeRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<RawCreativeRow>;
  if (typeof row.id === "string" && typeof row.creative_id === "string" && "copy_text" in row) {
    const creativeTaxonomy =
      row.creative_primary_type
        ? {
            creative_delivery_type: row.creative_delivery_type ?? "standard",
            creative_visual_format: row.creative_visual_format ?? "image",
            creative_primary_type: row.creative_primary_type,
            creative_primary_label: row.creative_primary_label ?? null,
            creative_secondary_type: row.creative_secondary_type ?? null,
            creative_secondary_label: row.creative_secondary_label ?? null,
            classification_signals: row.classification_signals ?? null,
          }
        : coerceCreativeTaxonomyFromLegacy({
            format: row.format ?? "image",
            creative_type: row.creative_type ?? "feed",
            is_catalog: row.is_catalog ?? false,
          });
    const reconciledCreativeTaxonomy = reconcileCreativeTaxonomyWithVideoEvidence(creativeTaxonomy, {
      preview: row.preview,
      thumbstop: row.thumbstop,
      video25: row.video25,
      video50: row.video50,
      video75: row.video75,
      video100: row.video100,
    });
    const legacyCreativeClassification = deriveLegacyCreativeClassification(reconciledCreativeTaxonomy);

    return {
      ...(row as RawCreativeRow),
      format: legacyCreativeClassification.format,
      creative_type: legacyCreativeClassification.creative_type,
      creative_type_label: legacyCreativeClassification.creative_type_label,
      creative_delivery_type: reconciledCreativeTaxonomy.creative_delivery_type,
      creative_visual_format: reconciledCreativeTaxonomy.creative_visual_format,
      creative_primary_type: reconciledCreativeTaxonomy.creative_primary_type,
      creative_primary_label: reconciledCreativeTaxonomy.creative_primary_label,
      creative_secondary_type: reconciledCreativeTaxonomy.creative_secondary_type,
      creative_secondary_label: reconciledCreativeTaxonomy.creative_secondary_label,
      classification_signals: reconciledCreativeTaxonomy.classification_signals,
    };
  }
  const apiRow = value as Partial<MetaCreativeApiRow>;
  if (typeof apiRow.id !== "string" || typeof apiRow.creative_id !== "string") return null;
  const creativeTaxonomy =
    apiRow.creative_primary_type
      ? {
          creative_delivery_type: apiRow.creative_delivery_type ?? "standard",
          creative_visual_format: apiRow.creative_visual_format ?? "image",
          creative_primary_type: apiRow.creative_primary_type,
          creative_primary_label: apiRow.creative_primary_label ?? null,
          creative_secondary_type: apiRow.creative_secondary_type ?? null,
          creative_secondary_label: apiRow.creative_secondary_label ?? null,
          classification_signals: apiRow.classification_signals ?? null,
        }
      : coerceCreativeTaxonomyFromLegacy({
          format: apiRow.format ?? "image",
          creative_type: apiRow.creative_type ?? "feed",
          is_catalog: apiRow.is_catalog ?? false,
        });
  const reconciledCreativeTaxonomy = reconcileCreativeTaxonomyWithVideoEvidence(creativeTaxonomy, {
    preview: apiRow.preview,
    thumbstop: Number(apiRow.thumbstop ?? 0),
    video25: Number(apiRow.video25 ?? 0),
    video50: Number(apiRow.video50 ?? 0),
    video75: Number(apiRow.video75 ?? 0),
    video100: Number(apiRow.video100 ?? 0),
  });
  const legacyCreativeClassification = deriveLegacyCreativeClassification(reconciledCreativeTaxonomy);
  return {
    id: apiRow.id,
    creative_id: apiRow.creative_id,
    object_story_id: apiRow.object_story_id ?? null,
    effective_object_story_id: apiRow.effective_object_story_id ?? null,
    post_id: apiRow.post_id ?? null,
    associated_ads_count: apiRow.associated_ads_count ?? 1,
    account_id: apiRow.account_id ?? "",
    account_name: apiRow.account_name ?? null,
    campaign_id: apiRow.campaign_id ?? null,
    campaign_name: apiRow.campaign_name ?? null,
    adset_id: apiRow.adset_id ?? null,
    adset_name: apiRow.adset_name ?? null,
    currency: apiRow.currency ?? null,
    name: apiRow.name ?? "Unnamed ad",
    launch_date: apiRow.launch_date ?? "",
    copy_text: apiRow.copy_text ?? null,
    copy_variants: apiRow.copy_variants ?? [],
    headline_variants: apiRow.headline_variants ?? [],
    description_variants: apiRow.description_variants ?? [],
    copy_source: apiRow.copy_source ?? null,
    copy_debug_sources: apiRow.copy_debug_sources ?? [],
    unresolved_reason: apiRow.unresolved_reason ?? null,
    preview_url: apiRow.preview_url ?? null,
    preview_source: apiRow.preview_source ?? null,
    thumbnail_url: apiRow.thumbnail_url ?? null,
    image_url: apiRow.image_url ?? null,
    table_thumbnail_url: apiRow.table_thumbnail_url ?? null,
    card_preview_url: apiRow.card_preview_url ?? null,
    is_catalog: Boolean(apiRow.is_catalog),
    preview_state: apiRow.preview_state ?? "unavailable",
    preview: apiRow.preview ?? {
      render_mode: "unavailable",
      image_url: null,
      video_url: null,
      poster_url: null,
      source: null,
      is_catalog: Boolean(apiRow.is_catalog),
    },
    tags: apiRow.tags ?? [],
    ai_tags: apiRow.ai_tags ?? {},
    format: legacyCreativeClassification.format,
    creative_type: legacyCreativeClassification.creative_type,
    creative_type_label: legacyCreativeClassification.creative_type_label,
    creative_delivery_type: reconciledCreativeTaxonomy.creative_delivery_type,
    creative_visual_format: reconciledCreativeTaxonomy.creative_visual_format,
    creative_primary_type: reconciledCreativeTaxonomy.creative_primary_type,
    creative_primary_label: reconciledCreativeTaxonomy.creative_primary_label,
    creative_secondary_type: reconciledCreativeTaxonomy.creative_secondary_type,
    creative_secondary_label: reconciledCreativeTaxonomy.creative_secondary_label,
    classification_signals: reconciledCreativeTaxonomy.classification_signals,
    spend: Number(apiRow.spend ?? 0),
    purchase_value: Number(apiRow.purchase_value ?? 0),
    roas: Number(apiRow.roas ?? 0),
    cpa: Number(apiRow.cpa ?? 0),
    cpc_link: Number(apiRow.cpc_link ?? 0),
    cpm: Number(apiRow.cpm ?? 0),
    ctr_all: Number(apiRow.ctr_all ?? 0),
    purchases: Number(apiRow.purchases ?? 0),
    impressions: Number(apiRow.impressions ?? 0),
    link_clicks: Number(apiRow.link_clicks ?? 0),
    landing_page_views: Number(apiRow.landing_page_views ?? 0),
    add_to_cart: Number(apiRow.add_to_cart ?? 0),
    initiate_checkout: Number(apiRow.initiate_checkout ?? 0),
    thumbstop: Number(apiRow.thumbstop ?? 0),
    click_to_atc: Number(apiRow.click_to_atc ?? 0),
    atc_to_purchase: Number(apiRow.atc_to_purchase ?? 0),
    leads: Number(apiRow.leads ?? 0),
    messages: Number(apiRow.messages ?? 0),
    video25: Number(apiRow.video25 ?? 0),
    video50: Number(apiRow.video50 ?? 0),
    video75: Number(apiRow.video75 ?? 0),
    video100: Number(apiRow.video100 ?? 0),
    debug: apiRow.debug,
  } satisfies RawCreativeRow;
}

function buildPreviewCoverage(rows: MetaCreativeApiRow[]) {
  const totalCreatives = rows.length;
  const previewReadyCount = rows.filter((row) => row.preview_status === "ready").length;
  const previewMissingCount = totalCreatives - previewReadyCount;
  return {
    totalCreatives,
    previewReadyCount,
    previewMissingCount,
    previewCoverage:
      totalCreatives > 0 ? Math.round((previewReadyCount / totalCreatives) * 100) : 0,
  };
}

async function syncMetaCreativesAccountDay(input: {
  businessId: string;
  accountId: string;
  accessToken: string;
  day: string;
  mediaMode?: "metadata" | "full";
}) {
  const mediaMode = input.mediaMode ?? "full";
  const enableFullMediaHydration = mediaMode === "full";
  const response = await buildCreativesResponse(
    {
      businessId: input.businessId,
      assignedAccountIds: [input.accountId],
      accessToken: input.accessToken,
      mediaMode,
      enableFullMediaHydration,
      groupBy: "adName",
      format: "all",
      sort: "spend",
      start: input.day,
      end: input.day,
      debugPreview: false,
      debugThumbnail: false,
      debugPerf: false,
      snapshotBypass: true,
      snapshotWarm: false,
      enableCopyRecovery: true,
      enableCreativeBasicsFallback: true,
      enableCreativeDetails: true,
      enableThumbnailBackfill: true,
      enableCardThumbnailBackfill: true,
      enableImageHashLookup: true,
      enableMediaRecovery: true,
      enableMediaCache: true,
      enableDeepAudit: false,
      perAccountSampleLimit: 10,
      requestStartedAt: Date.now(),
    },
    new NextRequest(`http://localhost/api/meta/creatives?businessId=${input.businessId}`)
  );

  const apiRows = (response.rows ?? []) as MetaCreativeApiRow[];
  const rawRows = apiRows
    .map((row) => coerceRawCreativeRow(row))
    .filter((row): row is RawCreativeRow => Boolean(row));
  const creativeUsageMap = buildCreativeUsageMap(rawRows);
  const creativeRows = groupRows(rawRows, "creative", creativeUsageMap);

  const adDailyRows: MetaAdDailyRow[] = rawRows.map((row, index) => ({
    businessId: input.businessId,
    providerAccountId: input.accountId,
    date: input.day,
    campaignId: row.campaign_id,
    adsetId: row.adset_id,
    adId: row.id,
    adNameCurrent: row.name,
    adNameHistorical: row.name,
    adStatus: null,
    accountTimezone: "UTC",
    accountCurrency: row.currency ?? "USD",
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.link_clicks,
    reach: 0,
    frequency: null,
    conversions: row.purchases,
    revenue: row.purchase_value,
    roas: row.roas,
    cpa: row.cpa,
    ctr: row.ctr_all,
    cpc: row.cpc_link,
    sourceSnapshotId: null,
    payloadJson: apiRows[index] ?? row,
  }));

  const creativeDailyRows: MetaCreativeDailyRow[] = creativeRows.map((row) => {
    const payloadRow = buildMetaCreativeApiRow({
      row,
      cachedThumbnailUrl: null,
      cardFallbackThumbnailUrl: null,
      includeDebugFields: false,
    });
    return {
      businessId: input.businessId,
      providerAccountId: input.accountId,
      date: input.day,
      campaignId: row.campaign_id,
      adsetId: row.adset_id,
      adId: row.id,
      creativeId: row.creative_id,
      creativeName: row.name,
      headline: row.headline_variants?.[0] ?? null,
      primaryText: row.copy_text ?? row.copy_variants?.[0] ?? null,
      destinationUrl: null,
      thumbnailUrl: row.thumbnail_url ?? row.preview_url ?? null,
      assetType: row.creative_type ?? row.format ?? null,
      accountTimezone: "UTC",
      accountCurrency: row.currency ?? "USD",
      spend: row.spend,
      impressions: row.impressions,
      clicks: row.link_clicks,
      reach: 0,
      frequency: null,
      conversions: row.purchases,
      revenue: row.purchase_value,
      roas: row.roas,
      cpa: row.cpa,
      ctr: row.ctr_all,
      cpc: row.cpc_link,
      sourceSnapshotId: null,
      payloadJson: payloadRow,
    };
  });

  await Promise.all([
    upsertMetaAdDailyRows(adDailyRows),
    upsertMetaCreativeDailyRows(creativeDailyRows),
  ]);
}

export async function syncMetaCreativesWarehouseDay(input: {
  businessId: string;
  day: string;
  accessToken: string;
  assignedAccountIds: string[];
  mediaMode?: "metadata" | "full";
}) {
  for (const accountId of input.assignedAccountIds) {
    await syncMetaCreativesAccountDay({
      businessId: input.businessId,
      accountId,
      accessToken: input.accessToken,
      day: input.day,
      mediaMode: input.mediaMode,
    });
  }
}

export async function ensureMetaCreativesWarehouseRangeFilled(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  mediaMode?: "metadata" | "full";
}) {
  const retentionStart = getCreativeMediaRetentionStart(input.endDate);
  await pruneMetaCreativeMediaOutsideRetention({
    businessId: input.businessId,
    keepFromDate: retentionStart,
  }).catch(() => null);
  const [integration, assignedAccountIds, coverage, previewCoverage] = await Promise.all([
    getIntegration(input.businessId, "meta").catch(() => null),
    fetchAssignedAccountIds(input.businessId),
    getMetaAdDailyCoverage({
      businessId: input.businessId,
      providerAccountId: null,
      startDate: input.startDate,
      endDate: input.endDate,
    }).catch(() => null),
    getMetaAdDailyPreviewCoverage({
      businessId: input.businessId,
      providerAccountId: null,
      startDate: input.startDate,
      endDate: input.endDate,
    }).catch(() => ({ total_rows: 0, preview_ready_rows: 0 })),
  ]);
  if (!integration || integration.status !== "connected" || !integration.access_token) return null;
  if (assignedAccountIds.length === 0) return null;
  const totalDays =
    Math.max(
      1,
      Math.floor(
        (new Date(`${input.endDate}T00:00:00Z`).getTime() -
          new Date(`${input.startDate}T00:00:00Z`).getTime()) /
          86_400_000
      ) + 1
    );
  if (
    (coverage?.completed_days ?? 0) >= totalDays &&
    (input.mediaMode !== "full" ||
      previewCoverage.total_rows === 0 ||
      previewCoverage.preview_ready_rows >= previewCoverage.total_rows)
  ) {
    return null;
  }

  const days = enumerateDays(input.startDate, input.endDate, true);
  for (const day of days) {
    const shouldRetainMedia = day >= retentionStart;
    const dayCoverage = await getMetaAdDailyCoverage({
      businessId: input.businessId,
      providerAccountId: null,
      startDate: day,
      endDate: day,
    }).catch(() => null);
    if ((dayCoverage?.completed_days ?? 0) >= 1) {
      if (input.mediaMode !== "full") continue;
      const dayPreviewCoverage = await getMetaAdDailyPreviewCoverage({
        businessId: input.businessId,
        providerAccountId: null,
        startDate: day,
        endDate: day,
      }).catch(() => ({ total_rows: 0, preview_ready_rows: 0 }));
      const dayNeedsMediaHydration =
        dayPreviewCoverage.total_rows > 0 &&
        dayPreviewCoverage.preview_ready_rows < dayPreviewCoverage.total_rows;
      if (!dayNeedsMediaHydration) continue;
      if (!shouldRetainMedia && input.startDate !== input.endDate) continue;
    }
    await syncMetaCreativesWarehouseDay({
      businessId: input.businessId,
      day,
      accessToken: integration.access_token,
      assignedAccountIds,
      mediaMode:
        input.mediaMode === "full" && shouldRetainMedia ? "full" : "metadata",
    });
  }

  return { status: "ok" as const };
}

export async function getMetaCreativesWarehousePayload(input: {
  businessId: string;
  start: string;
  end: string;
  groupBy: GroupBy;
  format: FormatFilter;
  sort: SortKey;
  mediaMode: "metadata" | "full";
}) {
  const assignedAccountIds = await fetchAssignedAccountIds(input.businessId);
  if (assignedAccountIds.length === 0) {
    return { status: "no_accounts_assigned", rows: [] as MetaCreativeApiRow[] };
  }

  const adRows = await getMetaAdDailyRange({
    businessId: input.businessId,
    startDate: input.start,
    endDate: input.end,
    providerAccountIds: assignedAccountIds,
  });
  const rawRows = adRows
    .map((row) => coerceRawCreativeRow(row.payloadJson))
    .filter((row): row is RawCreativeRow => Boolean(row));

  const filteredRows = normalizeCreativeRows(rawRows, input.format);
  const creativeUsageMap = buildCreativeUsageMap(filteredRows);
  const groupedRows =
    input.groupBy === "adName"
      ? filteredRows
      : groupRows(filteredRows, input.groupBy, creativeUsageMap);
  const sortedRows = sortRows(groupedRows, input.sort);
  const responseRows = sortedRows.map((row) =>
    buildMetaCreativeApiRow({
      row,
      cachedThumbnailUrl: null,
      cardFallbackThumbnailUrl: null,
      includeDebugFields: false,
    })
  );
  const previewCoverage = buildPreviewCoverage(responseRows);
  const previewMissingCount = previewCoverage.previewMissingCount;
  const previewHydrating = input.mediaMode === "full" && previewMissingCount > 0;

  return {
    status: "ok",
    rows: responseRows,
    media_mode: input.mediaMode,
    media_hydrated: input.mediaMode === "full" && previewMissingCount === 0,
    snapshot_source: "persisted" as const,
    snapshot_level: input.mediaMode,
    freshness_state: previewHydrating ? ("stale" as const) : ("fresh" as const),
    is_refreshing: previewHydrating,
    preview_coverage: previewCoverage,
  };
}

export async function getMetaCreativeHistoryWarehouseRows(input: {
  businessId: string;
  start: string;
  end: string;
  providerAccountIds?: string[] | null;
}) {
  return getMetaCreativeDailyRange({
    businessId: input.businessId,
    startDate: input.start,
    endDate: input.end,
    providerAccountIds: input.providerAccountIds,
  });
}
