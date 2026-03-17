"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { useAppStore } from "@/store/app-store";
import { useIntegrationsStore } from "@/store/integrations-store";
import { isDemoBusinessSelected } from "@/lib/business-mode";
import { EmptyState } from "@/components/states/empty-state";
import { IntegrationEmptyState } from "@/components/states/IntegrationEmptyState";
import { LockedFeatureCard } from "@/components/states/LockedFeatureCard";
import { ErrorState } from "@/components/states/error-state";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { Button } from "@/components/ui/button";
import { fetchProviderAccountSnapshot } from "@/lib/provider-account-client";
import { warmProviderAccountSnapshot } from "@/lib/provider-account-client";
import {
  type MetaCreativeRow,
} from "@/components/creatives/metricConfig";
import { CreativesTableSection } from "@/components/creatives/CreativesTableSection";
import type { MetaCreativeApiRow } from "@/app/api/meta/creatives/route";
import {
  applyCreativeFilters,
  formatCreativeDateLabel,
  mapCreativeGroupByToApi,
  CreativeDateRangeValue,
  CreativeFilterRule,
  CreativeGroupBy,
  CreativesTopSection,
  resolveCreativeDateRange,
} from "@/components/creatives/CreativesTopSection";
import { usePersistentCreativeDateRange } from "@/hooks/use-persistent-date-range";
import type { ShareMetricKey, SharePayload, SharedCreative } from "@/components/creatives/shareCreativeTypes";

const CreativeDetailExperience = dynamic(
  () => import("@/components/creatives/CreativeDetailExperience").then((mod) => mod.CreativeDetailExperience),
  { ssr: false, loading: () => null }
);
const CreativeAdBreakdownDrawer = dynamic(
  () => import("@/components/creatives/CreativeAdBreakdownDrawer").then((mod) => mod.CreativeAdBreakdownDrawer),
  { ssr: false, loading: () => null }
);

interface MetaCreativesResponse {
  status?: string;
  message?: string;
  rows: MetaCreativeApiRow[];
  media_mode?: "metadata" | "full";
  media_hydrated?: boolean;
  snapshot_level?: "metadata" | "full";
  snapshot_source?: "persisted" | "live" | "refresh";
  freshness_state?: "fresh" | "stale" | "expired";
  is_refreshing?: boolean;
  preview_coverage?: {
    totalCreatives: number;
    previewReadyCount: number;
    previewMissingCount: number;
    previewCoverage: number;
  };
}

type PreviewStripState = "data_loading" | "media_hydrating" | "ready" | "missing";

function hasRenderablePreview(row: MetaCreativeRow): boolean {
  return Boolean(
    row.cardPreviewUrl ??
      row.cachedThumbnailUrl ??
      row.tableThumbnailUrl ??
      row.previewUrl ??
      row.imageUrl ??
      row.thumbnailUrl ??
      row.preview?.image_url ??
      row.preview?.poster_url ??
      row.preview?.video_url
  );
}

function shouldPollForPreviewReadiness(payload: MetaCreativesResponse | undefined): boolean {
  if (!payload || !Array.isArray(payload.rows) || payload.rows.length === 0) return false;
  const previewCoverage = payload.preview_coverage?.previewCoverage ?? 0;
  if (previewCoverage > 0) return false;
  if (payload.media_hydrated) return false;
  if (payload.is_refreshing) return true;
  if (payload.snapshot_source === "live") return true;
  return payload.freshness_state === "stale";
}

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
};

const SHARE_METRIC_IDS = new Set<ShareMetricKey>(["spend", "purchaseValue", "roas", "cpa", "ctrAll", "purchases"]);

