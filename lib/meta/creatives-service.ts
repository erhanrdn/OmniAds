import { NextRequest } from "next/server";
import { MediaCacheService } from "@/lib/media-cache/media-service";
import {
  getMetaCreativesSnapshot,
  getMetaCreativesSnapshotFreshness,
  persistMetaCreativesSnapshot,
  type MetaCreativesSnapshotQuery,
} from "@/lib/meta-creatives-snapshot";
import type {
  CreativeDebugInfo,
  FormatFilter,
  GroupBy,
  LegacyPreviewState,
  MetaAdCreativeMediaOnlyRecord,
  MetaAdRecord,
  NormalizedRenderPreviewPayload,
  PreviewAuditCandidate,
  PreviewAuditSample,
  RawCreativeRow,
  SortKey,
  UrlValidationResult,
} from "@/lib/meta/creatives-types";
import type { MetaCreativeApiRow } from "@/lib/meta/creatives-types";
import {
  normalizeMediaUrl,
  extractPostIdFromStoryIdentifier,
  extractVideoIdsFromCreative,
} from "@/lib/meta/creatives-utils";
import {
  collectPreviewCandidates,
  extractImageHashesFromCreative,
  isLikelyLowResCreativeUrl,
  isThumbnailLikeUrl,
  validateMediaUrl,
} from "@/lib/meta/creatives-preview";
import {
  normalizeCopyText,
  normalizeAiTags,
  resolveCreativeCopyExtraction,
  mergeDebugSources,
  applyExtractionToRow,
  extractVariantsFromPreviewHtml,
  fetchStoryCopyMap,
} from "@/lib/meta/creatives-copy";
import {
  fetchAssignedAccountIds,
  fetchAccountInsights,
  fetchAccountMeta,
  fetchAdImageUrlMap,
  fetchVideoSourceMap,
  batchFetchAdsByIds,
  fetchCreativeDetailsMap,
  fetchCreativeThumbnailMap,
  fetchAdCreativeMediaByAdIds,
  fetchAdCreativeBasicsByAdIds,
  fetchAdCreativeMediaDirectByAdIds,
  fetchCreativeDetailPreviewHtml,
} from "@/lib/meta/creatives-fetchers";
import {
  r2,
  toISODate,
  nDaysAgo,
  mergeCreativeData,
  hasSuspiciousMissingFunnelMetrics,
  resolvePreviewOrigin,
  toRawRow,
  groupRows,
  sortRows,
  summarizePreviewAudit,
} from "@/lib/meta/creatives-row-mappers";
import {
  buildSnapshotApiResponse,
  buildLiveApiResponse,
  triggerSnapshotRefresh,
} from "@/lib/meta/creatives-snapshot-helpers";

export interface CreativesQueryParams {
  businessId: string;
  assignedAccountIds: string[];
  accessToken: string;
  mediaMode: "metadata" | "full";
  enableFullMediaHydration: boolean;
  groupBy: GroupBy;
  format: FormatFilter;
  sort: SortKey;
  start: string;
  end: string;
  debugPreview: boolean;
  debugThumbnail: boolean;
  debugPerf: boolean;
  snapshotBypass: boolean;
  snapshotWarm: boolean;
  enableCreativeBasicsFallback: boolean;
  enableCreativeDetails: boolean;
  enableThumbnailBackfill: boolean;
  enableCardThumbnailBackfill: boolean;
  enableImageHashLookup: boolean;
  enableMediaRecovery: boolean;
  enableMediaCache: boolean;
  enableDeepAudit: boolean;
  perAccountSampleLimit: number;
  requestStartedAt: number;
}

