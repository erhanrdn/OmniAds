"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/store/app-store";
import { useIntegrationsStore } from "@/store/integrations-store";
import { isDemoBusinessSelected } from "@/lib/business-mode";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { IntegrationEmptyState } from "@/components/states/IntegrationEmptyState";
import { TabAlert } from "@/components/google-ads/shared";
import { cn } from "@/lib/utils";

import { OverviewTab } from "@/components/google-ads/OverviewTab";
import { PerformanceTab } from "@/components/google-ads/PerformanceTab";
import { SearchIntelligenceTab } from "@/components/google-ads/SearchIntelligenceTab";
import { CreativeIntelligenceTab } from "@/components/google-ads/CreativeIntelligenceTab";
import { ProductIntelligenceTab } from "@/components/google-ads/ProductIntelligenceTab";
import { AudienceTargetingTab } from "@/components/google-ads/AudienceTargetingTab";
import { BudgetScalingTab } from "@/components/google-ads/BudgetScalingTab";
import { OpportunitiesTab } from "@/components/google-ads/OpportunitiesTab";
import { DiagnosticsTab } from "@/components/google-ads/DiagnosticsTab";

// ── Tab type ───────────────────────────────────────────────────────────

type Tab =
  | "overview"
  | "performance"
  | "search-intelligence"
  | "creative-intelligence"
  | "product-intelligence"
  | "audience-targeting"
  | "budget-scaling"
  | "opportunities"
  | "diagnostics";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "performance", label: "Performance" },
  { id: "search-intelligence", label: "Search" },
  { id: "creative-intelligence", label: "Creative" },
  { id: "product-intelligence", label: "Products" },
  { id: "audience-targeting", label: "Audiences" },
  { id: "budget-scaling", label: "Budget" },
  { id: "opportunities", label: "Opportunities" },
  { id: "diagnostics", label: "Diagnostics" },
];

// ── Fetch helpers ──────────────────────────────────────────────────────

async function fetchTab(businessId: string, endpoint: string) {
  const qs = new URLSearchParams({ businessId }).toString();
  const res = await fetch(`/api/google-ads/${endpoint}?${qs}`);
  if (!res.ok) throw new Error(`Failed to fetch ${endpoint}`);
  return res.json();
}

// ── Meta alert helper ──────────────────────────────────────────────────

type QueryMeta = { warnings?: string[]; failed_queries?: string[] } | undefined;