function toCsv(rows: MetaCreativeRow[]): string {
  const headers = [
    "Creative / Ad Name",
    "Launch date",
    "Tags",
    "Spend",
    "Purchase value",
    "ROAS",
    "Cost per purchase",
    "Cost per link click",
    "CPM",
    "CPC (all)",
    "Average order value",
    "Click to add-to-cart ratio",
    "Add-to-cart to purchase ratio",
    "Purchases",
    "First frame retention",
    "Thumbstop ratio",
    "Click through rate (outbound)",
    "Click to purchase ratio",
    "Click through rate (all)",
    "25% video plays (rate)",
    "50% video plays (rate)",
    "75% video plays (rate)",
    "100% video plays (rate)",
    "Hold rate",
    "Hook score",
    "Watch score",
    "Click score",
    "Convert score",
    "% purchase value",
  ];

  const totalPurchaseValue = rows.reduce((sum, row) => sum + row.purchaseValue, 0);
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const isVideo = (row: MetaCreativeRow) =>
    row.format === "video" || row.thumbstop > 0 || row.video25 > 0 || row.video50 > 0 || row.video75 > 0 || row.video100 > 0;

  const body = rows.map((row) => {
    const videoApplicable = isVideo(row);
    const aov = row.purchases > 0 ? row.purchaseValue / row.purchases : 0;
    const purchaseValueShare = totalPurchaseValue > 0 ? (row.purchaseValue / totalPurchaseValue) * 100 : 0;
    const values = [
      row.name,
      row.launchDate,
      (row.tags ?? []).join(" | "),
      row.spend.toFixed(2),
      row.purchaseValue.toFixed(2),
      row.roas.toFixed(2),
      row.cpa.toFixed(2),
      row.cpcLink.toFixed(2),
      row.cpm.toFixed(2),
      row.cpcLink.toFixed(2),
      aov.toFixed(2),
      row.clickToPurchase.toFixed(2),
      row.atcToPurchaseRatio.toFixed(2),
      row.purchases,
      videoApplicable ? row.thumbstop.toFixed(2) : "",
      videoApplicable ? row.thumbstop.toFixed(2) : "",
      row.ctrAll.toFixed(2),
      row.clickToPurchase.toFixed(2),
      row.ctrAll.toFixed(2),
      videoApplicable ? row.video25.toFixed(2) : "",
      videoApplicable ? row.video50.toFixed(2) : "",
      videoApplicable ? row.video75.toFixed(2) : "",
      videoApplicable ? row.video100.toFixed(2) : "",
      videoApplicable ? row.video100.toFixed(2) : "",
      row.thumbstop.toFixed(0),
      videoApplicable ? row.video50.toFixed(0) : "",
      (row.ctrAll * 10).toFixed(0),
      (row.roas * 10).toFixed(0),
      purchaseValueShare.toFixed(2),
    ];
    return values.map(escape).join(",");
  });

  return [headers.map(escape).join(","), ...body].join("\n");
}

function toSharedCreative(row: MetaCreativeRow): SharedCreative {
  return {
    id: row.id,
    name: row.name,
    currency: row.currency ?? null,
    format: row.format,
    previewState: row.previewState,
    isCatalog: row.isCatalog,
    previewUrl: row.previewUrl ?? null,
    imageUrl: row.imageUrl ?? null,
    thumbnailUrl: row.thumbnailUrl ?? null,
    preview: row.preview,
    launchDate: row.launchDate,
    tags: row.tags ?? [],
    spend: row.spend,
    purchaseValue: row.purchaseValue,
    roas: row.roas,
    cpa: row.cpa,
    cpcLink: row.cpcLink,
    cpm: row.cpm,
    ctrAll: row.ctrAll,
    purchases: row.purchases,
    impressions: row.impressions,
    linkClicks: row.linkClicks,
    addToCart: row.addToCart,
    thumbstop: row.thumbstop,
    clickToPurchase: row.clickToPurchase,
    video25: row.video25,
    video50: row.video50,
    video75: row.video75,
    video100: row.video100,
    atcToPurchaseRatio: row.atcToPurchaseRatio,
  };
}

function hasMessage(payload: unknown): payload is { message: string } {
  if (!payload || typeof payload !== "object") return false;
  return "message" in payload && typeof payload.message === "string";
}