export async function buildCreativesResponse(
  query: CreativesQueryParams,
  request: NextRequest
) {
  const {
    businessId,
    assignedAccountIds,
    accessToken,
    mediaMode,
    enableFullMediaHydration,
    groupBy,
    format,
    sort,
    start,
    end,
    debugPreview,
    debugThumbnail,
    debugPerf,
    snapshotBypass,
    snapshotWarm,
    enableCreativeBasicsFallback,
    enableCreativeDetails,
    enableThumbnailBackfill,
    enableCardThumbnailBackfill,
    enableImageHashLookup,
    enableMediaRecovery,
    enableMediaCache,
    enableDeepAudit,
    perAccountSampleLimit,
    requestStartedAt,
  } = query;

  const snapshotQuery: MetaCreativesSnapshotQuery = {
    businessId,
    assignedAccountIds,
    start,
    end,
    groupBy,
    format,
    sort,
  };
  const snapshotEligible =
    !snapshotBypass &&
    !debugPreview &&
    !debugThumbnail &&
    !debugPerf;
  if (snapshotEligible) {
    const snapshot = await getMetaCreativesSnapshot(snapshotQuery);
    if (snapshot) {
      const freshness = getMetaCreativesSnapshotFreshness(snapshot.lastSyncedAt);
      const snapshotPayload = await buildSnapshotApiResponse({
        snapshot,
        businessId,
        mediaMode,
        enableMediaCache,
      });
      if (snapshotPayload) {
        if (hasSuspiciousMissingFunnelMetrics(snapshotPayload.rows ?? [])) {
          if (process.env.NODE_ENV !== "production") {
            console.log("[meta-creatives] bypassing suspicious snapshot with zero funnel metrics", {
              business_id: businessId,
              last_synced_at: snapshot.lastSyncedAt,
              freshness_state: freshness.freshnessState,
              rows: Array.isArray(snapshotPayload.rows) ? snapshotPayload.rows.length : 0,
            });
          }
          triggerSnapshotRefresh(request, snapshotQuery);
        } else {
        if (freshness.freshnessState !== "fresh" && !snapshotWarm) {
          triggerSnapshotRefresh(request, snapshotQuery);
        }
        return snapshotPayload;
        }
      }
    }
  }

  const rawRows: RawCreativeRow[] = [];
  const cardPreviewByCreativeId = new Map<string, string>();
  const urlValidationCache = new Map<string, UrlValidationResult>();
  const previewAuditSamples: PreviewAuditSample[] = [];
  let previewAuditValidationRequests = 0;
  const perf: {
    total_ms: number;
    accounts: Array<{
      account_id: string;
      insights_ms: number;
      ads_ms: number;
      account_meta_ms: number;
      missing_ads_batch_ms: number;
      creative_basics_fallback_ms: number;
      creative_details_ms: number;
      creative_thumb_small_ms: number;
      creative_thumb_card_ms: number;
      adimages_ms: number;
      rows_build_ms: number;
      rows_built: number;
      insights_rows: number;
    }>;
    stages: Record<string, number>;
    counters: Record<string, number>;
  } = {
    total_ms: 0,
    accounts: [],
    stages: {},
    counters: {},
  };
  let totalInsightAdIds = 0;
  let totalAdMapHits = 0;
  let mediaFallbackRowsRequested = 0;
  let mediaDirectFallbackRowsRequested = 0;

  const addStageMs = (name: string, ms: number) => {
    perf.stages[name] = (perf.stages[name] ?? 0) + ms;
  };

  for (const accountId of assignedAccountIds) {
    try {
      const accountPerf = {
        account_id: accountId,
        insights_ms: 0,
        ads_ms: 0,
        account_meta_ms: 0,
        missing_ads_batch_ms: 0,
        creative_basics_fallback_ms: 0,
        creative_details_ms: 0,
        video_details_ms: 0,
        creative_thumb_small_ms: 0,
        creative_thumb_card_ms: 0,
        adimages_ms: 0,
        rows_build_ms: 0,
        rows_built: 0,
        insights_rows: 0,
      };
      const tParallelStart = Date.now();
      const [insights, accountMeta] = await Promise.all([
        (async () => {
          const t = Date.now();
          const result = await fetchAccountInsights(accountId, accessToken, start, end);
          accountPerf.insights_ms += Date.now() - t;
          return result;
        })(),
        (async () => {
          const t = Date.now();
          const result = await fetchAccountMeta(accountId, accessToken);
          accountPerf.account_meta_ms += Date.now() - t;
          return result;
        })(),
      ]);
      addStageMs("parallel_fetch_ms", Date.now() - tParallelStart);
      accountPerf.insights_rows = insights.length;

      const adMap = new Map<string, MetaAdRecord>();
      const insightAdIds = insights
        .map((item) => item.ad_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      totalInsightAdIds += insightAdIds.length;
      if (insightAdIds.length > 0) {
        const tAds = Date.now();
        const insightAdsMap = await batchFetchAdsByIds(insightAdIds, accessToken, mediaMode);
        accountPerf.ads_ms += Date.now() - tAds;
        for (const [id, ad] of insightAdsMap.entries()) {
          adMap.set(id, ad);
        }
        totalAdMapHits += insightAdsMap.size;
      }

      const creativeMissingAdIds = insightAdIds.filter((id) => {
        const ad = adMap.get(id);
        return !ad?.creative?.thumbnail_url && !ad?.creative?.image_url;
      });
      if (enableCreativeBasicsFallback && creativeMissingAdIds.length > 0) {
        console.log("[meta-creatives] creative enrichment fallback", {
          account_id: accountId,
          missing_creative_media_ads: creativeMissingAdIds.length,
        });
        const tCreativeBasics = Date.now();
        const creativeBasicsMap = await fetchAdCreativeBasicsByAdIds(creativeMissingAdIds, accessToken);
        accountPerf.creative_basics_fallback_ms += Date.now() - tCreativeBasics;
        for (const adId of creativeMissingAdIds) {
          const existing = adMap.get(adId);
          const fallback = creativeBasicsMap.get(adId);
          if (!fallback?.creative) continue;
          if (!existing) {
            adMap.set(adId, { id: adId, creative: fallback.creative });
            continue;
          }
          adMap.set(adId, {
            ...existing,
            creative: mergeCreativeData(existing.creative ?? null, fallback.creative as NonNullable<MetaAdRecord["creative"]>),
          });
        }
      }

      if (enableFullMediaHydration) {
        const tAdCreativeMedia = Date.now();
        const adCreativeMediaMap =
          insightAdIds.length > 0
            ? await fetchAdCreativeMediaByAdIds(insightAdIds, accessToken)
            : new Map<string, MetaAdCreativeMediaOnlyRecord>();
        accountPerf.creative_details_ms += Date.now() - tAdCreativeMedia;
        for (const adId of insightAdIds) {
          const existing = adMap.get(adId);
          const mediaOnly = adCreativeMediaMap.get(adId);
          if (!mediaOnly?.creative) continue;
          if (!existing) {
            adMap.set(adId, { id: adId, creative: mediaOnly.creative });
            continue;
          }
          adMap.set(adId, {
            ...existing,
            creative: mergeCreativeData(existing.creative ?? null, mediaOnly.creative as NonNullable<MetaAdRecord["creative"]>),
          });
        }
      }

      // ── Fetch creative details only for ads in current insights window that still need enrichment ──
      const insightAds = insightAdIds
        .map((adId) => adMap.get(adId))
        .filter((ad): ad is MetaAdRecord => Boolean(ad));
      const creativeIds = Array.from(
        new Set(
          insightAds
            .map((ad) => ad.creative?.id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        )
      );
      const creativeIdsForDetails: string[] = enableCreativeDetails
        ? creativeIds
        : [];
      const tCreativeDetails = Date.now();
      const creativeDetailsMap =
        creativeIdsForDetails.length > 0
          ? await fetchCreativeDetailsMap(creativeIdsForDetails, accessToken)
          : new Map<string, NonNullable<MetaAdRecord["creative"]>>();
      accountPerf.creative_details_ms += Date.now() - tCreativeDetails;

      const mergedCreativeById = new Map<string, MetaAdRecord["creative"]>();
      for (const ad of insightAds) {
        const baseCreative = ad.creative ?? null;
        const detailCreative = baseCreative?.id ? creativeDetailsMap.get(baseCreative.id) : undefined;
        const merged = mergeCreativeData(baseCreative, detailCreative);
        if (merged?.id) mergedCreativeById.set(merged.id, merged);
      }
      const creativeVideoIds = Array.from(
        new Set(
          Array.from(mergedCreativeById.values()).flatMap((creative) => extractVideoIdsFromCreative(creative))
        )
      );
      const tVideoDetails = Date.now();
      const videoSourceMap =
        enableFullMediaHydration && creativeVideoIds.length > 0
          ? await fetchVideoSourceMap(creativeVideoIds, accessToken)
          : new Map<string, { source: string | null; picture: string | null }>();
      accountPerf.video_details_ms += Date.now() - tVideoDetails;

      const missingThumbnailCreativeIds = Array.from(mergedCreativeById.entries())
        .filter(([, creative]) =>
          !normalizeMediaUrl(creative?.thumbnail_url ?? null) &&
          !normalizeMediaUrl(creative?.image_url ?? null)
        )
        .map(([creativeId]) => creativeId);
      const tSmallThumbs = Date.now();
      const creativeThumbnailMap =
        enableThumbnailBackfill && missingThumbnailCreativeIds.length > 0
          ? await fetchCreativeThumbnailMap(
              missingThumbnailCreativeIds,
              accessToken,
              150,
              120,
              debugThumbnail
            )
          : new Map<string, string>();
      accountPerf.creative_thumb_small_ms += Date.now() - tSmallThumbs;
      const spendByCreativeId = insights.reduce<Map<string, number>>((acc, insight) => {
        const adId = insight.ad_id;
        if (!adId) return acc;
        const creativeId = adMap.get(adId)?.creative?.id;
        if (!creativeId) return acc;
        const spend = parseFloat(insight.spend ?? "0") || 0;
        acc.set(creativeId, (acc.get(creativeId) ?? 0) + spend);
        return acc;
      }, new Map<string, number>());
      const cardThumbnailCreativeIds = Array.from(mergedCreativeById.entries())
      .filter(([, creative]) => {
        const imageUrl = normalizeMediaUrl(creative?.image_url ?? null);
        if (!imageUrl) return true;
        return isLikelyLowResCreativeUrl(imageUrl);
      })
      .map(([creativeId]) => creativeId)
      .sort((a, b) => (spendByCreativeId.get(b) ?? 0) - (spendByCreativeId.get(a) ?? 0))
      .slice(0, 80);
      const tCardThumbs = Date.now();
      const cardThumbnailMap =
        enableCardThumbnailBackfill && cardThumbnailCreativeIds.length > 0
          ? await fetchCreativeThumbnailMap(
              cardThumbnailCreativeIds,
              accessToken,
              640,
              640,
              false
            )
          : new Map<string, string>();
      accountPerf.creative_thumb_card_ms += Date.now() - tCardThumbs;
      if (enableCardThumbnailBackfill) {
        for (const [creativeId, url] of cardThumbnailMap.entries()) {
          if (!cardPreviewByCreativeId.has(creativeId)) {
            cardPreviewByCreativeId.set(creativeId, url);
          }
        }
      }
      const accountImageHashes = enableImageHashLookup
        ? Array.from(
            new Set(
              insightAds.flatMap((ad) => {
                const detailCreative = ad.creative?.id ? creativeDetailsMap.get(ad.creative.id) : undefined;
                const mergedCreative = mergeCreativeData(ad.creative ?? null, detailCreative);
                if (mergedCreative?.id && !normalizeMediaUrl(mergedCreative.thumbnail_url) && !normalizeMediaUrl(mergedCreative.image_url)) {
                  const fallbackThumb = creativeThumbnailMap.get(mergedCreative.id) ?? null;
                  if (fallbackThumb) {
                    mergedCreative.thumbnail_url = fallbackThumb;
                    if (debugThumbnail) {
                      console.log("[meta-creatives][thumb-debug] fallback applied", {
                        stage: "hash-seed-merge",
                        account_id: accountId,
                        creative_id: mergedCreative.id,
                        thumbnail_url_sample: fallbackThumb.slice(0, 180),
                      });
                    }
                  }
                  return extractImageHashesFromCreative(mergedCreative);
                }
                return [];
              })
            )
          )
        : [];
      const tAdImages = Date.now();
      const adImageUrlMap =
        enableImageHashLookup && accountImageHashes.length > 0
          ? await fetchAdImageUrlMap(accountId, accountImageHashes, accessToken)
          : new Map<string, string>();
      accountPerf.adimages_ms += Date.now() - tAdImages;

      // Always log coverage in non-production for diagnostics
      if (process.env.NODE_ENV !== "production") {
        const matchedAds = insightAdIds.filter((id) => adMap.has(id)).length;
        const withCreative = insightAdIds.filter((id) => {
          const ad = adMap.get(id);
          return ad?.creative?.thumbnail_url || ad?.creative?.image_url || ad?.creative?.object_story_spec;
        }).length;
        console.log("[meta-creatives] account coverage", {
          account_id: accountMeta.id,
          account_name: accountMeta.name,
          currency: accountMeta.currency,
          insights: insights.length,
          ads_loaded: adMap.size,
          creative_ids_seen: creativeIds.length,
          creative_ids_for_details: creativeIdsForDetails.length,
          creative_details_loaded: creativeDetailsMap.size,
          creative_video_ids_seen: creativeVideoIds.length,
          creative_video_sources_loaded: videoSourceMap.size,
          creative_missing_thumbnail: missingThumbnailCreativeIds.length,
          creative_thumbnail_fallback_loaded: creativeThumbnailMap.size,
          card_thumbnail_fallback_loaded: cardThumbnailMap.size,
          image_hashes_seen: accountImageHashes.length,
          image_hash_urls_resolved: adImageUrlMap.size,
          matched_ads: matchedAds,
          with_creative_data: withCreative,
          fallback_fetched: creativeMissingAdIds.length > 0 ? creativeMissingAdIds.length : 0,
        });
      }

      const accountSampleAdIds = insightAdIds.slice(0, perAccountSampleLimit);
      let accountSampleCount = 0;

      const tRowsBuild = Date.now();
      for (const insight of insights) {
        const ad = insight.ad_id ? adMap.get(insight.ad_id) : undefined;
        const rawAd = ad;
        const rawAdAny = (rawAd ?? null) as Record<string, unknown> | null;
        const rawCreativeDirect = rawAd?.creative ?? null;
        const rawCreativeFromCreativeData =
          rawAdAny &&
          typeof rawAdAny.creative === "object" &&
          rawAdAny.creative !== null &&
          "data" in (rawAdAny.creative as Record<string, unknown>)
            ? ((rawAdAny.creative as { data?: MetaAdRecord["creative"] }).data ?? null)
            : null;
        const rawCreativesNode = rawAdAny?.creatives as
          | { data?: MetaAdRecord["creative"][] }
          | MetaAdRecord["creative"][]
          | undefined;
        const rawAdCreativesNode = rawAdAny?.adcreatives as
          | { data?: MetaAdRecord["creative"][] }
          | MetaAdRecord["creative"][]
          | undefined;
        const rawCreativeFromCreatives = Array.isArray(rawCreativesNode)
          ? rawCreativesNode[0] ?? null
          : rawCreativesNode?.data?.[0] ?? null;
        const rawCreativeFromAdCreatives = Array.isArray(rawAdCreativesNode)
          ? rawAdCreativesNode[0] ?? null
          : rawAdCreativesNode?.data?.[0] ?? null;
        const rawCreativeAnyShape =
          rawCreativeDirect ??
          rawCreativeFromCreativeData ??
          rawCreativeFromCreatives ??
          rawCreativeFromAdCreatives ??
          null;
        const rawCreativeThumbnailAnyShape = normalizeMediaUrl(
          rawCreativeDirect?.thumbnail_url ??
            rawCreativeDirect?.image_url ??
            rawCreativeFromCreativeData?.thumbnail_url ??
            rawCreativeFromCreativeData?.image_url ??
            rawCreativeFromCreatives?.thumbnail_url ??
            rawCreativeFromCreatives?.image_url ??
            rawCreativeFromAdCreatives?.thumbnail_url ??
            rawCreativeFromAdCreatives?.image_url ??
            null
        );
        // Merge creative details — prefer non-null values from either source
        const baseCreative = ad?.creative ?? null;
        const detailCreative = baseCreative?.id ? creativeDetailsMap.get(baseCreative.id) : undefined;
        const mergedCreative = mergeCreativeData(baseCreative, detailCreative);
        if (mergedCreative?.id && !normalizeMediaUrl(mergedCreative.thumbnail_url)) {
          const fallbackThumb = creativeThumbnailMap.get(mergedCreative.id) ?? null;
          if (fallbackThumb) {
            mergedCreative.thumbnail_url = fallbackThumb;
            if (debugThumbnail) {
              console.log("[meta-creatives][thumb-debug] fallback applied", {
                stage: "row-merge",
                account_id: accountId,
                ad_id: insight.ad_id ?? null,
                creative_id: mergedCreative.id,
                thumbnail_url_sample: fallbackThumb.slice(0, 180),
              });
            }
          }
        }
        const enrichedAd: MetaAdRecord | undefined = ad
          ? { ...ad, creative: mergedCreative }
          : undefined;
        const rawCreativeThumbnailUrl = normalizeMediaUrl(baseCreative?.thumbnail_url ?? null);
        const enrichedCreativeThumbnailUrl = normalizeMediaUrl(mergedCreative?.thumbnail_url ?? null);
        if (debugPreview || debugThumbnail) {
          console.log("[meta-creatives][thumb-trace] enrich-stage", {
            ad_id: insight.ad_id ?? null,
            creative_id: mergedCreative?.id ?? baseCreative?.id ?? null,
            debug_raw_creative_thumbnail_url: rawCreativeThumbnailUrl,
            debug_enriched_creative_thumbnail_url: enrichedCreativeThumbnailUrl,
          });
        }
        const row = toRawRow(
          insight,
          enrichedAd,
          accountMeta,
          adImageUrlMap,
          videoSourceMap,
          {
            enabled: debugPreview || debugThumbnail,
            fetchSource: "insights+adMap+enrichment",
            hasRawAd: Boolean(rawAd),
            rawAdId: rawAd?.id ?? null,
            rawAdCreative: Boolean(rawCreativeAnyShape),
            rawAdCreativeThumbnailUrl: rawCreativeThumbnailAnyShape,
            enrichedAdCreative: Boolean(mergedCreative),
            enrichedAdCreativeThumbnailUrl: normalizeMediaUrl(mergedCreative?.thumbnail_url ?? mergedCreative?.image_url ?? null),
            rawCreativeThumbnailUrl,
            enrichedCreativeThumbnailUrl,
          }
        );
        if (row) {
          rawRows.push(row);
          if (enableDeepAudit && accountSampleCount < perAccountSampleLimit && accountSampleAdIds.includes(row.id)) {
            accountSampleCount += 1;
            const creative = mergedCreative;
            const promotedObject = enrichedAd?.promoted_object ?? null;
            const adsetPromotedObject = enrichedAd?.adset?.promoted_object ?? null;
            const collected = collectPreviewCandidates(creative, adImageUrlMap);
            const candidateAudit: PreviewAuditCandidate[] = [];
            for (const candidate of collected.candidates) {
              previewAuditValidationRequests += 1;
              const validation = await validateMediaUrl(candidate.url, urlValidationCache);
              candidateAudit.push({
                source: candidate.source,
                url: candidate.url,
                validation,
              });
            }

            const sample: PreviewAuditSample = {
              account_id: accountMeta.id,
              ad_id: row.id,
              creative_id: creative?.id ?? null,
              creative_name: creative?.name ?? row.name,
              creative_object_type: creative?.object_type ?? null,
              direct: {
                thumbnail_url: normalizeMediaUrl(creative?.thumbnail_url),
                image_url: normalizeMediaUrl(creative?.image_url),
                image_hash: typeof creative?.image_hash === "string" ? creative.image_hash : null,
              },
              object_story_spec: {
                video_data_video_id: typeof creative?.object_story_spec?.video_data?.video_id === "string"
                  ? creative.object_story_spec.video_data.video_id
                  : null,
                video_data_thumbnail_url: normalizeMediaUrl(creative?.object_story_spec?.video_data?.thumbnail_url),
                video_data_image_url: normalizeMediaUrl(creative?.object_story_spec?.video_data?.image_url),
                photo_data_image_url: normalizeMediaUrl(creative?.object_story_spec?.photo_data?.image_url),
                link_data_picture: normalizeMediaUrl(creative?.object_story_spec?.link_data?.picture),
                link_data_image_hash: typeof creative?.object_story_spec?.link_data?.image_hash === "string"
                  ? creative.object_story_spec.link_data.image_hash
                  : null,
                link_data_child_attachments: (creative?.object_story_spec?.link_data?.child_attachments ?? []).map((attachment) => ({
                  picture: normalizeMediaUrl(attachment?.picture),
                  image_url: normalizeMediaUrl(attachment?.image_url),
                  image_hash: typeof attachment?.image_hash === "string" ? attachment.image_hash : null,

                })),
              },
              asset_feed_spec: {
                catalog_id: typeof creative?.asset_feed_spec?.catalog_id === "string" ? creative.asset_feed_spec.catalog_id : null,
                product_set_id: typeof creative?.asset_feed_spec?.product_set_id === "string" ? creative.asset_feed_spec.product_set_id : null,
                images: (creative?.asset_feed_spec?.images ?? []).map((image) => ({
                  image_url: normalizeMediaUrl(image?.image_url),
                  url: normalizeMediaUrl(image?.url),
                  original_url: normalizeMediaUrl(image?.original_url),
                  hash: typeof image?.hash === "string" ? image.hash : typeof image?.image_hash === "string" ? image.image_hash : null,
                })),
                videos: (creative?.asset_feed_spec?.videos ?? []).map((video) => ({
                  video_id: typeof video?.video_id === "string" ? video.video_id : null,
                  thumbnail_url: normalizeMediaUrl(video?.thumbnail_url),
                  image_url: normalizeMediaUrl(video?.image_url),
                })),
              },
              promoted_object: {
                promoted_product_set_id: promotedObject?.product_set_id ?? null,
                promoted_catalog_id: promotedObject?.catalog_id ?? null,
                adset_promoted_product_set_id: adsetPromotedObject?.product_set_id ?? null,
                adset_promoted_catalog_id: adsetPromotedObject?.catalog_id ?? null,
              },
              image_hash_lookup: collected.imageHashResolutions,
              candidates: candidateAudit,
              chosen_preview_source: row.preview.source,
              chosen_preview_url: row.preview.image_url ?? row.preview.poster_url ?? row.preview.video_url,
              chosen_render_mode: row.preview.render_mode,
              is_catalog: row.preview.is_catalog,
              format: row.format,
            };
            previewAuditSamples.push(sample);
            if (process.env.NODE_ENV !== "production") {
              console.log("[meta-creatives] preview source audit sample", sample);
            }
          }
        }
      }
      accountPerf.rows_build_ms += Date.now() - tRowsBuild;
      accountPerf.rows_built += insights.length;
      perf.accounts.push(accountPerf);
      perf.counters.creative_ids_seen = (perf.counters.creative_ids_seen ?? 0) + creativeIds.length;
      perf.counters.creative_ids_for_details = (perf.counters.creative_ids_for_details ?? 0) + creativeIdsForDetails.length;
      perf.counters.account_image_hashes_seen = (perf.counters.account_image_hashes_seen ?? 0) + accountImageHashes.length;
    } catch (error: unknown) {
      console.warn("[meta-creatives] account fetch failed", {
        businessId,
        accountId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const rowsMissingAllMedia = rawRows
    .filter(
      (row) =>
        !row.thumbnail_url &&
        !row.image_url &&
        !row.preview_url &&
        row.id &&
        !row.id.startsWith("creative_") &&
        !row.id.startsWith("adset_")
    )
    .map((row) => row.id);

  if (enableMediaRecovery && rowsMissingAllMedia.length > 0) {
    mediaFallbackRowsRequested += rowsMissingAllMedia.length;
    const tMediaFallback = Date.now();
    console.log("[meta-creatives] media fallback scan", {
      rows_missing_all_media: rowsMissingAllMedia.length,
    });
    const mediaFallbackMap = await fetchAdCreativeMediaByAdIds(rowsMissingAllMedia, accessToken);
    for (const row of rawRows) {
      if (row.thumbnail_url || row.image_url || row.preview_url) continue;
      const fallbackAd = mediaFallbackMap.get(row.id);
      const fallbackCreative = fallbackAd?.creative ?? null;
      if (!fallbackCreative) continue;

      const collected = collectPreviewCandidates(fallbackCreative, new Map<string, string>());
      const candidate1 = collected.candidates[0]?.url ?? null;
      const candidate2 = collected.candidates[1]?.url ?? candidate1;
      const creativeThumb = normalizeMediaUrl(fallbackCreative.thumbnail_url);
      const creativeImage = normalizeMediaUrl(fallbackCreative.image_url);
      const chosenThumb = creativeThumb ?? candidate1;
      const chosenImage = creativeImage ?? candidate2;
      const chosenPreview = chosenThumb ?? chosenImage;
      if (!chosenPreview) continue;

      row.thumbnail_url = chosenThumb;
      row.image_url = chosenImage;
      row.preview_url = chosenPreview;
      row.preview_state = "preview";
      if (!row.preview.image_url && !row.preview.poster_url) {
        row.preview = {
          ...row.preview,
          render_mode: "image",
          image_url: chosenImage ?? chosenPreview,
          poster_url: chosenThumb ?? chosenPreview,
          source: row.preview.source ?? "image_url",
        };
      }
    }
    if (process.env.NODE_ENV !== "production") {
      const unresolvedAfterFallback = rawRows.filter(
        (row) => !row.thumbnail_url && !row.image_url && !row.preview_url && row.id && !row.id.startsWith("creative_") && !row.id.startsWith("adset_")
      ).length;
      console.log("[meta-creatives] media fallback result", {
        fallback_map_size: mediaFallbackMap.size,
        unresolved_after_fallback: unresolvedAfterFallback,
      });
    }
    addStageMs("media_fallback_ms", Date.now() - tMediaFallback);

    const unresolvedAdIds = rawRows
      .filter(
        (row) =>
          !row.thumbnail_url &&
          !row.image_url &&
          !row.preview_url &&
          row.id &&
          !row.id.startsWith("creative_") &&
          !row.id.startsWith("adset_")
      )
      .map((row) => row.id);

    if (unresolvedAdIds.length > 0) {
      mediaDirectFallbackRowsRequested += unresolvedAdIds.length;
      const tDirectFallback = Date.now();
      console.log("[meta-creatives] media direct fallback scan", {
        unresolved_ad_ids: unresolvedAdIds.length,
      });
      const directFallbackMap = await fetchAdCreativeMediaDirectByAdIds(unresolvedAdIds, accessToken);
      for (const row of rawRows) {
        if (row.thumbnail_url || row.image_url || row.preview_url) continue;
        const directAd = directFallbackMap.get(row.id);
        const directCreative = directAd?.creative ?? null;
        if (!directCreative) continue;

        const collected = collectPreviewCandidates(directCreative, new Map<string, string>());
        const candidate1 = collected.candidates[0]?.url ?? null;
        const candidate2 = collected.candidates[1]?.url ?? candidate1;
        const creativeThumb = normalizeMediaUrl(directCreative.thumbnail_url);
        const creativeImage = normalizeMediaUrl(directCreative.image_url);
        const chosenThumb = creativeThumb ?? candidate1;
        const chosenImage = creativeImage ?? candidate2;
        const chosenPreview = chosenThumb ?? chosenImage;
        if (!chosenPreview) continue;

        row.thumbnail_url = chosenThumb;
        row.image_url = chosenImage;
        row.preview_url = chosenPreview;
        row.preview_state = "preview";
        if (!row.preview.image_url && !row.preview.poster_url) {
          row.preview = {
            ...row.preview,
            render_mode: "image",
            image_url: chosenImage ?? chosenPreview,
            poster_url: chosenThumb ?? chosenPreview,
            source: row.preview.source ?? "image_url",
          };
        }
      }

      if (process.env.NODE_ENV !== "production") {
        const unresolvedAfterDirectFallback = rawRows.filter(
          (row) => !row.thumbnail_url && !row.image_url && !row.preview_url && row.id && !row.id.startsWith("creative_") && !row.id.startsWith("adset_")
        ).length;
        console.log("[meta-creatives] media direct fallback result", {
          direct_fallback_map_size: directFallbackMap.size,
          unresolved_after_direct_fallback: unresolvedAfterDirectFallback,
        });
      }
      addStageMs("media_direct_fallback_ms", Date.now() - tDirectFallback);
    }
  }

  const unresolvedCopyAdIds = enableFullMediaHydration
    ? rawRows
        .filter(
          (row) =>
            !normalizeCopyText(row.copy_text) &&
            row.copy_variants.length === 0 &&
            row.headline_variants.length === 0 &&
            row.description_variants.length === 0 &&
            row.id &&
            !row.id.startsWith("creative_") &&
            !row.id.startsWith("adset_")
        )
        .map((row) => row.id)
    : [];

  if (enableFullMediaHydration && unresolvedCopyAdIds.length > 0) {
    const tCopyRecovery = Date.now();
    const deepCopyMap = await fetchAdCreativeMediaDirectByAdIds(unresolvedCopyAdIds, accessToken);
    for (const row of rawRows) {
      if (normalizeCopyText(row.copy_text) || row.copy_variants.length > 0 || row.headline_variants.length > 0 || row.description_variants.length > 0) {
        continue;
      }
      const deepAd = deepCopyMap.get(row.id);
      const deepCreative = deepAd?.creative ?? null;
      if (!deepCreative) {
        row.copy_debug_sources = mergeDebugSources(row.copy_debug_sources, ["deep_ad_fetch"]);
        row.unresolved_reason = row.unresolved_reason ?? "deep_ad_fetch_no_creative";
        continue;
      }
      if (!row.object_story_id && typeof deepCreative.object_story_id === "string" && deepCreative.object_story_id.trim().length > 0) {
        row.object_story_id = deepCreative.object_story_id.trim();
      }
      if (!row.effective_object_story_id && typeof deepCreative.effective_object_story_id === "string" && deepCreative.effective_object_story_id.trim().length > 0) {
        row.effective_object_story_id = deepCreative.effective_object_story_id.trim();
      }
      const extracted = resolveCreativeCopyExtraction(deepCreative);
      const applied = applyExtractionToRow(
        row,
        extracted,
        "deep_ad_fetch",
        "deep_ad_fetch_no_copy_fields"
      );
      Object.assign(row, applied);
    }
    addStageMs("copy_deep_recovery_ms", Date.now() - tCopyRecovery);
  }

  const scopedRows = format === "all" ? rawRows : rawRows.filter((row) => row.format === format);
  const creativeUsageMap = scopedRows.reduce<Map<string, Set<string>>>((acc, row) => {
    const existing = acc.get(row.creative_id) ?? new Set<string>();
    existing.add(row.id);
    acc.set(row.creative_id, existing);
    return acc;
  }, new Map<string, Set<string>>());

  if (process.env.NODE_ENV !== "production") {
    console.log("[meta-creatives] before grouping", {
      businessId,
      groupBy,
      format,
      sort,
      raw_rows: rawRows.length,
      scoped_rows: scopedRows.length,
      unique_creatives: creativeUsageMap.size,
    });
  }

  let rows = groupRows(scopedRows, groupBy, creativeUsageMap);
  rows = sortRows(rows, sort);

  // Copy enrichment fallback path for /copies use-cases.
  const unresolvedCopyRows = enableFullMediaHydration ? rows.filter((row) => !normalizeCopyText(row.copy_text)) : [];
  if (enableFullMediaHydration && unresolvedCopyRows.length > 0) {
    const storyLookupIds = Array.from(
      new Set(
        unresolvedCopyRows.flatMap((row) => {
          const candidates = [
            row.object_story_id,
            row.effective_object_story_id,
            row.post_id,
            extractPostIdFromStoryIdentifier(row.object_story_id ?? null),
            extractPostIdFromStoryIdentifier(row.effective_object_story_id ?? null),
          ];
          return candidates.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
        })
      )
    );
    const storyCopyMap = await fetchStoryCopyMap(storyLookupIds, accessToken);
    if (storyCopyMap.size > 0) {
      rows = rows.map((row) => {
        if (normalizeCopyText(row.copy_text)) return row;
        const lookupCandidates = [
          row.object_story_id,
          row.effective_object_story_id,
          row.post_id,
          extractPostIdFromStoryIdentifier(row.object_story_id ?? null),
          extractPostIdFromStoryIdentifier(row.effective_object_story_id ?? null),
        ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
        const storyHit = lookupCandidates.map((id) => storyCopyMap.get(id)).find((item) => Boolean(item)) ?? null;
        if (!storyHit) {
          return {
            ...row,
            copy_debug_sources: mergeDebugSources(row.copy_debug_sources, ["story_lookup"]),
            unresolved_reason: row.unresolved_reason ?? "story_lookup_no_text",
          };
        }
        return applyExtractionToRow(
          row,
          {
            copy_text: null,
            copy_variants: storyHit.message,
            headline_variants: storyHit.headline,
            description_variants: storyHit.description,
            copy_source: "story_lookup",
          },
          "story_lookup",
          "story_lookup_no_text"
        );
      });
    }

    const htmlFallbackCandidateRows = rows.filter((row) => !normalizeCopyText(row.copy_text));
    const unresolvedCreativeIds = Array.from(
      new Set(
        htmlFallbackCandidateRows
          .map((row) => row.creative_id)
          .filter((creativeId): creativeId is string => typeof creativeId === "string" && creativeId.trim().length > 0)
      )
    ).slice(0, 50);
    if (unresolvedCreativeIds.length > 0) {
      const previewByCreativeId = new Map<string, ReturnType<typeof extractVariantsFromPreviewHtml>>();
      for (const creativeId of unresolvedCreativeIds) {
        const preview = await fetchCreativeDetailPreviewHtml(creativeId, accessToken);
        if (!preview?.html) continue;
        previewByCreativeId.set(creativeId, extractVariantsFromPreviewHtml(preview.html));
      }
      if (previewByCreativeId.size > 0) {
        rows = rows.map((row) => {
          if (normalizeCopyText(row.copy_text)) return row;
          const previewExtracted = previewByCreativeId.get(row.creative_id);
          if (!previewExtracted) {
            return {
              ...row,
              copy_debug_sources: mergeDebugSources(row.copy_debug_sources, ["preview_html_fallback"]),
              unresolved_reason: row.unresolved_reason ?? "preview_html_unavailable",
            };
          }
          return applyExtractionToRow(
            row,
            {
              copy_text: null,
              copy_variants: previewExtracted.copy_variants,
              headline_variants: previewExtracted.headline_variants,
              description_variants: previewExtracted.description_variants,
              copy_source: "preview_html",
            },
            "preview_html_fallback",
            "preview_html_no_copy"
          );
        });
      }
    }
  }

  rows = rows.map((row) => {
    const hasCopy = Boolean(
      normalizeCopyText(row.copy_text) ||
        row.copy_variants.length > 0 ||
        row.headline_variants.length > 0 ||
        row.description_variants.length > 0
    );
    if (hasCopy) return row;
    return {
      ...row,
      unresolved_reason: row.unresolved_reason ?? "no_recoverable_copy_after_all_stages",
    };
  });

  if (process.env.NODE_ENV !== "production") {
    const duplicateNames = rows.filter((r, i, arr) => arr.findIndex((x) => x.name === r.name) !== i);
    console.log("[meta-creatives] after grouping and sorting", {
      groupBy,
      scoped_input: scopedRows.length,
      final_rows: rows.length,
      rows_reduced_by: scopedRows.length - rows.length,
      duplicate_names_remaining: duplicateNames.length,
      sample_rows: rows.slice(0, 5).map((r) => ({
        id: r.id,
        creative_id: r.creative_id,
        name: r.name.slice(0, 40),
        associated_ads_count: r.associated_ads_count,
        spend: r.spend,
      })),
    });
  }

  if (rows.length === 0) {
    return {
      status: "no_data",
      rows: [],
      media_mode: mediaMode,
      media_hydrated: enableFullMediaHydration,
    };
  }

  // ── Resolve cached thumbnail URLs ──────────────────────────────────
  const cacheItems = rows.map((row) => ({
    creative_id: row.creative_id,
    thumbnail_url: row.thumbnail_url,
    image_url: row.image_url,
  }));
  const tMediaCache = Date.now();
  const cacheMap = enableMediaCache ? await MediaCacheService.resolveUrls(cacheItems, businessId) : new Map<string, { url: string; source: "cache" | "external" }>();
  addStageMs("media_cache_ms", Date.now() - tMediaCache);

  const includeDebugFields = debugPreview || debugThumbnail || debugPerf;
  const responseRows: MetaCreativeApiRow[] = rows.map((row) => {
    const cached = cacheMap.get(row.creative_id);
    const cachedThumbnailUrl = cached?.source === "cache" ? cached.url : null;
    const tableThumbnailFromRow = normalizeMediaUrl(row.table_thumbnail_url ?? null);
    const cardPreviewFromRow = normalizeMediaUrl(row.card_preview_url ?? null);
    const rowPreviewImage = normalizeMediaUrl(row.preview.image_url ?? null);
    const rowPreviewPoster = normalizeMediaUrl(row.preview.poster_url ?? null);
    const finalThumbnailUrl =
      tableThumbnailFromRow ??
      normalizeMediaUrl(row.thumbnail_url) ??
      normalizeMediaUrl(cachedThumbnailUrl) ??
      normalizeMediaUrl(row.preview_url) ??
      normalizeMediaUrl(row.image_url) ??
      rowPreviewPoster ??
      rowPreviewImage;
    const rowImageUrl = normalizeMediaUrl(row.image_url);
    const rowPreviewUrl = normalizeMediaUrl(row.preview_url);
    const rowThumbnailUrl = normalizeMediaUrl(row.thumbnail_url);
    const cardFallbackThumbnail = normalizeMediaUrl(cardPreviewByCreativeId.get(row.creative_id) ?? null);
    const preferredCardImageUrl =
      (cardPreviewFromRow && !isThumbnailLikeUrl(cardPreviewFromRow) ? cardPreviewFromRow : null) ??
      (rowImageUrl && !isThumbnailLikeUrl(rowImageUrl) ? rowImageUrl : null) ??
      (rowPreviewUrl && !isThumbnailLikeUrl(rowPreviewUrl) ? rowPreviewUrl : null) ??
      (rowPreviewImage && !isThumbnailLikeUrl(rowPreviewImage) ? rowPreviewImage : null) ??
      (rowPreviewPoster && !isThumbnailLikeUrl(rowPreviewPoster) ? rowPreviewPoster : null) ??
      (cardFallbackThumbnail && !isThumbnailLikeUrl(cardFallbackThumbnail) ? cardFallbackThumbnail : null) ??
      rowImageUrl ??
      rowPreviewUrl ??
      rowPreviewImage ??
      rowPreviewPoster ??
      cardPreviewFromRow ??
      cardFallbackThumbnail ??
      rowThumbnailUrl ??
      finalThumbnailUrl;
    const finalImageUrl = rowImageUrl ?? preferredCardImageUrl ?? finalThumbnailUrl;
    const finalPreviewUrl =
      rowPreviewUrl ??
      preferredCardImageUrl ??
      finalThumbnailUrl;
    const previewState: LegacyPreviewState = finalPreviewUrl ? "preview" : "unavailable";
    const finalNullReason = finalThumbnailUrl
      ? null
      : row.debug?.stage_null_reason ?? "final_map_no_thumbnail";
    const finalPreviewPayload: NormalizedRenderPreviewPayload =
      finalPreviewUrl && row.preview.render_mode === "unavailable"
        ? {
            ...row.preview,
            render_mode: row.preview.video_url ? "video" : "image",
            image_url:
              normalizeMediaUrl(row.preview.image_url) ??
              preferredCardImageUrl ??
              finalImageUrl ??
              finalThumbnailUrl,
            poster_url:
              normalizeMediaUrl(row.preview.poster_url) ??
              preferredCardImageUrl ??
              finalThumbnailUrl ??
              finalImageUrl,
            source: row.preview.source ?? "thumbnail_url",
          }
        : row.preview.render_mode === "image"
        ? {
            ...row.preview,
            image_url:
              normalizeMediaUrl(row.preview.image_url) && !isLikelyLowResCreativeUrl(row.preview.image_url)
                ? row.preview.image_url
                : finalImageUrl ?? row.preview.image_url,
            poster_url:
              normalizeMediaUrl(row.preview.poster_url) && !isLikelyLowResCreativeUrl(row.preview.poster_url)
                ? row.preview.poster_url
                : preferredCardImageUrl ?? finalThumbnailUrl ?? row.preview.poster_url,
          }
        : row.preview;
    const tableThumbnailCandidates = [
      tableThumbnailFromRow,
      rowThumbnailUrl,
      normalizeMediaUrl(cachedThumbnailUrl),
      rowPreviewPoster,
      rowPreviewUrl,
      rowImageUrl,
      rowPreviewImage,
    ].filter((value): value is string => Boolean(value));
    const tableThumbnailUrl = tableThumbnailCandidates[0] ?? null;

    const cardCandidates = [
      preferredCardImageUrl,
      cardPreviewFromRow,
      rowImageUrl,
      rowPreviewImage,
      rowPreviewUrl,
      rowPreviewPoster,
      cardFallbackThumbnail,
      rowThumbnailUrl,
      tableThumbnailUrl,
    ].filter((value): value is string => Boolean(value));

    const cardPrimary =
      cardCandidates.find((candidate) => !isThumbnailLikeUrl(candidate)) ??
      cardCandidates[0] ??
      null;
    const cardPreviewUrl =
      cardPrimary === tableThumbnailUrl
        ? cardCandidates.find((candidate) => candidate !== tableThumbnailUrl) ?? cardPrimary
        : cardPrimary;
    const previewStatus: "ready" | "missing" =
      finalPreviewUrl || finalThumbnailUrl || finalImageUrl || normalizeMediaUrl(cachedThumbnailUrl)
        ? "ready"
        : "missing";
    const previewOrigin = resolvePreviewOrigin({
      cachedThumbnailUrl: normalizeMediaUrl(cachedThumbnailUrl),
      finalPreviewUrl,
      rowPreviewUrl,
      finalThumbnailUrl,
      finalImageUrl,
    });
    const safeSpend = Number.isFinite(row.spend) ? Math.max(0, row.spend) : 0;
    const safePurchases = Number.isFinite(row.purchases) ? Math.max(0, row.purchases) : 0;
    const safeImpressions = Number.isFinite(row.impressions) ? Math.max(0, row.impressions) : 0;
    const safeLinkClicks = Number.isFinite(row.link_clicks) ? Math.max(0, row.link_clicks) : 0;
    const safeAddToCart = Number.isFinite(row.add_to_cart) ? Math.max(0, row.add_to_cart) : 0;
    const basePurchaseValue = Number.isFinite(row.purchase_value) ? Math.max(0, row.purchase_value) : 0;
    const roasFallbackValue = Number.isFinite(row.roas) && row.roas > 0 && safeSpend > 0 ? row.roas * safeSpend : 0;
    const normalizedPurchaseValue = basePurchaseValue > 0 ? basePurchaseValue : roasFallbackValue;
    const normalizedRoas = safeSpend > 0 ? normalizedPurchaseValue / safeSpend : 0;
    const normalizedCpa = safePurchases > 0 ? safeSpend / safePurchases : 0;
    const normalizedCpcLink = safeLinkClicks > 0 ? safeSpend / safeLinkClicks : 0;
    const normalizedCpm = safeImpressions > 0 ? (safeSpend / safeImpressions) * 1000 : 0;
    const normalizedCtrAll = safeImpressions > 0 ? (safeLinkClicks / safeImpressions) * 100 : 0;
    const normalizedClickToAtc = safeLinkClicks > 0 ? (safeAddToCart / safeLinkClicks) * 100 : 0;
    const normalizedAtcToPurchase = safeAddToCart > 0 ? (safePurchases / safeAddToCart) * 100 : 0;
    const baseRow: MetaCreativeApiRow = {
      id: row.id,
      creative_id: row.creative_id,
      object_story_id: row.object_story_id ?? null,
      effective_object_story_id: row.effective_object_story_id ?? null,
      post_id: row.post_id ?? null,
      associated_ads_count: row.associated_ads_count,
      account_id: row.account_id,
      account_name: row.account_name,
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      adset_id: row.adset_id,
      adset_name: row.adset_name,
      currency: row.currency,
      name: row.name,
      copy_text: row.copy_text ?? null,
      copy_variants: row.copy_variants ?? [],
      headline_variants: row.headline_variants ?? [],
      description_variants: row.description_variants ?? [],
      copy_source: row.copy_source ?? null,
      copy_debug_sources: row.copy_debug_sources ?? [],
      unresolved_reason: row.unresolved_reason ?? null,
      preview_url: finalPreviewUrl,
      preview_source: row.preview_source,
      thumbnail_url: finalThumbnailUrl,
      image_url: finalImageUrl,
      table_thumbnail_url: tableThumbnailUrl,
      card_preview_url: cardPreviewUrl,
      is_catalog: row.is_catalog,
      preview_state: previewState,
      preview: finalPreviewPayload,
      launch_date: row.launch_date,
      tags: row.tags,
      ai_tags: Object.keys(row.ai_tags).length > 0 ? row.ai_tags : normalizeAiTags(row.tags),
      format: row.format,
      creative_type: row.creative_type,
      creative_type_label: row.creative_type_label,
      spend: r2(safeSpend),
      purchase_value: r2(normalizedPurchaseValue),
      roas: r2(normalizedRoas),
      cpa: r2(normalizedCpa),
      cpc_link: r2(normalizedCpcLink),
      cpm: r2(normalizedCpm),
      ctr_all: r2(normalizedCtrAll),
      purchases: Math.round(safePurchases),
      impressions: Math.round(safeImpressions),
      link_clicks: Math.round(safeLinkClicks),
      landing_page_views: row.landing_page_views,
      add_to_cart: row.add_to_cart,
      initiate_checkout: row.initiate_checkout,
      leads: row.leads,
      messages: row.messages,
      thumbstop: row.thumbstop,
      click_to_atc: r2(normalizedClickToAtc),
      atc_to_purchase: r2(normalizedAtcToPurchase),
      video25: row.video25,
      video50: row.video50,
      video75: row.video75,
      video100: row.video100,
      cached_thumbnail_url: cachedThumbnailUrl,
      preview_status: previewStatus,
      preview_origin: previewOrigin,
    };
    if (!includeDebugFields) return baseRow;
    const baseDebug: CreativeDebugInfo = row.debug ?? {};
    const debug: CreativeDebugInfo = {
      ...baseDebug,
      stage_final_thumbnail_url: finalThumbnailUrl,
      stage_null_reason: finalNullReason,
      resolution_stage: "response-map",
    };
    return {
      ...baseRow,
      debug,
    };
  });

  if (process.env.NODE_ENV !== "production") {
    const withPreview = responseRows.filter((r) => r.preview_url).length;
    const withThumb = responseRows.filter((r) => r.thumbnail_url).length;
    const withImage = responseRows.filter((r) => r.image_url).length;
    console.log("[meta-creatives] preview summary", {
      total: responseRows.length,
      preview_url_set: withPreview,
      thumbnail_url_set: withThumb,
      image_url_set: withImage,
      state_counts: {
        preview: responseRows.filter((r) => r.preview_state === "preview").length,
        unavailable: responseRows.filter((r) => r.preview_state === "unavailable").length,
      },
      samples: responseRows.slice(0, 5).map((r) => ({
        id: r.id,
        name: r.name.slice(0, 40),
        format: r.format,
        preview_state: r.preview_state,
        preview_url: r.preview_url ? r.preview_url.slice(0, 80) : null,
        preview_source: r.preview_source,
        thumbnail_url: r.thumbnail_url ? r.thumbnail_url.slice(0, 80) : null,
        image_url: r.image_url ? r.image_url.slice(0, 80) : null,
        table_thumbnail_url: r.table_thumbnail_url ? r.table_thumbnail_url.slice(0, 80) : null,
        card_preview_url: r.card_preview_url ? r.card_preview_url.slice(0, 80) : null,
        is_catalog: r.is_catalog,
        preview_render_mode: r.preview.render_mode,
      })),
    });

    if (previewAuditSamples.length > 0) {
      console.log("[meta-creatives] preview source ranking", summarizePreviewAudit(previewAuditSamples));
    }
  }
  if (debugPreview) {
    console.log("[meta-creatives] raw preview fields (first 5)", responseRows.slice(0, 5).map((r) => ({
      id: r.id,
      name: r.name,
      thumbnail_url: r.thumbnail_url,
      image_url: r.image_url,
      preview_url: r.preview_url,
      preview_state: r.preview_state,
      is_catalog: r.is_catalog,
      format: r.format,
      debug_stage_fetch_source: r.debug?.stage_fetch_source ?? null,
      debug_stage_has_raw_ad: r.debug?.stage_has_raw_ad ?? false,
      debug_stage_raw_ad_id: r.debug?.stage_raw_ad_id ?? null,
      debug_stage_raw_ad_creative: r.debug?.stage_raw_ad_creative ?? false,
      debug_stage_raw_ad_creative_thumbnail_url: r.debug?.stage_raw_ad_creative_thumbnail_url ?? null,
      debug_stage_enriched_ad_creative: r.debug?.stage_enriched_ad_creative ?? false,
      debug_stage_enriched_ad_creative_thumbnail_url: r.debug?.stage_enriched_ad_creative_thumbnail_url ?? null,
      debug_stage_row_input_thumbnail_url: r.debug?.stage_row_input_thumbnail_url ?? null,
      debug_stage_final_thumbnail_url: r.debug?.stage_final_thumbnail_url ?? null,
      debug_stage_null_reason: r.debug?.stage_null_reason ?? null,
      debug_raw_creative_thumbnail_url: r.debug?.raw_creative_thumbnail_url ?? null,
      debug_enriched_creative_thumbnail_url: r.debug?.enriched_creative_thumbnail_url ?? null,
      debug_resolved_thumbnail_source: r.debug?.resolved_thumbnail_source ?? null,
      debug_resolution_stage: r.debug?.resolution_stage ?? null,
      debug_creative_object_type: r.debug?.creative_object_type ?? null,
      debug_creative_video_ids: r.debug?.creative_video_ids ?? null,
      debug_creative_effective_object_story_id: r.debug?.creative_effective_object_story_id ?? null,
      debug_creative_object_story_id: r.debug?.creative_object_story_id ?? null,
      debug_creative_object_story_video_id: r.debug?.creative_object_story_video_id ?? null,
      debug_creative_asset_video_ids: r.debug?.creative_asset_video_ids ?? null,
    })));
  }

  // Debug: Log thumbnail URLs for first 5 creatives
  if (process.env.NODE_ENV !== "production" && responseRows.length > 0) {
    responseRows.slice(0, 5).forEach((row) => {
      console.log("meta creative thumbnail", {
        ad_id: row.id,
        thumbnail_url: row.thumbnail_url ?? null,
        image_url: row.image_url ?? null,
      });
    });
  }

  const liveApiPayload = buildLiveApiResponse({
    rows: responseRows,
    mediaMode,
    mediaHydrated: enableFullMediaHydration,
    snapshotLevel: mediaMode,
    snapshotSource: snapshotWarm ? "refresh" : "live",
  });

  const snapshotPersistEligible =
    !debugPreview &&
    !debugThumbnail &&
    !debugPerf &&
    responseRows.length > 0;

  if (snapshotPersistEligible) {
    await persistMetaCreativesSnapshot({
      ...snapshotQuery,
      payload: {
        status: liveApiPayload.status,
        rows: responseRows,
        media_hydrated: enableFullMediaHydration,
      },
      snapshotLevel: mediaMode,
      rowCount: responseRows.length,
      previewReadyCount: liveApiPayload.preview_coverage.previewReadyCount,
    }).catch((error: unknown) => {
      console.warn("[meta-creatives] snapshot persist failed", {
        businessId,
        mediaMode,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }

  if (snapshotEligible && mediaMode === "metadata" && !snapshotWarm) {
    triggerSnapshotRefresh(request, snapshotQuery);
  }

  if (debugPreview) {
    return {
      ...liveApiPayload,
      preview_debug: {
        sampled: previewAuditSamples,
        ranking: summarizePreviewAudit(previewAuditSamples),
      },
      performance_debug: debugPerf
        ? {
            ...perf,
            total_ms: Date.now() - requestStartedAt,
            counters: {
              ...perf.counters,
              assigned_accounts: assignedAccountIds.length,
              raw_rows: rawRows.length,
              response_rows: responseRows.length,
              preview_audit_samples: previewAuditSamples.length,
              preview_audit_validation_requests: previewAuditValidationRequests,
              media_recovery_enabled: enableMediaRecovery ? 1 : 0,
              creative_basics_fallback_enabled: enableCreativeBasicsFallback ? 1 : 0,
              creative_details_enabled: enableCreativeDetails ? 1 : 0,
              thumbnail_backfill_enabled: enableThumbnailBackfill ? 1 : 0,
              card_thumbnail_backfill_enabled: enableCardThumbnailBackfill ? 1 : 0,
              image_hash_lookup_enabled: enableImageHashLookup ? 1 : 0,
              media_cache_enabled: enableMediaCache ? 1 : 0,
              insight_ad_ids: totalInsightAdIds,
              ads_loaded_for_insights: totalAdMapHits,
              media_fallback_rows_requested: mediaFallbackRowsRequested,
              media_direct_fallback_rows_requested: mediaDirectFallbackRowsRequested,
            },
          }
        : undefined,
    };
  }

  if (debugPerf) {
    return {
      ...liveApiPayload,
      performance_debug: {
        ...perf,
        total_ms: Date.now() - requestStartedAt,
        counters: {
          ...perf.counters,
          assigned_accounts: assignedAccountIds.length,
          raw_rows: rawRows.length,
          response_rows: responseRows.length,
          preview_audit_samples: previewAuditSamples.length,
          preview_audit_validation_requests: previewAuditValidationRequests,
          media_recovery_enabled: enableMediaRecovery ? 1 : 0,
          creative_basics_fallback_enabled: enableCreativeBasicsFallback ? 1 : 0,
          creative_details_enabled: enableCreativeDetails ? 1 : 0,
          thumbnail_backfill_enabled: enableThumbnailBackfill ? 1 : 0,
          card_thumbnail_backfill_enabled: enableCardThumbnailBackfill ? 1 : 0,
          image_hash_lookup_enabled: enableImageHashLookup ? 1 : 0,
          media_cache_enabled: enableMediaCache ? 1 : 0,
          insight_ad_ids: totalInsightAdIds,
          ads_loaded_for_insights: totalAdMapHits,
          media_fallback_rows_requested: mediaFallbackRowsRequested,
          media_direct_fallback_rows_requested: mediaDirectFallbackRowsRequested,
        },
      },
    };
  }

  return liveApiPayload;
}