function MetaAlerts({ meta, prefix }: { meta: QueryMeta; prefix: string }) {
  if (!meta) return null;
  const warnings = meta.warnings ?? [];
  const failed = meta.failed_queries ?? [];
  return (
    <>
      {warnings.length > 0 && (
        <TabAlert tone="warning" title="Data warnings" items={warnings} />
      )}
      {failed.length > 0 && (
        <TabAlert
          tone="error"
          title={`Partial data (${prefix})`}
          items={failed.map((fq) => `${fq} query failed`)}
        />
      )}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────

export default function GoogleAdsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { selectedBusinessId, businesses } = useAppStore();
  const ensureBusiness = useIntegrationsStore((s) => s.ensureBusiness);
  const byBusinessId = useIntegrationsStore((s) => s.byBusinessId);
  const isDemoMode = isDemoBusinessSelected(selectedBusinessId, businesses);

  const bid = selectedBusinessId ?? "";

  useEffect(() => {
    if (bid) ensureBusiness(bid);
  }, [bid, ensureBusiness]);

  const googleStatus = byBusinessId[bid]?.google?.status;
  const googleConnected = googleStatus === "connected";

  const enabled = (googleConnected || isDemoMode) && !!selectedBusinessId;

  // ── Queries ───────────────────────────────────────────────────────────

  const overviewQ = useQuery({
    queryKey: ["gads-overview", bid],
    queryFn: () => fetchTab(bid, "overview"),
    enabled: enabled && activeTab === "overview",
    staleTime: 5 * 60 * 1000,
  });

  const campaignsQ = useQuery({
    queryKey: ["gads-campaigns", bid],
    queryFn: () => fetchTab(bid, "campaigns"),
    enabled: enabled && activeTab === "performance",
    staleTime: 5 * 60 * 1000,
  });

  const searchTermsQ = useQuery({
    queryKey: ["gads-search-terms", bid],
    queryFn: () => fetchTab(bid, "search-terms"),
    enabled: enabled && activeTab === "search-intelligence",
    staleTime: 5 * 60 * 1000,
  });

  const keywordsQ = useQuery({
    queryKey: ["gads-keywords", bid],
    queryFn: () => fetchTab(bid, "keywords"),
    enabled: enabled && activeTab === "search-intelligence",
    staleTime: 5 * 60 * 1000,
  });

  const adsQ = useQuery({
    queryKey: ["gads-ads", bid],
    queryFn: () => fetchTab(bid, "ads"),
    enabled: enabled && activeTab === "creative-intelligence",
    staleTime: 5 * 60 * 1000,
  });

  const creativesQ = useQuery({
    queryKey: ["gads-creatives", bid],
    queryFn: () => fetchTab(bid, "creatives"),
    enabled: enabled && activeTab === "creative-intelligence",
    staleTime: 5 * 60 * 1000,
  });

  const productQ = useQuery({
    queryKey: ["gads-product-intelligence", bid],
    queryFn: () => fetchTab(bid, "product-intelligence"),
    enabled: enabled && activeTab === "product-intelligence",
    staleTime: 5 * 60 * 1000,
  });

  const audiencesQ = useQuery({
    queryKey: ["gads-audiences", bid],
    queryFn: () => fetchTab(bid, "audiences"),
    enabled: enabled && activeTab === "audience-targeting",
    staleTime: 5 * 60 * 1000,
  });

  const geoQ = useQuery({
    queryKey: ["gads-geo", bid],
    queryFn: () => fetchTab(bid, "geo"),
    enabled: enabled && activeTab === "audience-targeting",
    staleTime: 5 * 60 * 1000,
  });

  const devicesQ = useQuery({
    queryKey: ["gads-devices", bid],
    queryFn: () => fetchTab(bid, "devices"),
    enabled: enabled && activeTab === "audience-targeting",
    staleTime: 5 * 60 * 1000,
  });

  const budgetQ = useQuery({
    queryKey: ["gads-budget", bid],
    queryFn: () => fetchTab(bid, "budget"),
    enabled: enabled && activeTab === "budget-scaling",
    staleTime: 5 * 60 * 1000,
  });

  const opportunitiesQ = useQuery({
    queryKey: ["gads-opportunities", bid],
    queryFn: () => fetchTab(bid, "opportunities"),
    enabled: enabled && activeTab === "opportunities",
    staleTime: 5 * 60 * 1000,
  });

  // ── Diagnostics meta aggregation ──────────────────────────────────────

  const allMetas = [
    overviewQ.data?.meta && { label: "Overview", meta: overviewQ.data.meta },
    campaignsQ.data?.meta && { label: "Performance", meta: campaignsQ.data.meta },
    searchTermsQ.data?.meta && { label: "Search Terms", meta: searchTermsQ.data.meta },
    keywordsQ.data?.meta && { label: "Keywords", meta: keywordsQ.data.meta },
    adsQ.data?.meta && { label: "Ads", meta: adsQ.data.meta },
    creativesQ.data?.meta && { label: "Asset Groups", meta: creativesQ.data.meta },
    productQ.data?.meta && { label: "Product Intelligence", meta: productQ.data.meta },
    audiencesQ.data?.meta && { label: "Audiences", meta: audiencesQ.data.meta },
    geoQ.data?.meta && { label: "Geo", meta: geoQ.data.meta },
    devicesQ.data?.meta && { label: "Devices", meta: devicesQ.data.meta },
    budgetQ.data?.meta && { label: "Budget & Scaling", meta: budgetQ.data.meta },
    opportunitiesQ.data?.meta && { label: "Opportunities", meta: opportunitiesQ.data.meta },
  ].filter(Boolean) as { label: string; meta: unknown }[];

  // ── Guards ────────────────────────────────────────────────────────────

  if (!selectedBusinessId) return <BusinessEmptyState />;

  if (!googleConnected && !isDemoMode) {
    return (
      <IntegrationEmptyState
        providerLabel="Google Ads"
        title="Connect Google Ads to unlock insights"
        description="Connect your Google Ads account to see performance analytics, opportunities, and AI-driven recommendations."
      />
    );
  }

  // ── Wrap helper for single-query tabs ─────────────────────────────────

  function wrap(q: ReturnType<typeof useQuery>, content: ReactNode) {
    const data = q.data as Record<string, unknown> | undefined;
    return (
      <>
        <MetaAlerts meta={data?.meta as QueryMeta} prefix="" />
        {content}
      </>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Google Ads</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Decision-ready intelligence across your entire account
        </p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "shrink-0 border-b-2 px-3 pb-2 text-sm font-medium transition-colors",
              activeTab === t.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "overview" &&
          wrap(
            overviewQ,
            <OverviewTab
              kpis={overviewQ.data?.kpis}
              insights={overviewQ.data?.insights}
              topCampaigns={overviewQ.data?.topCampaigns}
              isLoading={overviewQ.isLoading}
            />
          )}

        {activeTab === "performance" &&
          wrap(
            campaignsQ,
            <PerformanceTab
              campaigns={campaignsQ.data?.campaigns}
              isLoading={campaignsQ.isLoading}
            />
          )}

        {activeTab === "search-intelligence" && (
          <>
            <MetaAlerts meta={searchTermsQ.data?.meta as QueryMeta} prefix="Search Terms" />
            <MetaAlerts meta={keywordsQ.data?.meta as QueryMeta} prefix="Keywords" />
            <SearchIntelligenceTab
              terms={searchTermsQ.data?.terms}
              termsSummary={searchTermsQ.data?.summary}
              keywords={keywordsQ.data?.keywords}
              keywordInsights={keywordsQ.data?.insights}
              isLoadingTerms={searchTermsQ.isLoading}
              isLoadingKeywords={keywordsQ.isLoading}
            />
          </>
        )}

        {activeTab === "creative-intelligence" && (
          <>
            <MetaAlerts meta={adsQ.data?.meta as QueryMeta} prefix="Ads" />
            <MetaAlerts meta={creativesQ.data?.meta as QueryMeta} prefix="Asset Groups" />
            <CreativeIntelligenceTab
              ads={adsQ.data?.ads}
              adsInsights={adsQ.data?.insights}
              creatives={creativesQ.data?.creatives}
              creativesInsights={creativesQ.data?.insights}
              isLoadingAds={adsQ.isLoading}
              isLoadingCreatives={creativesQ.isLoading}
            />
          </>
        )}

        {activeTab === "product-intelligence" &&
          wrap(
            productQ,
            <ProductIntelligenceTab
              products={productQ.data?.products}
              totalSpend={productQ.data?.totalSpend}
              isLoading={productQ.isLoading}
              unavailable={productQ.data?.available === false}
              unavailableReason={productQ.data?.unavailableReason}
            />
          )}

        {activeTab === "audience-targeting" && (
          <>
            <MetaAlerts meta={audiencesQ.data?.meta as QueryMeta} prefix="Audiences" />
            <MetaAlerts meta={geoQ.data?.meta as QueryMeta} prefix="Geo" />
            <MetaAlerts meta={devicesQ.data?.meta as QueryMeta} prefix="Devices" />
            <AudienceTargetingTab
              audiences={audiencesQ.data?.audiences}
              audienceInsights={audiencesQ.data?.insights}
              geoData={geoQ.data?.geo}
              geoInsights={geoQ.data?.insights}
              devices={devicesQ.data?.devices}
              deviceInsights={devicesQ.data?.insights}
              isLoadingAudiences={audiencesQ.isLoading}
              isLoadingGeo={geoQ.isLoading}
              isLoadingDevices={devicesQ.isLoading}
            />
          </>
        )}

        {activeTab === "budget-scaling" &&
          wrap(
            budgetQ,
            <BudgetScalingTab
              campaigns={budgetQ.data?.campaigns}
              recommendations={budgetQ.data?.recommendations}
              totalSpend={budgetQ.data?.totalSpend}
              accountAvgRoas={budgetQ.data?.accountAvgRoas}
              isLoading={budgetQ.isLoading}
            />
          )}

        {activeTab === "opportunities" &&
          wrap(
            opportunitiesQ,
            <OpportunitiesTab
              opportunities={opportunitiesQ.data?.opportunities}
              isLoading={opportunitiesQ.isLoading}
            />
          )}

        {activeTab === "diagnostics" && <DiagnosticsTab tabMetas={allMetas} />}
      </div>
    </div>
  );
}