async function fetchMetaCreatives(params: {
  businessId: string;
  start: string;
  end: string;
  groupBy: "adName" | "creative" | "adSet";
  format: "all" | "image" | "video";
  sort: "roas" | "spend" | "ctrAll" | "purchaseValue";
  mediaMode?: "metadata" | "full";
}): Promise<MetaCreativesResponse> {
  const query = new URLSearchParams({
    businessId: params.businessId,
    start: params.start,
    end: params.end,
    groupBy: params.groupBy,
    format: params.format,
    sort: params.sort,
    mediaMode: params.mediaMode ?? "full",
  });

  const response = await fetch(`/api/meta/creatives?${query.toString()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = hasMessage(payload)
      ? payload.message
      : `Could not load creatives (${response.status}).`;
    throw new Error(message);
  }

  if (!payload || typeof payload !== "object" || !Array.isArray((payload as MetaCreativesResponse).rows)) {
    throw new Error("Invalid creatives response received from backend.");
  }

  return payload as MetaCreativesResponse;
}

function mapApiRowToUiRow(row: MetaCreativeApiRow): MetaCreativeRow {
  const fallbackCreativeTypeLabel =
    row.format === "catalog" ? "Feed (Catalog ads)" : row.format === "video" ? "Video" : "Feed";
  const fallbackCreativeType = row.format === "catalog" ? "feed_catalog" : row.format === "video" ? "video" : "feed";

  return {
    id: row.id,
    creativeId: row.creative_id,
    objectStoryId: row.object_story_id ?? null,
    effectiveObjectStoryId: row.effective_object_story_id ?? null,
    postId: row.post_id ?? null,
    name: row.name,
    associatedAdsCount: row.associated_ads_count,
    accountId: row.account_id ?? null,
    accountName: row.account_name ?? null,
    campaignId: row.campaign_id ?? null,
    campaignName: row.campaign_name ?? null,
    adSetId: row.adset_id ?? null,
    adSetName: row.adset_name ?? null,
    currency: row.currency ?? null,
    format: row.format,
    creativeType: row.creative_type ?? fallbackCreativeType,
    creativeTypeLabel: row.creative_type_label ?? fallbackCreativeTypeLabel,
    thumbnailUrl: row.thumbnail_url,
    previewUrl: row.preview_url,
    imageUrl: row.image_url,
    tableThumbnailUrl: row.table_thumbnail_url ?? row.thumbnail_url ?? null,
    cardPreviewUrl: row.card_preview_url ?? row.image_url ?? row.thumbnail_url ?? row.preview_url ?? null,
    isCatalog: row.is_catalog,
    previewState: row.preview_state,
    preview: row.preview,
    launchDate: row.launch_date,
    tags: row.tags ?? [],
    aiTags: row.ai_tags ?? {},
    spend: row.spend,
    purchaseValue: row.purchase_value,
    roas: row.roas,
    cpa: row.cpa,
    cpcLink: row.cpc_link,
    cpm: row.cpm,
    ctrAll: row.ctr_all,
    purchases: row.purchases,
    impressions: row.impressions,
    linkClicks: row.link_clicks,
    landingPageViews: row.landing_page_views,
    addToCart: row.add_to_cart,
    initiateCheckout: row.initiate_checkout,
    thumbstop: row.thumbstop,
    clickToPurchase: row.click_to_atc,
    seeMoreRate: 0,
    video25: row.video25,
    video50: row.video50,
    video75: row.video75,
    video100: row.video100,
    atcToPurchaseRatio: row.atc_to_purchase,
    cachedThumbnailUrl: row.cached_thumbnail_url ?? null,
    previewStatus: row.preview_status ?? (row.preview_url || row.thumbnail_url || row.image_url ? "ready" : "missing"),
    previewOrigin: row.preview_origin ?? null,
  };
}

function CreativesTableShell() {
  return (
    <div className="rounded-xl border bg-white">
      <div className="border-b px-4 py-3">
        <div className="h-4 w-48 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="divide-y">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
            <div className="h-4 w-4 animate-pulse rounded bg-slate-200" />
            <div className="h-10 w-10 animate-pulse rounded-md bg-slate-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-56 animate-pulse rounded bg-slate-200" />
              <div className="h-3 w-32 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="hidden gap-3 md:flex">
              <div className="h-4 w-16 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-14 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-12 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CreativesPage() {
  const router = useRouter();
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businesses = useAppStore((state) => state.businesses);
  const businessId = selectedBusinessId ?? "";
  const selectedBusinessCurrency =
    businesses.find((business) => business.id === selectedBusinessId)?.currency ?? null;

  const ensureBusiness = useIntegrationsStore((state) => state.ensureBusiness);
  const byBusinessId = useIntegrationsStore((state) => state.byBusinessId);
  const assignedAccountsByBusiness = useIntegrationsStore(
    (state) => state.assignedAccountsByBusiness
  );
  const setProviderAccounts = useIntegrationsStore((state) => state.setProviderAccounts);
  const setAssignedAccounts = useIntegrationsStore((state) => state.setAssignedAccounts);

  useEffect(() => {
    if (!selectedBusinessId) return;
    ensureBusiness(businessId);
  }, [businessId, ensureBusiness, selectedBusinessId]);

  const integrations = byBusinessId[businessId];

  const [dateRangeValue, setDateRangeValue] = usePersistentCreativeDateRange();
  const [groupBy, setGroupBy] = useState<CreativeGroupBy>("creative");
  const [topFilters, setTopFilters] = useState<CreativeFilterRule[]>([]);
  const [topMetricIds, setTopMetricIds] = useState<string[]>(["spend", "roas"]);
  const [selectionState, setSelectionState] = useState<{ selectedRowIds: string[] }>({
    selectedRowIds: [],
  });
  const hasUserInteractedSelectionRef = useRef(false);
  const [creativeDrawerState, setCreativeDrawerState] = useState<{ open: boolean; activeRowId: string | null }>({
    open: false,
    activeRowId: null,
  });
  const [breakdownDrawerState, setBreakdownDrawerState] = useState<{ open: boolean; activeRowId: string | null }>({
    open: false,
    activeRowId: null,
  });
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);
  const [notesByRowId, setNotesByRowId] = useState<Record<string, string>>({});
  const [shareExportLoading, setShareExportLoading] = useState(false);
  const [csvExportLoading, setCsvExportLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  const platform: "meta" = "meta";
  const platformStatus = integrations?.meta?.status;
  const isDemoBusiness = isDemoBusinessSelected(selectedBusinessId, businesses);
  const platformConnected = platformStatus === "connected" || isDemoBusiness;
  const [metaAssignmentsState, setMetaAssignmentsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const assignedMetaAccounts = assignedAccountsByBusiness[businessId]?.meta ?? [];
  const metaHasAssignments = isDemoBusiness || assignedMetaAccounts.length > 0;

  useEffect(() => {
    if (!selectedBusinessId || isDemoBusiness || !platformConnected) {
      setMetaAssignmentsState("idle");
      return;
    }

    let cancelled = false;
    setMetaAssignmentsState("loading");

    (async () => {
      try {
        const snapshot = await fetchProviderAccountSnapshot("meta", businessId);
        if (cancelled) return;
        setProviderAccounts(businessId, "meta", snapshot.accounts);
        setAssignedAccounts(businessId, "meta", snapshot.assignedAccountIds);
        setMetaAssignmentsState("ready");
        if (snapshot.meta?.stale) {
          void warmProviderAccountSnapshot("meta", businessId).catch(() => undefined);
        }
      } catch {
        try {
          const snapshot = await warmProviderAccountSnapshot("meta", businessId);
          if (cancelled) return;
          setProviderAccounts(businessId, "meta", snapshot.accounts);
          setAssignedAccounts(businessId, "meta", snapshot.assignedAccountIds);
          setMetaAssignmentsState("ready");
        } catch {
          if (cancelled) return;
          setMetaAssignmentsState("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    businessId,
    isDemoBusiness,
    platformConnected,
    selectedBusinessId,
    setAssignedAccounts,
    setProviderAccounts,
  ]);

  const { start: drStart, end: drEnd } = resolveCreativeDateRange(dateRangeValue);
  const mainTableApiGroupBy = mapCreativeGroupByToApi(groupBy);

  const creativesMetadataQuery = useQuery({
    queryKey: [
      "meta-creatives-creatives-metadata",
      businessId,
      drStart,
      drEnd,
      groupBy,
    ],
    enabled: platform === "meta" && platformConnected && metaHasAssignments,
    queryFn: () =>
      fetchMetaCreatives({
        businessId,
        start: drStart,
        end: drEnd,
        groupBy: mainTableApiGroupBy,
        format: "all",
        sort: "spend",
        mediaMode: "metadata",
      }),
    refetchInterval: (query) =>
      shouldPollForPreviewReadiness(query.state.data as MetaCreativesResponse | undefined)
        ? 2500
        : false,
    refetchIntervalInBackground: true,
  });
  const creativesMediaQuery = useQuery({
    queryKey: [
      "meta-creatives-creatives-media",
      businessId,
      drStart,
      drEnd,
      groupBy,
    ],
    enabled:
      platform === "meta" &&
      platformConnected &&
      metaHasAssignments &&
      creativesMetadataQuery.isSuccess &&
      (creativesMetadataQuery.data?.rows?.length ?? 0) > 0,
    queryFn: () =>
      fetchMetaCreatives({
        businessId,
        start: drStart,
        end: drEnd,
        groupBy: mainTableApiGroupBy,
        format: "all",
        sort: "spend",
        mediaMode: "full",
      }),
    refetchInterval: (query) =>
      shouldPollForPreviewReadiness(query.state.data as MetaCreativesResponse | undefined)
        ? 3000
        : false,
    refetchIntervalInBackground: true,
  });
  const adBreakdownQuery = useQuery({
    queryKey: ["meta-creatives-ad-breakdown", businessId, drStart, drEnd],
    enabled:
      platform === "meta" &&
      platformConnected &&
      metaHasAssignments &&
      breakdownDrawerState.open &&
      Boolean(breakdownDrawerState.activeRowId),
    queryFn: () =>
      fetchMetaCreatives({
        businessId,
        start: drStart,
        end: drEnd,
        groupBy: "adName",
        format: "all",
        sort: "spend",
      }),
  });

  const allRows = useMemo(() => {
    const metadataRows = creativesMetadataQuery.data?.rows ?? [];
    const hydratedRows = creativesMediaQuery.data?.rows ?? [];
    const hydratedById = new Map(hydratedRows.map((row) => [row.id, row]));
    const rows = metadataRows.map((row) => mapApiRowToUiRow(hydratedById.get(row.id) ?? row));
    if (rows.length > 0 && process.env.NODE_ENV !== "production") {
      const withPreview = rows.filter((r) => r.previewUrl).length;
      console.log("[creatives-page] UI row preview summary", {
        total: rows.length,
        with_previewUrl: withPreview,
        with_thumbnailUrl: rows.filter((r) => r.thumbnailUrl).length,
        with_imageUrl: rows.filter((r) => r.imageUrl).length,
        state_counts: {
          preview: rows.filter((r) => r.previewState === "preview").length,
          unavailable: rows.filter((r) => r.previewState === "unavailable").length,
        },
        samples: rows.slice(0, 3).map((r) => ({
          id: r.id,
          name: r.name.slice(0, 40),
          previewState: r.previewState,
          previewUrl: r.previewUrl ? r.previewUrl.slice(0, 80) : null,
          thumbnailUrl: r.thumbnailUrl ? r.thumbnailUrl.slice(0, 80) : null,
          imageUrl: r.imageUrl ? r.imageUrl.slice(0, 80) : null,
          isCatalog: r.isCatalog,
        })),
      });
      
      // DIAGNOSTIC: Log raw API data vs mapped rows
      const rawRows = metadataRows;
      console.log("[DIAGNOSTIC] API -> UI mapping check", {
        first_3_raw: rawRows.slice(0, 3).map((r) => ({
          id: r.id,
          name: r.name.slice(0, 30),
          thumbnail_url: r.thumbnail_url ?? "NULL",
          image_url: r.image_url ?? "NULL",
          preview_url: r.preview_url ?? "NULL",
          preview_state: r.preview_state,
          preview_render_mode: r.preview?.render_mode,
          preview_object_FULL: r.preview,
        })),
        first_3_mapped: rows.slice(0, 3).map((r) => ({
          id: r.id,
          name: r.name.slice(0, 30),
          thumbnailUrl: r.thumbnailUrl ?? "NULL",
          imageUrl: r.imageUrl ?? "NULL",
          previewUrl: r.previewUrl ?? "NULL",
          previewState: r.previewState,
          preview_image_url: r.preview?.image_url ?? "NULL",
          preview_poster_url: r.preview?.poster_url ?? "NULL",
          preview_object_FULL: r.preview,
        })),
      });
      
      // DIAGNOSTIC: Full backend response status
      console.log("[DIAGNOSTIC] Backend response metadata", {
        status: creativesMetadataQuery.data?.status,
        total_rows: rawRows.length,
        has_preview_field: rawRows.length > 0 ? typeof rawRows[0]?.preview : "N/A",
        media_hydrated: Boolean(creativesMediaQuery.data?.media_hydrated),
      });
    }
    return rows;
  }, [creativesMediaQuery.data?.media_hydrated, creativesMediaQuery.data?.rows, creativesMetadataQuery.data?.rows]);

  const filteredRows = useMemo(() => {
    if (platform !== "meta") return [];
    return applyCreativeFilters(allRows, topFilters);
  }, [allRows, platform, topFilters]);
  const deferredFilteredRows = useDeferredValue(filteredRows);

  useEffect(() => {
    setSelectionState((prev) => {
      const filteredIds = new Set(filteredRows.map((row) => row.id));
      const kept = prev.selectedRowIds.filter((id) => filteredIds.has(id));

      if (
        !hasUserInteractedSelectionRef.current &&
        kept.length === 0 &&
        filteredRows.length > 0
      ) {
        return { selectedRowIds: filteredRows.slice(0, 5).map((row) => row.id) };
      }

      if (kept.length !== prev.selectedRowIds.length) {
        return { selectedRowIds: kept };
      }

      return prev;
    });
  }, [filteredRows]);

  const selectedRows = useMemo(
    () =>
      deferredFilteredRows
        .filter((row) => selectionState.selectedRowIds.includes(row.id)),
    [deferredFilteredRows, selectionState.selectedRowIds]
  );
  const topPanelRows = useMemo(
    () => selectedRows,
    [selectedRows]
  );
  const previewStatusPayload = creativesMediaQuery.data ?? creativesMetadataQuery.data;
  const previewStripState = useMemo<PreviewStripState>(() => {
    const metadataRows = creativesMetadataQuery.data?.rows ?? [];
    const hasMetadataRows = metadataRows.length > 0;

    if (!hasMetadataRows) {
      if (creativesMetadataQuery.isLoading || creativesMetadataQuery.isFetching) {
        return "data_loading";
      }
      return "media_hydrating";
    }

    const mediaHydrated = previewStatusPayload?.media_hydrated === true;
    const previewCoverage = previewStatusPayload?.preview_coverage?.previewCoverage ?? 0;

    if (!mediaHydrated) {
      return "media_hydrating";
    }

    if (previewCoverage > 0) {
      return "ready";
    }

    return "missing";
  }, [
    creativesMetadataQuery.data?.rows,
    creativesMetadataQuery.isFetching,
    creativesMetadataQuery.isLoading,
    previewStatusPayload,
  ]);
  const topPreviewRows = useMemo(
    () =>
      previewStripState === "ready"
        ? topPanelRows.filter((row) => hasRenderablePreview(row)).slice(0, 20)
        : [],
    [previewStripState, topPanelRows]
  );
  const topPreviewSummary = useMemo(() => {
    const total = topPanelRows.length;
    const ready = previewStripState === "ready" ? topPreviewRows.length : 0;
    const pending =
      previewStripState === "data_loading" || previewStripState === "media_hydrating"
        ? total
        : 0;
    const missing = previewStripState === "missing" ? total : Math.max(total - ready - pending, 0);
    const minimumReady = total <= 2 ? 1 : Math.min(3, total);

    return {
      state: previewStripState,
      total,
      ready,
      pending,
      missing,
      minimumReady,
    };
  }, [previewStripState, topPanelRows.length, topPreviewRows.length]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (topPanelRows.length === 0 && filteredRows.length === 0) return;

    console.log("[creatives-page] before CreativesTopSection", {
      total: topPanelRows.length,
      top_preview_summary: topPreviewSummary,
      samples: topPanelRows.slice(0, 3).map((row) => ({
        id: row.id,
        name: row.name,
        previewUrl: row.previewUrl ?? null,
        thumbnailUrl: row.thumbnailUrl ?? null,
        imageUrl: row.imageUrl ?? null,
        previewState: row.previewState,
        isCatalog: row.isCatalog,
      })),
    });

    console.log("[creatives-page] before CreativesTableSection", {
      total: filteredRows.length,
      samples: filteredRows.slice(0, 3).map((row) => ({
        id: row.id,
        name: row.name,
        previewUrl: row.previewUrl ?? null,
        thumbnailUrl: row.thumbnailUrl ?? null,
        imageUrl: row.imageUrl ?? null,
        previewState: row.previewState,
        isCatalog: row.isCatalog,
      })),
    });
  }, [filteredRows, topPanelRows, topPreviewSummary]);

  const activeCreativeRow = useMemo(
    () => filteredRows.find((row) => row.id === creativeDrawerState.activeRowId) ?? null,
    [filteredRows, creativeDrawerState.activeRowId]
  );
  const activeBreakdownCreativeRow = useMemo(
    () => filteredRows.find((row) => row.id === breakdownDrawerState.activeRowId) ?? null,
    [filteredRows, breakdownDrawerState.activeRowId]
  );
  const adBreakdownRows = useMemo(() => {
    const creativeName = activeBreakdownCreativeRow?.name ?? null;
    if (!creativeName) return [];
      const rows = (adBreakdownQuery.data?.rows ?? []).map(mapApiRowToUiRow);
    return rows.filter((row) => row.name === creativeName);
  }, [activeBreakdownCreativeRow?.name, adBreakdownQuery.data?.rows]);

  const openCreativeDrawer = useCallback((rowId: string, scrollToRow = false) => {
    setCreativeDrawerState({ open: true, activeRowId: rowId });
    if (scrollToRow) {
      const target = document.getElementById(`creative-row-${rowId}`);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);
  const openAdBreakdownDrawer = useCallback((rowId: string) => {
    setBreakdownDrawerState({ open: true, activeRowId: rowId });
    setHighlightedRowId(rowId);
    setTimeout(() => setHighlightedRowId((prev) => (prev === rowId ? null : prev)), 1400);
  }, []);

  const toggleRowSelection = useCallback((rowId: string) => {
    hasUserInteractedSelectionRef.current = true;
    setSelectionState((prev) => ({
      selectedRowIds: prev.selectedRowIds.includes(rowId)
        ? prev.selectedRowIds.filter((id) => id !== rowId)
        : [...prev.selectedRowIds, rowId],
    }));
  }, []);

  const toggleAllRows = useCallback(() => {
    hasUserInteractedSelectionRef.current = true;
    const allIds = deferredFilteredRows.map((row) => row.id);
    setSelectionState((prev) => ({
      selectedRowIds: allIds.every((id) => prev.selectedRowIds.includes(id)) ? [] : allIds,
    }));
  }, [deferredFilteredRows]);

  const handleCsvExport = async () => {
    setCsvError(null);
    setCsvExportLoading(true);
    try {
      const csv = toCsv(filteredRows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `top-creatives-${drStart}-to-${drEnd}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setCsvError("Could not export CSV.");
    } finally {
      setCsvExportLoading(false);
    }
  };

  const handleShareExport = async () => {
    setShareError(null);
    setShareExportLoading(true);
    try {
      const selectedForShare =
        selectionState.selectedRowIds.length > 0
          ? filteredRows.filter((row) => selectionState.selectedRowIds.includes(row.id))
          : filteredRows;
      const shareMetrics = topMetricIds.filter((id): id is ShareMetricKey => SHARE_METRIC_IDS.has(id as ShareMetricKey));
      const payload: Omit<SharePayload, "token" | "createdAt"> = {
        title: "Top Creatives",
        dateRange: formatCreativeDateLabel(dateRangeValue),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
        businessId,
        groupBy,
        filters: topFilters.map((rule) => `${rule.field}: ${rule.query}`),
        selectedRowIds: selectionState.selectedRowIds,
        totalRows: filteredRows.length,
        metrics: shareMetrics.length > 0 ? shareMetrics : ["spend", "roas"],
        includeNotes: false,
        note: "",
        creatives: selectedForShare.map(toSharedCreative),
        benchmarkCreatives: filteredRows.map(toSharedCreative),
      };

      const res = await fetch("/api/creatives/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as { url?: string; message?: string } | null;
      if (!res.ok || !json?.url) {
        throw new Error(json?.message ?? "Could not create share link.");
      }
      setShareUrl(json.url);
    } catch (error: unknown) {
      setShareError(error instanceof Error ? error.message : "Could not create share link.");
    } finally {
      setShareExportLoading(false);
    }
  };

  const dataStatus = creativesMetadataQuery.data?.status;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (creativeDrawerState.open && creativeDrawerState.activeRowId) {
      params.set("creative", creativeDrawerState.activeRowId);
    } else {
      params.delete("creative");
    }
    const next = params.toString();
    const nextUrl = `${window.location.pathname}${next ? `?${next}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [creativeDrawerState.activeRowId, creativeDrawerState.open]);

  useEffect(() => {
    if (creativeDrawerState.open) return;
    if (typeof window === "undefined") return;
    const fromUrl = new URLSearchParams(window.location.search).get("creative");
    if (!fromUrl) return;
    const exists = filteredRows.some((row) => row.id === fromUrl);
    if (!exists) return;
    setCreativeDrawerState({ open: true, activeRowId: fromUrl });
  }, [creativeDrawerState.open, filteredRows]);

  if (!selectedBusinessId) return <BusinessEmptyState />;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Top Creatives</h1>
        <p className="text-sm text-muted-foreground">
          Identify the creatives driving the most spend and revenue across your ad accounts. Analyze performance, spot winners, and scale what works.
        </p>
      </div>

      {(() => {
        const platformLabel = PLATFORM_LABELS[platform] ?? platform;

        if (platform !== "meta") {
          if (!platformConnected) {
            return (
              <LockedFeatureCard
                providerLabel={platformLabel}
                description={`Connect ${platformLabel} to view creative performance and sharing tools.`}
              />
            );
          }
          return (
            <EmptyState
              title="Creative view unavailable"
              description={`Creative view for ${platformLabel} is not supported yet.`}
            />
          );
        }

        if (!platformConnected) {
          return (
            <IntegrationEmptyState
              providerLabel="Meta"
              status={platformStatus}
              description="Connect Meta to view creative performance"
            />
          );
        }

        if (!isDemoBusiness && platformConnected && metaAssignmentsState === "loading" && assignedMetaAccounts.length === 0) {
          return <LoadingSkeleton rows={5} />;
        }

        if (!metaHasAssignments || dataStatus === "no_accounts_assigned") {
          return (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <h3 className="text-base font-semibold">
                Assign Meta ad accounts to this business to load creatives
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Connect and assign at least one Meta ad account for this business first.
              </p>
              <Button className="mt-4" variant="outline" onClick={() => router.push("/integrations") }>
                Open Integrations
              </Button>
            </div>
          );
        }

        return (
          <>
            <CreativesTopSection
              showHeader={false}
              showAiActionsRow={false}
              dateRange={dateRangeValue}
              onDateRangeChange={setDateRangeValue}
              groupBy={groupBy}
              onGroupByChange={setGroupBy}
              filters={topFilters}
              onFiltersChange={setTopFilters}
              selectedMetricIds={topMetricIds}
              onSelectedMetricIdsChange={setTopMetricIds}
              selectedRows={topPreviewRows}
              allRowsForHeatmap={filteredRows}
              defaultCurrency={selectedBusinessCurrency}
              onOpenRow={(rowId) => openCreativeDrawer(rowId, true)}
              onShareExport={handleShareExport}
              onCsvExport={handleCsvExport}
              shareExportLoading={shareExportLoading}
              csvExportLoading={csvExportLoading}
              shareUrl={shareUrl}
              shareError={shareError}
              csvError={csvError}
              previewStripState={previewStripState}
              previewStripSummary={topPreviewSummary}
            />

            {creativesMetadataQuery.isLoading && <CreativesTableShell />}

            {creativesMetadataQuery.isError && (
              <ErrorState
                title="Could not load creatives"
                description={
                  creativesMetadataQuery.error instanceof Error
                    ? creativesMetadataQuery.error.message
                    : "Could not load creative performance data."
                }
                onRetry={() => creativesMetadataQuery.refetch()}
              />
            )}

            {!creativesMetadataQuery.isLoading &&
              !creativesMetadataQuery.isError &&
              (deferredFilteredRows.length === 0 || dataStatus === "no_data") && (
                <EmptyState
                  title="No creative performance data found for the selected range"
                  description="Try a wider date range or verify that assigned Meta accounts have active ad delivery."
                />
              )}

            {!creativesMetadataQuery.isLoading &&
              !creativesMetadataQuery.isError &&
              deferredFilteredRows.length > 0 &&
              dataStatus !== "no_data" && (
                <>
                  <CreativesTableSection
                    rows={deferredFilteredRows}
                    businessId={businessId}
                    selectedMetricIds={topMetricIds}
                    onSelectedMetricIdsChange={setTopMetricIds}
                    selectedRowIds={selectionState.selectedRowIds}
                    onReplaceSelectedRowIds={(rowIds) => {
                      hasUserInteractedSelectionRef.current = true;
                      setSelectionState({ selectedRowIds: rowIds });
                    }}
                    highlightedRowId={highlightedRowId}
                    defaultCurrency={selectedBusinessCurrency}
                    onToggleRow={toggleRowSelection}
                    onToggleAll={toggleAllRows}
                    onOpenRow={openCreativeDrawer}
                    onOpenBreakdownRow={openAdBreakdownDrawer}
                  />
                </>
              )}
          </>
        );
      })()}

      <CreativeDetailExperience
        businessId={businessId}
        row={activeCreativeRow}
        allRows={filteredRows}
        open={creativeDrawerState.open}
        notes={activeCreativeRow ? notesByRowId[activeCreativeRow.id] ?? "" : ""}
        dateRange={dateRangeValue}
        defaultCurrency={selectedBusinessCurrency}
        onOpenChange={(open) =>
          setCreativeDrawerState((prev) => ({ ...prev, open, activeRowId: open ? prev.activeRowId : null }))
        }
        onDateRangeChange={setDateRangeValue}
        onNotesChange={(value) => {
          if (!activeCreativeRow) return;
          setNotesByRowId((prev) => ({ ...prev, [activeCreativeRow.id]: value }));
        }}
      />
      <CreativeAdBreakdownDrawer
        open={breakdownDrawerState.open}
        creative={activeBreakdownCreativeRow}
        rows={adBreakdownRows}
        loading={adBreakdownQuery.isLoading}
        defaultCurrency={selectedBusinessCurrency}
        onOpenChange={(open) =>
          setBreakdownDrawerState((prev) => ({ ...prev, open, activeRowId: open ? prev.activeRowId : null }))
        }
      />
    </div>
  );
}
