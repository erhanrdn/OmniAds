"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/store/app-store";
import { useIntegrationsStore } from "@/store/integrations-store";
import { isDemoBusinessSelected } from "@/lib/business-mode";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { IntegrationEmptyState } from "@/components/states/IntegrationEmptyState";
import { cn } from "@/lib/utils";
import { TabAlert, TabEmpty } from "@/components/google-ads/shared";

import { OverviewTab } from "@/components/google-ads/OverviewTab";
import { CampaignsTab } from "@/components/google-ads/CampaignsTab";
import { SearchTab } from "@/components/google-ads/SearchTab";
import { AssetsTab } from "@/components/google-ads/AssetsTab";
import { AssetGroupsTab } from "@/components/google-ads/AssetGroupsTab";
import { AudiencesTab } from "@/components/google-ads/AudiencesTab";
import { GeoTab } from "@/components/google-ads/GeoTab";
import { DevicesTab } from "@/components/google-ads/DevicesTab";
import { BudgetScalingTab } from "@/components/google-ads/BudgetScalingTab";
import { OpportunitiesTab } from "@/components/google-ads/OpportunitiesTab";
import { DiagnosticsTab } from "@/components/google-ads/DiagnosticsTab";

// ── Types ─────────────────────────────────────────────────────────────

type DateRange = "7" | "14" | "30";

type Tab =
  | "overview"
  | "campaigns"
  | "search"
  | "assets"
  | "asset-groups"
  | "audiences"
  | "geo"
  | "devices"
  | "budget-scaling"
  | "opportunities"
  | "diagnostics";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "campaigns", label: "Campaigns" },
  { id: "search", label: "Search" },
  { id: "assets", label: "Assets" },
  { id: "asset-groups", label: "Asset Groups" },
  { id: "audiences", label: "Audiences" },
  { id: "geo", label: "Geo" },
  { id: "devices", label: "Devices" },
  { id: "budget-scaling", label: "Budget & Scaling" },
  { id: "opportunities", label: "Opportunities" },
  { id: "diagnostics", label: "Diagnostics" },
];

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
];

// ── Fetchers ──────────────────────────────────────────────────────────

async function fetchTab(endpoint: string, businessId: string, dateRange: string) {
  const params = new URLSearchParams({ businessId, dateRange });
  const res = await fetch(`/api/google-ads/${endpoint}?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Failed to fetch ${endpoint}`);
  return data;
}

interface GoogleAdsMeta {
  partial?: boolean;
  warnings?: string[];
  failed_queries?: Array<{ query: string; message: string; customerId: string }>;
  unavailable_metrics?: string[];
}

// ── Page ──────────────────────────────────────────────────────────────

