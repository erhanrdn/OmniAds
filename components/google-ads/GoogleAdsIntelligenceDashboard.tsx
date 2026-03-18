"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { MiniTrendAreaChart } from "@/components/overview/MiniTrendAreaChart";
import {
  DateRangePicker,
  DEFAULT_DATE_RANGE,
  getPresetDates,
  type DateRangeValue,
  type RangePreset,
} from "@/components/date-range/DateRangePicker";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ActionState = "scale" | "optimize" | "test" | "reduce";

interface Campaign {
  id: string;
  name: string;
  status: string;
  channel: string;
  impressions?: number;
  clicks?: number;
  ctr?: number;
  cpc?: number;
  conversionRate?: number;
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
  cpa: number;
  impressionShare: number | null;
  lostIsBudget: number | null;
  spendShare: number;
  revenueShare: number;
  actionState: ActionState;
  roasChange: number | null | undefined;
  spendChange: number | null | undefined;
  revenueChange?: number | null | undefined;
  conversionsChange?: number | null | undefined;
}

interface CampaignsResponse {
  rows: Campaign[];
  summary: { accountAvgRoas: number };
}

interface SearchTheme {
  text: string;
  coverage?: "high" | "medium" | "low";
  alignedMessaging?: boolean;
}

interface AssetGroupRow {
  id: string;
  campaignId?: string | null;
  campaign?: string;
  name: string;
  spend: number;
  revenue: number;
  roas: number;
  conversionRate: number;
  coverageScore: number;
  classification?: string;
  searchThemes: SearchTheme[];
  searchThemeCount: number;
  searchThemeAlignedCount: number;
  messagingMismatchCount?: number;
  missingAssetFields?: string[];
  recommendation?: string;
}

interface AssetGroupsResponse {
  rows: AssetGroupRow[];
}

interface AudienceRow {
  campaignId?: string | null;
  campaign?: string;
  type: string;
  spend: number;
  roas: number;
  conversions: number;
}

interface AudiencesResponse {
  rows: AudienceRow[];
}

interface AssetRow {
  id: string;
  campaignId?: string | null;
  campaign?: string;
  assetGroup?: string;
  type: string;
  performanceLabel?: "top" | "average" | "underperforming";
  spend: number;
  conversions: number;
  roas: number;
  interactionRate?: number | null;
  preview?: string | null;
  assetText?: string | null;
  hint?: string;
}

interface AssetsResponse {
  rows: AssetRow[];
}

interface ProductRow {
  itemId?: string;
  title?: string;
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
  statusLabel?: "scale" | "stable" | "test" | "reduce";
  contributionState?: "positive" | "neutral" | "negative";
  sourceType?: "product" | "campaign_proxy";
}

interface ProductsResponse {
  rows: ProductRow[];
}

interface SearchIntelligenceRow {
  key?: string;
  campaignId?: string | null;
  campaign?: string;
  searchTerm: string;
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
  ctr?: number;
  status?: string;
  intent?: string;
  isKeyword?: boolean;
  matchSource?: string;
  source?: string;
  recommendation?: string;
  classification?: string;
  wasteFlag?: boolean;
  keywordOpportunityFlag?: boolean;
  negativeKeywordFlag?: boolean;
}

interface SearchIntelligenceResponse {
  rows: SearchIntelligenceRow[];
  summary?: {
    wastefulSpend?: number;
    keywordOpportunityCount?: number;
    negativeKeywordCount?: number;
    promotionSuggestionCount?: number;
  };
}

interface GeoRow {
  country: string;
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
  ctr?: number;
}

interface GeoResponse {
  rows: GeoRow[];
}

interface DeviceRow {
  device: string;
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
  ctr?: number;
}

interface DevicesResponse {
  rows: DeviceRow[];
}

const ACTION_CONFIG: Record<ActionState, { label: string; dot: string; chip: string; border: string }> = {
  scale: { label: "Scale", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-800", border: "border-emerald-200" },
  optimize: { label: "Optimize", dot: "bg-sky-500", chip: "bg-sky-50 text-sky-800", border: "border-sky-200" },
  test: { label: "Test", dot: "bg-amber-500", chip: "bg-amber-50 text-amber-800", border: "border-amber-200" },
  reduce: { label: "Reduce", dot: "bg-rose-500", chip: "bg-rose-50 text-rose-800", border: "border-rose-200" },
};

function mapRangePresetToApi(value: RangePreset): "7" | "14" | "30" | "90" | "custom" {
  if (value === "7d") return "7";
  if (value === "14d") return "14";
  if (value === "30d") return "30";
  if (value === "90d") return "90";
  return "custom";
}

function isCampaignActive(status: string): boolean {
  const lower = status.toLowerCase();
  return lower === "active" || lower === "enabled";
}

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtRoas(n: number): string {
  return `${n.toFixed(2)}x`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(0)}%`;
}

function fmtNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

type TrendLabelMode = "day" | "month";
type PanelKey = "insights" | "assetGroupAudience" | "products" | "assets";

const PANEL_ITEMS: Array<{ key: PanelKey; label: string }> = [
  { key: "insights", label: "Insights & Reports" },
  { key: "assetGroupAudience", label: "Asset Group & Audience Signals" },
  { key: "products", label: "Product Spend & Performance" },
  { key: "assets", label: "Asset Performance Radar" },
];

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function resolveTrendTimeline(start: string, end: string): {
  dates: string[];
  labelMode: TrendLabelMode;
} {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
    return { dates: [], labelMode: "day" };
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const daySpan = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / msPerDay) + 1);

  if (daySpan > 180) {
    const dates: string[] = [];
    const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
    const endMonth = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));

    while (cursor <= endMonth) {
      dates.push(toIsoDate(cursor));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    return { dates, labelMode: "month" };
  }

  const stepDays = daySpan <= 45 ? 1 : daySpan <= 120 ? 2 : 3;
  const dates: string[] = [];
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    dates.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + stepDays);
  }

  const last = dates[dates.length - 1];
  if (last !== toIsoDate(endDate)) {
    dates.push(toIsoDate(endDate));
  }

  return { dates, labelMode: "day" };
}

function trendData(current: number, dates: string[]): Array<{ date: string; value: number }> {
  if (!Array.isArray(dates) || dates.length === 0) {
    return [];
  }

  const safeCurrent = Number.isFinite(current) ? current : 0;
  return dates.map((date, index) => ({
    date,
    value: Math.max(0, safeCurrent * (0.82 + index / Math.max(dates.length * 4, 1))),
  }));
}

export function GoogleAdsIntelligenceDashboard({ businessId }: { businessId: string }) {
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [selectedCampaignNames, setSelectedCampaignNames] = useState<string[]>([]);
  const [includeSpentInactive, setIncludeSpentInactive] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelKey>("insights");

  const { start: startDate, end: endDate } = getPresetDates(
    dateRange.rangePreset,
    dateRange.customStart,
    dateRange.customEnd
  );
  const compareMode = dateRange.comparisonPreset === "none" ? "none" : "previous_period";
  const apiDateRange = mapRangePresetToApi(dateRange.rangePreset);
  const { dates: trendTimelineDates, labelMode: trendLabelMode } = useMemo(
    () => resolveTrendTimeline(startDate, endDate),
    [startDate, endDate]
  );

  const { data, isLoading, isError } = useQuery<CampaignsResponse>({
    queryKey: ["gads-campaigns", businessId, startDate, endDate, compareMode],
    queryFn: async () => {
      const params = new URLSearchParams({ businessId, dateRange: apiDateRange, compareMode });
      if (apiDateRange === "custom") {
        params.set("customStart", startDate);
        params.set("customEnd", endDate);
      }
      const res = await fetch(`/api/google-ads/campaigns?${params}`);
      if (!res.ok) throw new Error("fetch failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: assetGroupData, isLoading: isAssetGroupsLoading } = useQuery<AssetGroupsResponse>({
    queryKey: ["gads-asset-groups", businessId, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ businessId, dateRange: apiDateRange });
      if (apiDateRange === "custom") {
        params.set("customStart", startDate);
        params.set("customEnd", endDate);
      }
      const res = await fetch(`/api/google-ads/asset-groups?${params}`);
      if (!res.ok) throw new Error("asset groups fetch failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: audiencesData, isLoading: isAudiencesLoading } = useQuery<AudiencesResponse>({
    queryKey: ["gads-audiences", businessId, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ businessId, dateRange: apiDateRange });
      if (apiDateRange === "custom") {
        params.set("customStart", startDate);
        params.set("customEnd", endDate);
      }
      const res = await fetch(`/api/google-ads/audiences?${params}`);
      if (!res.ok) throw new Error("audiences fetch failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: assetsData, isLoading: isAssetsLoading } = useQuery<AssetsResponse>({
    queryKey: ["gads-assets", businessId, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ businessId, dateRange: apiDateRange });
      if (apiDateRange === "custom") {
        params.set("customStart", startDate);
        params.set("customEnd", endDate);
      }
      const res = await fetch(`/api/google-ads/assets?${params}`);
      if (!res.ok) throw new Error("assets fetch failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: productsData, isLoading: isProductsLoading } = useQuery<ProductsResponse>({
    queryKey: ["gads-products", businessId, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ businessId, dateRange: apiDateRange });
      if (apiDateRange === "custom") {
        params.set("customStart", startDate);
        params.set("customEnd", endDate);
      }
      const res = await fetch(`/api/google-ads/products?${params}`);
      if (!res.ok) throw new Error("products fetch failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: searchTermsData, isLoading: isSearchTermsLoading } = useQuery<SearchIntelligenceResponse>({
    queryKey: ["gads-search-intelligence", businessId, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ businessId, dateRange: apiDateRange });
      if (apiDateRange === "custom") {
        params.set("customStart", startDate);
        params.set("customEnd", endDate);
      }
      const res = await fetch(`/api/google-ads/search-intelligence?${params}`);
      if (!res.ok) throw new Error("search intelligence fetch failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: geoData, isLoading: isGeoLoading } = useQuery<GeoResponse>({
    queryKey: ["gads-geo", businessId, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ businessId, dateRange: apiDateRange });
      if (apiDateRange === "custom") {
        params.set("customStart", startDate);
        params.set("customEnd", endDate);
      }
      const res = await fetch(`/api/google-ads/geo?${params}`);
      if (!res.ok) throw new Error("geo fetch failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: devicesData, isLoading: isDevicesLoading } = useQuery<DevicesResponse>({
    queryKey: ["gads-devices", businessId, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ businessId, dateRange: apiDateRange });
      if (apiDateRange === "custom") {
        params.set("customStart", startDate);
        params.set("customEnd", endDate);
      }
      const res = await fetch(`/api/google-ads/devices?${params}`);
      if (!res.ok) throw new Error("devices fetch failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const rows = data?.rows ?? [];
  const scopedRows = rows.filter((r) => isCampaignActive(r.status) || (includeSpentInactive && r.spend > 0));
  const channels = Array.from(new Set(scopedRows.map((r) => r.channel))).filter(Boolean).sort();
  const channelRows = channelFilter === "all" ? scopedRows : scopedRows.filter((r) => r.channel === channelFilter);
  const campaignNameOptions = useMemo(
    () => Array.from(new Set(channelRows.map((r) => r.name))).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [channelRows]
  );
  const selectedInScope = selectedCampaignNames.filter((name) => campaignNameOptions.includes(name));
  const filtered = selectedInScope.length === 0 ? channelRows : channelRows.filter((r) => selectedInScope.includes(r.name));
  const sortedRows = [...filtered].sort((a, b) => b.spend - a.spend);

  const totalSpend = sortedRows.reduce((s, r) => s + r.spend, 0);
  const totalRevenue = sortedRows.reduce((s, r) => s + r.revenue, 0);
  const totalConv = sortedRows.reduce((s, r) => s + r.conversions, 0);
  const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const blendedCpa = totalConv > 0 ? totalSpend / totalConv : 0;
  const totalImpressions = sortedRows.reduce((s, r) => s + Number(r.impressions ?? 0), 0);
  const totalClicks = sortedRows.reduce((s, r) => s + Number(r.clicks ?? 0), 0);
  const blendedCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const blendedCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const blendedCvR = totalClicks > 0 ? (totalConv / totalClicks) * 100 : 0;
  const avgImpressionShare =
    sortedRows.filter((r) => typeof r.impressionShare === "number").length > 0
      ? (sortedRows
          .filter((r) => typeof r.impressionShare === "number")
          .reduce((s, r) => s + Number(r.impressionShare ?? 0), 0) /
          sortedRows.filter((r) => typeof r.impressionShare === "number").length) *
        100
      : 0;
  const avgLostIsBudget =
    sortedRows.filter((r) => typeof r.lostIsBudget === "number").length > 0
      ? (sortedRows
          .filter((r) => typeof r.lostIsBudget === "number")
          .reduce((s, r) => s + Number(r.lostIsBudget ?? 0), 0) /
          sortedRows.filter((r) => typeof r.lostIsBudget === "number").length) *
        100
      : 0;

  const assetGroupsByCampaignKey = useMemo(() => {
    const map = new Map<string, AssetGroupRow[]>();
    const rows = assetGroupData?.rows ?? [];
    for (const row of rows) {
      const key = row.campaignId ?? row.campaign ?? "";
      if (!key) continue;
      const current = map.get(key) ?? [];
      current.push(row);
      map.set(key, current);
    }
    return map;
  }, [assetGroupData?.rows]);

  const audiencesByCampaignKey = useMemo(() => {
    const map = new Map<string, AudienceRow[]>();
    const rows = audiencesData?.rows ?? [];
    for (const row of rows) {
      const key = row.campaignId ?? row.campaign ?? "";
      if (!key) continue;
      const current = map.get(key) ?? [];
      current.push(row);
      map.set(key, current);
    }
    return map;
  }, [audiencesData?.rows]);

  const campaignSignalCards = useMemo(() => {
    return sortedRows
      .map((campaign) => {
        const groups =
          assetGroupsByCampaignKey.get(campaign.id) ??
          assetGroupsByCampaignKey.get(campaign.name) ??
          [];
        const audienceRows =
          audiencesByCampaignKey.get(campaign.id) ??
          audiencesByCampaignKey.get(campaign.name) ??
          [];

        const totalThemes = groups.reduce((sum, g) => sum + (g.searchThemeCount ?? 0), 0);
        const alignedThemes = groups.reduce((sum, g) => sum + (g.searchThemeAlignedCount ?? 0), 0);
        const themeAlignment = totalThemes > 0 ? (alignedThemes / totalThemes) * 100 : 0;
        const weakAudienceSegments = audienceRows.filter((a) => a.spend > 50 && a.roas < 1.8);

        return {
          campaign,
          groups: [...groups].sort((a, b) => b.spend - a.spend),
          audienceRows,
          totalThemes,
          alignedThemes,
          themeAlignment,
          weakAudienceSegments,
        };
      })
      .filter((entry) => entry.groups.length > 0)
      .slice(0, 8);
  }, [sortedRows, assetGroupsByCampaignKey, audiencesByCampaignKey]);

  const scopedAssets = useMemo(() => {
    const rows = assetsData?.rows ?? [];
    if (sortedRows.length === 0) return rows;
    const campaignIds = new Set(sortedRows.map((r) => r.id));
    const campaignNames = new Set(sortedRows.map((r) => r.name));
    return rows.filter((row) => {
      const idMatch = row.campaignId ? campaignIds.has(row.campaignId) : false;
      const nameMatch = row.campaign ? campaignNames.has(row.campaign) : false;
      return idMatch || nameMatch;
    });
  }, [assetsData?.rows, sortedRows]);

  const underperformingAssets = useMemo(
    () => scopedAssets.filter((a) => a.performanceLabel === "underperforming"),
    [scopedAssets]
  );

  const topAssets = useMemo(
    () => scopedAssets.filter((a) => a.performanceLabel === "top").sort((a, b) => b.roas - a.roas).slice(0, 6),
    [scopedAssets]
  );

  const weakAssetsByType = useMemo(() => {
    const targets = ["Headline", "Description", "Image", "Video"] as const;
    const grouped = new Map<string, AssetRow[]>();
    for (const target of targets) {
      grouped.set(
        target,
        underperformingAssets
          .filter((asset) => asset.type === target)
          .sort((a, b) => b.spend - a.spend)
          .slice(0, 4)
      );
    }
    return grouped;
  }, [underperformingAssets]);

  const productRows = useMemo(() => {
    const rawRows = [...(productsData?.rows ?? [])].map((row) => ({
      ...row,
      sourceType: "product" as const,
    }));

    if (rawRows.length > 0) {
      return rawRows.sort((a, b) => b.spend - a.spend);
    }

    // Fallback: keep the panel actionable when product-level feed data is unavailable.
    return sortedRows.map((campaign) => ({
      itemId: campaign.id,
      title: `${campaign.name} (campaign proxy)`,
      spend: campaign.spend,
      revenue: campaign.revenue,
      roas: campaign.roas,
      conversions: campaign.conversions,
      statusLabel:
        campaign.actionState === "scale"
          ? "scale"
          : campaign.actionState === "reduce"
          ? "reduce"
          : campaign.actionState === "test"
          ? "test"
          : "stable",
      contributionState:
        campaign.revenue > campaign.spend
          ? "positive"
          : campaign.revenue < campaign.spend
          ? "negative"
          : "neutral",
      sourceType: "campaign_proxy" as const,
    }));
  }, [productsData?.rows, sortedRows]);

  const hasRealProductRows = (productsData?.rows?.length ?? 0) > 0;

  const totalProductSpend = productRows.reduce((sum, row) => sum + Number(row.spend ?? 0), 0);
  const totalProductRevenue = productRows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0);
  const avgProductRoas = totalProductSpend > 0 ? totalProductRevenue / totalProductSpend : 0;
  const weakProducts = productRows.filter((row) => row.spend > 20 && row.roas < Math.max(avgProductRoas * 0.8, 1.5));

  const scopedSearchTerms = useMemo(() => {
    const rows = searchTermsData?.rows ?? [];
    if (sortedRows.length === 0) return rows;
    const campaignIds = new Set(sortedRows.map((r) => r.id));
    const campaignNames = new Set(sortedRows.map((r) => r.name));
    return rows.filter((row) => {
      const idMatch = row.campaignId ? campaignIds.has(row.campaignId) : false;
      const nameMatch = row.campaign ? campaignNames.has(row.campaign) : false;
      return idMatch || nameMatch;
    });
  }, [searchTermsData?.rows, sortedRows]);

  const searchTermNegativeRows = useMemo(
    () =>
      scopedSearchTerms
        .filter(
          (row) =>
            row.negativeKeywordFlag === true ||
            row.wasteFlag === true ||
            (row.spend > 20 && row.conversions === 0) ||
            (row.spend > 20 && row.roas < 1.3)
        )
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 8),
    [scopedSearchTerms]
  );

  const searchTermPositiveRows = useMemo(
    () =>
      scopedSearchTerms
        .filter(
          (row) =>
            row.recommendation === "Add as exact keyword" ||
            row.recommendation === "Promote in headlines" ||
            row.keywordOpportunityFlag === true ||
            (row.conversions > 0 && row.roas >= Math.max(blendedRoas, 2))
        )
        .sort((a, b) => b.conversions - a.conversions)
        .slice(0, 8),
    [scopedSearchTerms, blendedRoas]
  );

  const negativeSpendTotal = searchTermNegativeRows.reduce((sum, row) => sum + row.spend, 0);
  const positiveSpendTotal = searchTermPositiveRows.reduce((sum, row) => sum + row.spend, 0);

  const topGeoRows = useMemo(
    () => [...(geoData?.rows ?? [])].sort((a, b) => b.spend - a.spend).slice(0, 4),
    [geoData?.rows]
  );
  const topDeviceRows = useMemo(
    () => [...(devicesData?.rows ?? [])].sort((a, b) => b.spend - a.spend).slice(0, 4),
    [devicesData?.rows]
  );

  const searchSourceCounts = useMemo(() => {
    let pmax = 0;
    let search = 0;
    for (const row of scopedSearchTerms) {
      const source = (row.matchSource ?? row.source ?? "").toString().toUpperCase();
      if (source.includes("PERFORMANCE_MAX") || source.includes("CAMPAIGN_SEARCH_TERM_VIEW")) {
        pmax += 1;
      } else {
        search += 1;
      }
    }
    return { pmax, search };
  }, [scopedSearchTerms]);

  if (isError) {
    return <div className="py-10 text-sm text-muted-foreground">Campaign data could not be loaded.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base font-semibold tracking-tight">Campaigns</h1>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIncludeSpentInactive((p) => !p)}
                className={cn(
                  "inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-medium",
                  includeSpentInactive ? "border-amber-200 bg-amber-50 text-amber-800" : "border-border bg-background text-muted-foreground"
                )}
              >
                Include inactive with spend &gt; 0
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-[11px] font-medium">
                    Type: {channelFilter === "all" ? "All" : channelFilter}
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[180px]">
                  <DropdownMenuItem onClick={() => setChannelFilter("all")}>All types</DropdownMenuItem>
                  {channels.map((ch) => (
                    <DropdownMenuItem key={ch} onClick={() => setChannelFilter(ch)}>{ch}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="inline-flex max-w-[260px] items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-[11px] font-medium">
                    <span className="truncate">
                      {selectedInScope.length === 0 ? "Campaigns: All" : selectedInScope.length === 1 ? `Campaign: ${selectedInScope[0]}` : `${selectedInScope.length} campaigns selected`}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[300px]">
                  <DropdownMenuLabel>Campaign names</DropdownMenuLabel>
                  <DropdownMenuCheckboxItem checked={selectedInScope.length === 0} onSelect={(e) => e.preventDefault()} onCheckedChange={() => setSelectedCampaignNames([])}>
                    All campaigns
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {campaignNameOptions.map((name) => (
                    <DropdownMenuCheckboxItem
                      key={name}
                      checked={selectedInScope.includes(name)}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={() => setSelectedCampaignNames((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name])}
                    >
                      <span className="truncate">{name}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DateRangePicker value={dateRange} onChange={setDateRange} className="ml-1" comparisonPlaceholderLabel="Compare to" />
            </div>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{isLoading ? "Loading..." : `${scopedRows.length} campaigns · Google Ads`}</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-auto rounded-xl border border-border/70 bg-muted/20 p-1">
        {PANEL_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setActivePanel(item.key)}
            className={cn(
              "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              activePanel === item.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {isLoading ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />) : (
          <>
            <Kpi label="Spend" value={fmtCurrency(totalSpend)} series={trendData(totalSpend, trendTimelineDates)} formatter={fmtCurrency} dateLabelMode={trendLabelMode} />
            <Kpi label="ROAS" value={fmtRoas(blendedRoas)} series={trendData(blendedRoas, trendTimelineDates)} formatter={fmtRoas} dateLabelMode={trendLabelMode} highlight={blendedRoas >= 3} />
            <Kpi label="Revenue" value={fmtCurrency(totalRevenue)} series={trendData(totalRevenue, trendTimelineDates)} formatter={fmtCurrency} dateLabelMode={trendLabelMode} />
            <Kpi label="Conv" value={totalConv.toFixed(0)} series={trendData(totalConv, trendTimelineDates)} formatter={(v) => v.toFixed(0)} dateLabelMode={trendLabelMode} />
            <Kpi label="CPA" value={totalConv > 0 ? fmtCurrency(blendedCpa) : "-"} series={trendData(blendedCpa, trendTimelineDates)} formatter={fmtCurrency} dateLabelMode={trendLabelMode} />
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <Metric label="Impr." value={fmtNumber(totalImpressions)} />
        <Metric label="Clicks" value={fmtNumber(totalClicks)} />
        <Metric label="CTR" value={fmtPct(blendedCtr)} />
        <Metric label="CPC" value={totalClicks > 0 ? fmtCurrency(blendedCpc) : "-"} />
        <Metric label="Conv. Rate" value={totalClicks > 0 ? fmtPct(blendedCvR) : "-"} />
        <Metric label="Impr. Share" value={avgImpressionShare > 0 ? fmtPct(avgImpressionShare) : "-"} />
        <Metric label="Lost IS (Budget)" value={avgLostIsBudget > 0 ? fmtPct(avgLostIsBudget) : "-"} />
      </div>

      {isLoading ? (
        <div className="space-y-2.5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
      ) : sortedRows.length === 0 ? (
        <div className="flex min-h-[18vh] flex-col items-center justify-center rounded-2xl border border-dashed">
          <p className="text-sm text-muted-foreground">No campaigns match this filter</p>
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
          {sortedRows.map((c) => <CampaignCard key={c.id} campaign={c} accountAvgRoas={data?.summary.accountAvgRoas ?? blendedRoas} />)}
        </div>
      )}

      {activePanel === "insights" ? (
        <section className="space-y-3 rounded-xl border border-border/70 bg-card p-3">
          <p className="text-xs text-muted-foreground">Search terms and when/where ads appeared metrics</p>
          {isSearchTermsLoading || isGeoLoading || isDevicesLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-full border border-border/70 px-2 py-0.5 text-muted-foreground">Search terms {scopedSearchTerms.length}</span>
                <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-foreground/80">PMax {searchSourceCounts.pmax}</span>
                <span className="rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-foreground/80">Search {searchSourceCounts.search}</span>
                <span className="rounded-full border border-border/70 bg-rose-50/40 px-2 py-0.5 text-rose-700">Negative {searchTermNegativeRows.length}</span>
                <span className="rounded-full border border-border/70 bg-emerald-50/40 px-2 py-0.5 text-emerald-700">Positive {searchTermPositiveRows.length}</span>
              </div>

              <div className="grid gap-2 xl:grid-cols-2">
                <div className="rounded-lg border border-border/70 bg-card p-3">
                  <p className="text-xs font-semibold tracking-tight">Search terms - Negative / waste</p>
                  {searchTermNegativeRows.length === 0 ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">No high-risk search term in this filter.</p>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      {searchTermNegativeRows.map((row) => (
                        <div key={row.key ?? `${row.searchTerm}-${row.campaign ?? ""}`} className="rounded-md border border-border/70 bg-muted/20 p-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-1 text-[11px] font-medium">{row.searchTerm}</p>
                            <div className="flex items-center gap-1">
                              <span className="rounded-full border border-border/70 bg-background px-1.5 py-0.5 text-[9px] text-foreground/80">{row.campaign ?? "Campaign"}</span>
                              <span className="rounded-full border border-border/70 bg-background px-1.5 py-0.5 text-[9px] text-muted-foreground">{(row.matchSource ?? row.source ?? "SEARCH").toString().replaceAll("_", " ")}</span>
                            </div>
                          </div>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">Spend {fmtCurrency(row.spend)} · ROAS {fmtRoas(row.roas)} · Conv {row.conversions.toFixed(0)}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <span className="rounded-full border border-border/70 bg-rose-50/40 px-1.5 py-0.5 text-[9px] text-rose-700">Add negative</span>
                            {row.recommendation ? <span className="rounded-full border border-border/70 bg-amber-50/40 px-1.5 py-0.5 text-[9px] text-amber-700">{row.recommendation}</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border/70 bg-card p-3">
                  <p className="text-xs font-semibold tracking-tight">Search terms - Positive / opportunity</p>
                  {searchTermPositiveRows.length === 0 ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">No strong search term opportunity in this filter.</p>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      {searchTermPositiveRows.map((row) => (
                        <div key={row.key ?? `${row.searchTerm}-${row.campaign ?? ""}`} className="rounded-md border border-border/70 bg-muted/20 p-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-1 text-[11px] font-medium">{row.searchTerm}</p>
                            <div className="flex items-center gap-1">
                              <span className="rounded-full border border-border/70 bg-background px-1.5 py-0.5 text-[9px] text-foreground/80">{row.campaign ?? "Campaign"}</span>
                              <span className="rounded-full border border-border/70 bg-background px-1.5 py-0.5 text-[9px] text-muted-foreground">{(row.matchSource ?? row.source ?? "SEARCH").toString().replaceAll("_", " ")}</span>
                            </div>
                          </div>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">Spend {fmtCurrency(row.spend)} · ROAS {fmtRoas(row.roas)} · Conv {row.conversions.toFixed(0)}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <span className="rounded-full border border-border/70 bg-emerald-50/40 px-1.5 py-0.5 text-[9px] text-emerald-700">{row.recommendation === "Promote in headlines" ? "Promote headline" : "Add exact"}</span>
                            {row.recommendation ? <span className="rounded-full border border-border/70 bg-sky-50/40 px-1.5 py-0.5 text-[9px] text-sky-700">{row.recommendation}</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-2 xl:grid-cols-2">
                <div className="rounded-lg border border-border/70 bg-card p-3">
                  <p className="text-xs font-semibold tracking-tight">When and where ads showed - Locations</p>
                  <div className="mt-2 space-y-1.5">
                    {topGeoRows.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">No geo data in this range.</p>
                    ) : (
                      topGeoRows.map((row) => (
                        <div key={row.country} className="flex items-center justify-between rounded-md border border-border/70 bg-muted/20 px-2 py-1.5 text-[11px]">
                          <span className="truncate font-medium">{row.country}</span>
                          <span className="text-muted-foreground">Spend {fmtCurrency(row.spend)} · ROAS {fmtRoas(row.roas)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-border/70 bg-card p-3">
                  <p className="text-xs font-semibold tracking-tight">When and where ads showed - Devices</p>
                  <div className="mt-2 space-y-1.5">
                    {topDeviceRows.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">No device data in this range.</p>
                    ) : (
                      topDeviceRows.map((row) => (
                        <div key={row.device} className="flex items-center justify-between rounded-md border border-border/70 bg-muted/20 px-2 py-1.5 text-[11px]">
                          <span className="truncate font-medium">{row.device}</span>
                          <span className="text-muted-foreground">Spend {fmtCurrency(row.spend)} · ROAS {fmtRoas(row.roas)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      ) : null}

      {activePanel === "assetGroupAudience" ? (
        <section className="space-y-3 rounded-xl border border-border/70 bg-card p-3">
          <p className="text-xs text-muted-foreground">Asset group performance, search theme alignment, and audience risks by campaign</p>
          {isAssetGroupsLoading || isAudiencesLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
          ) : campaignSignalCards.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No asset group details found for this filter.</div>
          ) : (
            <div className="max-h-[520px] space-y-2.5 overflow-auto pr-1">
              {campaignSignalCards.map(({ campaign, groups, totalThemes, alignedThemes, themeAlignment, weakAudienceSegments, audienceRows }) => (
                <div key={campaign.id} className="rounded-lg border border-border/70 bg-card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{campaign.name}</p>
                      <p className="text-[11px] text-muted-foreground">{groups.length} asset group · {totalThemes} search theme · {audienceRows.length} audience signal</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-foreground/80">Theme match {fmtPct(themeAlignment)} ({alignedThemes}/{totalThemes})</span>
                      <span className={cn("rounded-full border border-border/70 px-2 py-0.5", weakAudienceSegments.length === 0 ? "bg-emerald-50/40 text-emerald-700" : "bg-rose-50/40 text-rose-700")}>Audience risk {weakAudienceSegments.length}</span>
                    </div>
                  </div>

                  <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {groups.map((group) => {
                      const groupThemeCount = group.searchThemeCount ?? group.searchThemes?.length ?? 0;
                      const groupAlignedCount = group.searchThemeAlignedCount ?? 0;
                      const groupThemeAlignment = groupThemeCount > 0 ? (groupAlignedCount / groupThemeCount) * 100 : 0;

                      return (
                        <div key={group.id} className="rounded-lg border border-border/70 bg-muted/20 p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold">{group.name}</p>
                              <p className="text-[10px] text-muted-foreground">Spend {fmtCurrency(group.spend)} · ROAS {fmtRoas(group.roas)}</p>
                            </div>
                            <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", group.roas >= blendedRoas ? "bg-emerald-50/50 text-emerald-700" : "bg-rose-50/50 text-rose-700")}>{group.roas >= blendedRoas ? "Above avg" : "Below avg"}</span>
                          </div>

                          <div className="mt-2 flex flex-wrap gap-1">
                            <span className="rounded-full border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[9px] text-foreground/80">Theme fit {fmtPct(groupThemeAlignment)}</span>
                            <span className="rounded-full border border-border/70 bg-muted/30 px-1.5 py-0.5 text-[9px] text-foreground/80">Coverage {fmtPct(group.coverageScore ?? 0)}</span>
                            {group.messagingMismatchCount ? <span className="rounded-full border border-border/70 bg-rose-50/40 px-1.5 py-0.5 text-[9px] text-rose-700">{group.messagingMismatchCount} mismatch</span> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {activePanel === "products" ? (
        <section className="space-y-3 rounded-xl border border-border/70 bg-card p-3">
          <p className="text-xs text-muted-foreground">Product-level spend, revenue, ROAS, and action status</p>
          {isProductsLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
          ) : productRows.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No product data found for this filter.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-full border border-border/70 px-2 py-0.5 text-muted-foreground">Products {productRows.length}</span>
                <span className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-foreground/80">Total spend {fmtCurrency(totalProductSpend)}</span>
                <span className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-foreground/80">Avg ROAS {fmtRoas(avgProductRoas)}</span>
                <span className={cn("rounded-full border border-border/70 px-2 py-0.5", weakProducts.length === 0 ? "bg-emerald-50/40 text-emerald-700" : "bg-rose-50/40 text-rose-700")}>Low performers {weakProducts.length}</span>
              </div>

              <div className="max-h-[360px] space-y-1 overflow-auto pr-1">
                {productRows.slice(0, 20).map((product, index) => {
                  const spendShare = totalProductSpend > 0 ? (product.spend / totalProductSpend) * 100 : 0;
                  const isWeak = product.spend > 20 && product.roas < Math.max(avgProductRoas * 0.8, 1.5);
                  return (
                    <div key={product.itemId ?? `${product.title ?? "product"}-${index}`} className="rounded-lg border border-border/70 bg-card px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-medium">{product.title ?? product.itemId ?? "Unnamed product"}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{product.itemId ?? "No item id"}</p>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-1 text-[10px]">
                          <span className="rounded-full border border-border/70 px-1.5 py-0.5">S {fmtCurrency(product.spend)}</span>
                          <span className="rounded-full border border-border/70 px-1.5 py-0.5">R {fmtCurrency(product.revenue)}</span>
                          <span className="rounded-full border border-border/70 bg-muted/30 px-1.5 py-0.5">ROAS {fmtRoas(product.roas)}</span>
                          <span className="rounded-full border border-border/70 bg-muted/20 px-1.5 py-0.5">Conv {product.conversions.toFixed(0)}</span>
                          <span className="rounded-full border border-border/70 bg-muted/20 px-1.5 py-0.5">Share {fmtPct(spendShare)}</span>
                          <span className={cn("rounded-full border border-border/70 px-1.5 py-0.5", isWeak ? "bg-rose-50/40 text-rose-700" : "bg-emerald-50/40 text-emerald-700")}>{isWeak ? "Needs action" : "Healthy"}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      ) : null}

      {activePanel === "assets" ? (
        <section className="space-y-3 rounded-xl border border-border/70 bg-card p-3">
          <p className="text-xs text-muted-foreground">Instantly highlights weak headline, description, image, and video assets</p>
          {isAssetsLoading ? (
            <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
          ) : scopedAssets.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No asset data found for this filter.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="rounded-full border border-border/70 bg-rose-50/40 px-2 py-0.5 text-rose-700">Underperforming {underperformingAssets.length}</span>
                <span className="rounded-full border border-border/70 bg-emerald-50/40 px-2 py-0.5 text-emerald-700">Top assets {topAssets.length}</span>
                <span className="rounded-full border border-border/70 px-2 py-0.5 text-muted-foreground">Total assets {scopedAssets.length}</span>
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {["Headline", "Description", "Image", "Video"].map((type) => {
                  const list = weakAssetsByType.get(type) ?? [];
                  return (
                    <div key={type} className="rounded-lg border border-border/70 bg-card p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold">{type}</p>
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", list.length === 0 ? "bg-emerald-50/50 text-emerald-700" : "bg-rose-50/50 text-rose-700")}>{list.length === 0 ? "Healthy" : `${list.length} issue`}</span>
                      </div>
                      {list.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">No critical issue detected for this asset type.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {list.map((asset) => (
                            <div key={asset.id} className="rounded-md border border-border/70 bg-muted/20 p-2">
                              <p className="line-clamp-1 text-[11px] font-medium">{asset.preview ?? asset.assetText ?? "Unnamed asset"}</p>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">Spend {fmtCurrency(asset.spend)} · ROAS {fmtRoas(asset.roas)} · Conv {asset.conversions.toFixed(0)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, series, formatter, dateLabelMode, highlight }: { label: string; value: string; series: Array<{ date: string; value: number }>; formatter: (value: number) => string; dateLabelMode: TrendLabelMode; highlight?: boolean; }) {
  return (
    <div className={cn("rounded-xl border bg-card p-3", highlight && "border-emerald-200 bg-emerald-50/50")}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <p className={cn("mt-1.5 text-[22px] font-semibold tracking-tight", highlight && "text-emerald-700")}>{value}</p>
      <div className="mt-1">
        <MiniTrendAreaChart data={series} tone="neutral" valueFormatter={formatter} dateLabelMode={dateLabelMode} className="h-10 w-full" />
      </div>
    </div>
  );
}

function CampaignCard({ campaign, accountAvgRoas }: { campaign: Campaign; accountAvgRoas: number }) {
  const cfg = ACTION_CONFIG[campaign.actionState];
  const roasUp = campaign.roas >= accountAvgRoas;
  return (
    <div className="h-full rounded-xl border bg-card p-3">
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", isCampaignActive(campaign.status) ? "bg-emerald-500" : "bg-slate-300")} />
        <p className="truncate text-[13px] font-medium">{campaign.name}</p>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600">{campaign.channel}</span>
        <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-semibold", cfg.border, cfg.chip)}>
          <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle", cfg.dot)} />{cfg.label}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-right">
        <Metric label="Spend" value={fmtCurrency(campaign.spend)} />
        <Metric label="ROAS" value={campaign.roas > 0 ? fmtRoas(campaign.roas) : "-"} valueColor={roasUp ? "text-emerald-700" : "text-rose-600"} />
        <Metric label="Revenue" value={fmtCurrency(campaign.revenue)} />
        <Metric label="Conv." value={campaign.conversions.toFixed(0)} />
      </div>
    </div>
  );
}

function Metric({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <p className="text-[9px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("text-[13px] font-semibold", valueColor)}>{value}</p>
    </div>
  );
}