export default function GoogleAdsPage() {
  const businesses = useAppStore((state) => state.businesses);
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const ensureBusiness = useIntegrationsStore((state) => state.ensureBusiness);
  const byBusinessId = useIntegrationsStore((state) => state.byBusinessId);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [dateRange, setDateRange] = useState<DateRange>("30");

  const businessId = selectedBusinessId ?? "";

  // Ensure integration state is loaded
  useEffect(() => { if (businessId) ensureBusiness(businessId); }, [businessId, ensureBusiness]);

  const googleStatus = byBusinessId[businessId]?.google?.status;
  const isDemoBusiness = isDemoBusinessSelected(selectedBusinessId, businesses);
  const isConnected = googleStatus === "connected" || isDemoBusiness;

  // Guard: no business selected
  if (!selectedBusinessId) {
    return <BusinessEmptyState />;
  }

  // Guard: Google Ads not connected
  if (!isConnected) {
    return (
      <div className="p-6">
        <IntegrationEmptyState
          providerLabel="Google Ads"
          title="Connect Google Ads to unlock intelligence"
          description="Link your Google Ads account to see campaign performance, search terms, keywords, ad copy analysis, and optimisation opportunities."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 h-full">
      {/* Header */}
      <div className="border-b bg-background px-6 pt-6 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Google Ads</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Performance intelligence across your entire account
            </p>
          </div>
          {/* Date range selector */}
          <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
            {DATE_RANGE_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setDateRange(o.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  dateRange === o.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                activeTab === tab.id
                  ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-6">
        <TabContent
          activeTab={activeTab}
          businessId={businessId}
          dateRange={dateRange}
        />
      </div>
    </div>
  );
}

// ── Tab Content Router ────────────────────────────────────────────────

function TabContent({
  activeTab,
  businessId,
  dateRange,
}: {
  activeTab: Tab;
  businessId: string;
  dateRange: DateRange;
}) {
  const enabled = !!businessId;

  const overviewQ = useQuery({
    queryKey: ["google-ads-overview", businessId, dateRange],
    queryFn: () => fetchTab("overview", businessId, dateRange),
    enabled: enabled && activeTab === "overview",
    staleTime: 60_000,
  });

  const campaignsQ = useQuery({
    queryKey: ["google-ads-campaigns", businessId, dateRange],
    queryFn: () => fetchTab("campaigns", businessId, dateRange),
    enabled: enabled && activeTab === "campaigns",
    staleTime: 60_000,
  });

  const searchTermsQ = useQuery({
    queryKey: ["google-ads-search-terms", businessId, dateRange],
    queryFn: () => fetchTab("search-terms", businessId, dateRange),
    enabled: enabled && activeTab === "search",
    staleTime: 60_000,
  });

  const keywordsQ = useQuery({
    queryKey: ["google-ads-keywords", businessId, dateRange],
    queryFn: () => fetchTab("keywords", businessId, dateRange),
    enabled: enabled && activeTab === "search",
    staleTime: 60_000,
  });

  const adsQ = useQuery({
    queryKey: ["google-ads-ads", businessId, dateRange],
    queryFn: () => fetchTab("ads", businessId, dateRange),
    enabled: enabled && activeTab === "assets",
    staleTime: 60_000,
  });

  const creativesQ = useQuery({
    queryKey: ["google-ads-creatives", businessId, dateRange],
    queryFn: () => fetchTab("creatives", businessId, dateRange),
    enabled: enabled && activeTab === "asset-groups",
    staleTime: 60_000,
  });

  const audiencesQ = useQuery({
    queryKey: ["google-ads-audiences", businessId, dateRange],
    queryFn: () => fetchTab("audiences", businessId, dateRange),
    enabled: enabled && activeTab === "audiences",
    staleTime: 60_000,
  });

  const geoQ = useQuery({
    queryKey: ["google-ads-geo", businessId, dateRange],
    queryFn: () => fetchTab("geo", businessId, dateRange),
    enabled: enabled && activeTab === "geo",
    staleTime: 60_000,
  });

  const devicesQ = useQuery({
    queryKey: ["google-ads-devices", businessId, dateRange],
    queryFn: () => fetchTab("devices", businessId, dateRange),
    enabled: enabled && activeTab === "devices",
    staleTime: 60_000,
  });

  const budgetQ = useQuery({
    queryKey: ["google-ads-budget", businessId, dateRange],
    queryFn: () => fetchTab("budget", businessId, dateRange),
    enabled: enabled && activeTab === "budget-scaling",
    staleTime: 60_000,
  });

  const opportunitiesQ = useQuery({
    queryKey: ["google-ads-opportunities", businessId, dateRange],
    queryFn: () => fetchTab("opportunities", businessId, dateRange),
    enabled: enabled && activeTab === "opportunities",
    staleTime: 120_000,
  });

  // For the Search tab, pick the "primary" query for error/meta display
  const searchPrimaryQ = searchTermsQ.isError ? searchTermsQ : keywordsQ.isError ? keywordsQ : searchTermsQ;

  const activeQuery =
    activeTab === "overview"
      ? overviewQ
      : activeTab === "campaigns"
      ? campaignsQ
      : activeTab === "search"
      ? searchPrimaryQ
      : activeTab === "assets"
      ? adsQ
      : activeTab === "asset-groups"
      ? creativesQ
      : activeTab === "audiences"
      ? audiencesQ
      : activeTab === "geo"
      ? geoQ
      : activeTab === "devices"
      ? devicesQ
      : activeTab === "budget-scaling"
      ? budgetQ
      : opportunitiesQ;

  const meta = (activeQuery.data?.meta ?? null) as GoogleAdsMeta | null;
  const failedQueries = (meta?.failed_queries ?? []).map(
    (failure) => `${failure.query} (${failure.customerId}): ${failure.message}`
  );

  // Collect all loaded tab metas for Diagnostics
  const tabMetas = [
    { label: "Overview", meta: overviewQ.data?.meta ?? null },
    { label: "Campaigns", meta: campaignsQ.data?.meta ?? null },
    { label: "Search Terms", meta: searchTermsQ.data?.meta ?? null },
    { label: "Keywords", meta: keywordsQ.data?.meta ?? null },
    { label: "Assets", meta: adsQ.data?.meta ?? null },
    { label: "Asset Groups", meta: creativesQ.data?.meta ?? null },
    { label: "Audiences", meta: audiencesQ.data?.meta ?? null },
    { label: "Geo", meta: geoQ.data?.meta ?? null },
    { label: "Devices", meta: devicesQ.data?.meta ?? null },
    { label: "Budget & Scaling", meta: budgetQ.data?.meta ?? null },
    { label: "Opportunities", meta: opportunitiesQ.data?.meta ?? null },
  ].filter((t) => t.meta !== null) as Array<{ label: string; meta: GoogleAdsMeta }>;

  function wrap(content: ReactNode) {
    if (activeQuery.isError) {
      return (
        <TabEmpty
          message={
            activeQuery.error instanceof Error
              ? activeQuery.error.message
              : "Google Ads data could not be loaded."
          }
        />
      );
    }

    return (
      <div className="space-y-4">
        <TabAlert tone="error" title="Query failure" items={failedQueries} />
        <TabAlert tone="warning" title="Partial data" items={meta?.warnings ?? []} />
        <TabAlert
          tone="info"
          title="Unavailable metrics"
          items={(meta?.unavailable_metrics ?? []).map((metric) =>
            metric.replaceAll("_", " ")
          )}
        />
        {content}
      </div>
    );
  }

  switch (activeTab) {
    case "overview":
      return wrap(
        <OverviewTab
          kpis={overviewQ.data?.kpis}
          insights={overviewQ.data?.insights}
          topCampaigns={overviewQ.data?.topCampaigns}
          isLoading={overviewQ.isLoading}
        />
      );
    case "campaigns":
      return wrap(
        <CampaignsTab
          campaigns={campaignsQ.data?.rows ?? campaignsQ.data?.data}
          isLoading={campaignsQ.isLoading}
          emptyMessage={
            campaignsQ.data?.meta?.warnings?.[0] ?? "No campaign data found for this period."
          }
        />
      );
    case "search":
      return wrap(
        <SearchTab
          terms={searchTermsQ.data?.rows ?? searchTermsQ.data?.data}
          termsSummary={searchTermsQ.data?.summary}
          keywords={keywordsQ.data?.rows ?? keywordsQ.data?.data}
          keywordInsights={keywordsQ.data?.insights}
          isLoadingTerms={searchTermsQ.isLoading}
          isLoadingKeywords={keywordsQ.isLoading}
        />
      );
    case "assets":
      return wrap(
        <AssetsTab
          ads={adsQ.data?.rows ?? adsQ.data?.data}
          insights={adsQ.data?.insights}
          isLoading={adsQ.isLoading}
        />
      );
    case "asset-groups":
      return wrap(
        <AssetGroupsTab
          creatives={creativesQ.data?.rows ?? creativesQ.data?.data}
          insights={creativesQ.data?.insights}
          isLoading={creativesQ.isLoading}
        />
      );
    case "audiences":
      return wrap(
        <AudiencesTab
          audiences={audiencesQ.data?.rows ?? audiencesQ.data?.data}
          insights={audiencesQ.data?.insights}
          summary={audiencesQ.data?.summary}
          isLoading={audiencesQ.isLoading}
        />
      );
    case "geo":
      return wrap(
        <GeoTab
          geoData={geoQ.data?.rows ?? geoQ.data?.data}
          insights={geoQ.data?.insights}
          isLoading={geoQ.isLoading}
        />
      );
    case "devices":
      return wrap(
        <DevicesTab
          devices={devicesQ.data?.rows ?? devicesQ.data?.data}
          insights={devicesQ.data?.insights}
          isLoading={devicesQ.isLoading}
        />
      );
    case "budget-scaling":
      return wrap(
        <BudgetScalingTab
          campaigns={budgetQ.data?.rows ?? budgetQ.data?.data}
          recommendations={budgetQ.data?.recommendations}
          totalSpend={budgetQ.data?.totalSpend}
          accountAvgRoas={budgetQ.data?.accountAvgRoas}
          isLoading={budgetQ.isLoading}
        />
      );
    case "opportunities":
      return wrap(
        <OpportunitiesTab
          opportunities={opportunitiesQ.data?.rows ?? opportunitiesQ.data?.data}
          isLoading={opportunitiesQ.isLoading}
        />
      );
    case "diagnostics":
      return <DiagnosticsTab tabMetas={tabMetas} />;
    default:
      return null;
  }
}
