"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { useAppStore } from "@/store/app-store";
import { useIntegrationsStore } from "@/store/integrations-store";
import { IntegrationEmptyState } from "@/components/states/IntegrationEmptyState";
import { getPlatformTable } from "@/src/services";
import {
  getGoogleAssets,
  getGoogleProducts,
  getGoogleRecommendations,
  getGoogleSearchTerms,
  getGoogleShopifyProducts,
  GoogleAssetRow,
  GoogleProductRow,
  GoogleRecommendation,
  GoogleSearchTermRow,
  ShopifyProductPerformance,
} from "@/src/services/google";
import { MetricsRow, Platform, PlatformLevel, PlatformTableRow } from "@/src/types";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCurrencySymbol, getCurrencySymbol } from "@/hooks/use-currency";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type MainTab = "campaigns" | "adGroups" | "ads" | "insights";
type InsightsTab = "recommendations" | "searchTerms" | "products" | "assets";
type SortDirection = "asc" | "desc";
type StatusFilter = "all" | "active" | "paused";
type MetricColumn = keyof Pick<
  MetricsRow,
  "spend" | "purchases" | "revenue" | "roas" | "cpa" | "ctr" | "cpm"
>;
type SortColumn = "name" | "status" | MetricColumn;
type DateRange = "7" | "14" | "30" | "custom";
type OptimizationScope =
  | "account"
  | "campaign"
  | "assetGroup"
  | "country"
  | "productCategory"
  | "productLevel";
type RecommendationCategory = "optimization" | "growth";

interface GrowthRecommendation extends GoogleRecommendation {
  category: RecommendationCategory;
}

type DrawerPayload =
  | { type: "recommendation"; data: GrowthRecommendation }
  | { type: "searchTerm"; data: GoogleSearchTermRow }
  | { type: "product"; data: GoogleProductRow }
  | { type: "asset"; data: GoogleAssetRow }
  | null;

const DATE_RANGE = {
  startDate: "2026-02-01",
  endDate: "2026-03-01",
};

const TAB_TO_LEVEL: Record<Exclude<MainTab, "insights">, PlatformLevel> = {
  campaigns: PlatformLevel.CAMPAIGN,
  adGroups: PlatformLevel.AD_SET,
  ads: PlatformLevel.AD,
};

const DEFAULT_COLUMNS: MetricColumn[] = [
  "spend",
  "purchases",
  "revenue",
  "roas",
  "cpa",
  "ctr",
  "cpm",
];

const SCOPE_LABELS: Record<OptimizationScope, string> = {
  account: "Account",
  campaign: "Campaign",
  assetGroup: "Asset group",
  country: "Country",
  productCategory: "Product category",
  productLevel: "Product level",
};

const EXTRA_GROWTH_RECOMMENDATIONS: GoogleRecommendation[] = [
  {
    id: "rec-g-product-scale",
    title: "Product scaling opportunity",
    description: "Identify high-margin SKUs that can absorb incremental budget safely.",
    impact: "High",
    summary: [
      "Three SKUs have strong margin and stable conversion velocity.",
      "Current spend share on these winners is below optimal allocation.",
      "Scaling these SKUs can increase profit with limited efficiency risk.",
    ],
    evidence: [
      { label: "Scale-ready SKUs", value: "3" },
      { label: "Margin benchmark", value: "42%" },
      { label: "Projected profit lift", value: "$1,480" },
    ],
  },
  {
    id: "rec-g-geo-expand",
    title: "Geo expansion opportunity",
    description: "Expand budget into high-ROAS regions with under-served impression share.",
    impact: "Med",
    summary: [
      "Two regions show strong conversion value with constrained spend.",
      "Search demand is growing while CPC remains below account average.",
      "Geo expansion can improve incremental scale without harming efficiency.",
    ],
    evidence: [
      { label: "Candidate regions", value: "2" },
      { label: "Avg regional ROAS", value: "4.06" },
      { label: "Headroom estimate", value: "$3,200" },
    ],
  },
  {
    id: "rec-g-creative-op",
    title: "Creative opportunity",
    description: "Deploy new headline/visual angles in underperforming asset groups.",
    impact: "Med",
    summary: [
      "Current creative set repeats generic claims with weak differentiation.",
      "Top-converting search language is not reflected in ad messaging.",
      "New angle testing can lift CTR and improve downstream conversion rate.",
    ],
    evidence: [
      { label: "Low-performing assets", value: "8" },
      { label: "CTR improvement potential", value: "+0.38%" },
      { label: "Expected ROAS lift", value: "+0.22" },
    ],
  },
];

export default function GooglePage() {
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businessId = selectedBusinessId ?? "";
  const sym = useCurrencySymbol();

  const ensureBusiness = useIntegrationsStore((state) => state.ensureBusiness);
  const byBusinessId = useIntegrationsStore((state) => state.byBusinessId);

  useEffect(() => {
    if (!selectedBusinessId) return;
    ensureBusiness(businessId);
  }, [businessId, ensureBusiness, selectedBusinessId]);

  if (!selectedBusinessId) return <BusinessEmptyState />;

  const googleStatus = byBusinessId[businessId]?.google?.status;
  const googleConnected = googleStatus === "connected";

  const [mainTab, setMainTab] = useState<MainTab>("campaigns");
  const [insightsTab, setInsightsTab] = useState<InsightsTab>("recommendations");
  const [insightsDateRange, setInsightsDateRange] = useState<DateRange>("14");
  const [optimizationScope, setOptimizationScope] = useState<OptimizationScope>("account");
  const [selectedCampaign, setSelectedCampaign] = useState("Non-Brand Search");
  const [selectedAssetGroup, setSelectedAssetGroup] = useState("PMax Prospecting");
  const [selectedCountry, setSelectedCountry] = useState("United States");
  const [selectedProductCategory, setSelectedProductCategory] = useState("Laundry");
  const [selectedProductSku, setSelectedProductSku] = useState("SKU-102");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortColumn, setSortColumn] = useState<SortColumn>("spend");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [searchTermQuery, setSearchTermQuery] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [drawerPayload, setDrawerPayload] = useState<DrawerPayload>(null);

  const accountQuery = useQuery({
    queryKey: ["google-platform-accounts", businessId],
    enabled: googleConnected,
    queryFn: () =>
      getPlatformTable(
        Platform.GOOGLE,
        PlatformLevel.ACCOUNT,
        businessId,
        null,
        DATE_RANGE,
        DEFAULT_COLUMNS
      ),
  });

  const platformLevel = mainTab === "insights" ? PlatformLevel.CAMPAIGN : TAB_TO_LEVEL[mainTab];
  const tableQuery = useQuery({
    queryKey: [
      "google-platform-table",
      businessId,
      platformLevel,
      selectedAccountId,
      statusFilter,
      sortColumn,
      sortDirection,
    ],
    enabled: googleConnected && mainTab !== "insights",
    queryFn: () =>
      getPlatformTable(
        Platform.GOOGLE,
        platformLevel,
        businessId,
        selectedAccountId === "all" ? null : selectedAccountId,
        DATE_RANGE,
        DEFAULT_COLUMNS
      ),
  });

  const recommendationsQuery = useQuery({
    queryKey: ["google-recommendations", businessId, insightsDateRange, selectedAccountId],
    enabled: googleConnected && mainTab === "insights" && insightsTab === "recommendations",
    queryFn: () => getGoogleRecommendations({
      businessId,
      dateRange: insightsDateRange,
      accountId: selectedAccountId === "all" ? undefined : selectedAccountId,
    }),
  });

  const searchTermsQuery = useQuery({
    queryKey: ["google-search-terms", businessId, insightsDateRange, searchTermQuery, selectedAccountId],
    enabled: googleConnected && mainTab === "insights" && insightsTab === "searchTerms",
    queryFn: () =>
      getGoogleSearchTerms({
        businessId,
        dateRange: insightsDateRange,
        search: searchTermQuery,
        accountId: selectedAccountId === "all" ? undefined : selectedAccountId,
      }),
  });

  const productsQuery = useQuery({
    queryKey: ["google-products", businessId, insightsDateRange, selectedAccountId],
    enabled: googleConnected && mainTab === "insights" && insightsTab === "products",
    queryFn: () => getGoogleProducts({
      businessId,
      dateRange: insightsDateRange,
      accountId: selectedAccountId === "all" ? undefined : selectedAccountId,
    }),
  });

  const assetsQuery = useQuery({
    queryKey: ["google-assets", businessId, insightsDateRange, selectedAccountId],
    enabled: googleConnected && mainTab === "insights" && insightsTab === "assets",
    queryFn: () => getGoogleAssets({
      businessId,
      dateRange: insightsDateRange,
      accountId: selectedAccountId === "all" ? undefined : selectedAccountId,
    }),
  });

  const shopifyProductsQuery = useQuery({
    queryKey: ["google-shopify-products", businessId, insightsDateRange],
    enabled: googleConnected && mainTab === "insights",
    queryFn: () => getGoogleShopifyProducts({ businessId, dateRange: insightsDateRange }),
  });

  const enabledAccounts = useMemo(() => {
    const rows = accountQuery.data ?? [];
    const activeRows = rows.filter((row) => row.status === "active");
    return activeRows.length > 0 ? activeRows : rows;
  }, [accountQuery.data]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = setTimeout(() => setToastMessage(null), 1400);
    return () => clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    if (enabledAccounts.length === 0) return;
    if (
      selectedAccountId !== "all" &&
      !enabledAccounts.some((account) => account.accountId === selectedAccountId)
    ) {
      setSelectedAccountId(enabledAccounts[0].accountId);
    }
  }, [enabledAccounts, selectedAccountId]);

  const filteredRows = useMemo(() => {
    const rows = tableQuery.data ?? [];
    const byStatus =
      statusFilter === "all" ? rows : rows.filter((row) => row.status === statusFilter);
    return [...byStatus].sort((a, b) => {
      const multiplier = sortDirection === "asc" ? 1 : -1;
      if (sortColumn === "name" || sortColumn === "status") {
        return a[sortColumn].localeCompare(b[sortColumn]) * multiplier;
      }
      return ((a.metrics[sortColumn] ?? 0) - (b.metrics[sortColumn] ?? 0)) * multiplier;
    });
  }, [tableQuery.data, statusFilter, sortColumn, sortDirection]);

  const scopedRecommendations = useMemo(() => {
    const scopeContext =
      optimizationScope === "campaign"
        ? selectedCampaign
        : optimizationScope === "assetGroup"
          ? `${selectedCampaign} / ${selectedAssetGroup}`
          : optimizationScope === "country"
            ? selectedCountry
            : optimizationScope === "productCategory"
              ? selectedProductCategory
              : optimizationScope === "productLevel"
                ? selectedProductSku
              : "Account";

    const base = (recommendationsQuery.data ?? []).map((rec) =>
      reweightRecommendationForScope(rec, optimizationScope, scopeContext)
    );
    const growthExtras = EXTRA_GROWTH_RECOMMENDATIONS.map((rec) =>
      reweightRecommendationForScope(rec, optimizationScope, scopeContext)
    );
    return [...base, ...growthExtras];
  }, [
    recommendationsQuery.data,
    optimizationScope,
    selectedCampaign,
    selectedAssetGroup,
    selectedCountry,
    selectedProductCategory,
    selectedProductSku,
  ]);

  const growthEngineRecommendations = useMemo(() => {
    const optimizationIds = new Set(["rec-1", "rec-4", "rec-5"]);
    const growthIds = new Set(["rec-2", "rec-g-product-scale", "rec-g-geo-expand", "rec-g-creative-op"]);
    return scopedRecommendations
      .filter((rec) => optimizationIds.has(rec.id) || growthIds.has(rec.id))
      .map<GrowthRecommendation>((rec) => ({
        ...rec,
        title:
          rec.id === "rec-1"
            ? "Negative keyword waste"
            : rec.id === "rec-2"
              ? "Keyword expansion"
              : rec.title,
        category: optimizationIds.has(rec.id) ? "optimization" : "growth",
      }));
  }, [scopedRecommendations]);

  const growthScore = useMemo(
    () => calculateGrowthScore(growthEngineRecommendations),
    [growthEngineRecommendations]
  );

  const showComingSoon = () => setToastMessage("Coming soon");
  const activeInsightsLoading =
    recommendationsQuery.isLoading ||
    searchTermsQuery.isLoading ||
    productsQuery.isLoading ||
    assetsQuery.isLoading ||
    shopifyProductsQuery.isLoading;
  const activeInsightsError =
    recommendationsQuery.isError ||
    searchTermsQuery.isError ||
    productsQuery.isError ||
    assetsQuery.isError ||
    shopifyProductsQuery.isError;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Google Ads</h1>
        <p className="text-sm text-muted-foreground">
          View Search, Display, and Performance Max campaign data.
        </p>
      </div>

      {toastMessage && (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          {toastMessage}
        </div>
      )}

      {googleStatus === "connecting" && <LoadingSkeleton rows={4} />}

      {!googleConnected && googleStatus !== "connecting" && (
        <IntegrationEmptyState
          providerLabel="Google"
          status={googleStatus}
          description="View Search, Display, and Performance Max campaign data once your Google Ads account is connected."
        />
      )}

      {googleConnected && (<>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        {[
          { key: "campaigns", label: "Campaigns" },
          { key: "adGroups", label: "Ad Groups" },
          { key: "ads", label: "Ads" },
          { key: "insights", label: "Insights" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setMainTab(tab.key as MainTab)}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              mainTab === tab.key
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mainTab !== "insights" && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Account
            </label>
            <select
              value={selectedAccountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">All enabled accounts</option>
              {enabledAccounts.map((account) => (
                <option key={account.accountId} value={account.accountId}>
                  {account.name}
                </option>
              ))}
            </select>

            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>

            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sort
            </label>
            <select
              value={sortColumn}
              onChange={(event) => setSortColumn(event.target.value as SortColumn)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="name">Name</option>
              <option value="status">Status</option>
              <option value="spend">Spend</option>
              <option value="purchases">Purchases</option>
              <option value="revenue">Revenue</option>
              <option value="roas">ROAS</option>
              <option value="cpa">CPA</option>
              <option value="ctr">CTR</option>
              <option value="cpm">CPM</option>
            </select>

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
              }
            >
              {sortDirection === "asc" ? "Asc" : "Desc"}
            </Button>
          </div>

          {(tableQuery.isLoading || accountQuery.isLoading) && <LoadingSkeleton rows={3} />}
          {(tableQuery.isError || accountQuery.isError) && (
            <ErrorState onRetry={() => tableQuery.refetch()} />
          )}
          {!tableQuery.isLoading && !tableQuery.isError && filteredRows.length === 0 && (
            <EmptyState
              title="No rows found"
              description="No rows match the selected account, level, or filters."
            />
          )}

          {!tableQuery.isLoading && !tableQuery.isError && filteredRows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/45 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    {DEFAULT_COLUMNS.map((column) => (
                      <th key={column} className="px-4 py-3 font-medium uppercase">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-4 py-3">{row.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant={row.status === "active" ? "default" : "secondary"}>
                          {row.status}
                        </Badge>
                      </td>
                      {DEFAULT_COLUMNS.map((column) => (
                        <td key={column} className="px-4 py-3">
                          {formatMetricCell(column, row, sym)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {mainTab === "insights" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Account
            </label>
            <select
              value={selectedAccountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">All enabled accounts</option>
              {enabledAccounts.map((account) => (
                <option key={account.accountId} value={account.accountId}>
                  {account.name}
                </option>
              ))}
            </select>

            <select
              value={insightsDateRange}
              onChange={(event) => setInsightsDateRange(event.target.value as DateRange)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="7">Last 7 days</option>
              <option value="14">Last 14 days</option>
              <option value="30">Last 30 days</option>
              <option value="custom">Custom (UI-only)</option>
            </select>

            <select
              value={optimizationScope}
              onChange={(event) =>
                setOptimizationScope(event.target.value as OptimizationScope)
              }
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="account">Account</option>
              <option value="campaign">Campaign</option>
              <option value="assetGroup">Asset group</option>
              <option value="country">Country</option>
              <option value="productCategory">Product category</option>
              <option value="productLevel">Product level</option>
            </select>

            {(optimizationScope === "campaign" ||
              optimizationScope === "assetGroup") && (
              <select
                value={selectedCampaign}
                onChange={(event) => setSelectedCampaign(event.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option>Non-Brand Search</option>
                <option>Brand Search</option>
                <option>PMax Prospecting</option>
                <option>PMax Retargeting</option>
              </select>
            )}

            {optimizationScope === "assetGroup" && (
              <select
                value={selectedAssetGroup}
                onChange={(event) => setSelectedAssetGroup(event.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option>PMax Prospecting</option>
                <option>PMax Retargeting</option>
                <option>Seasonal Offers</option>
              </select>
            )}

            {optimizationScope === "country" && (
              <select
                value={selectedCountry}
                onChange={(event) => setSelectedCountry(event.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option>United States</option>
                <option>United Kingdom</option>
                <option>Canada</option>
                <option>Germany</option>
              </select>
            )}

            {optimizationScope === "productCategory" && (
              <select
                value={selectedProductCategory}
                onChange={(event) => setSelectedProductCategory(event.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option>Laundry</option>
                <option>Kitchen Cleaners</option>
                <option>Bathroom Cleaners</option>
                <option>Bundles</option>
              </select>
            )}

            {optimizationScope === "productLevel" && (
              <select
                value={selectedProductSku}
                onChange={(event) => setSelectedProductSku(event.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                {(shopifyProductsQuery.data ?? []).map((product) => (
                  <option key={product.sku} value={product.sku}>
                    {product.sku} - {product.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
            {[
              { key: "recommendations", label: "Recommendations" },
              { key: "searchTerms", label: "Search terms" },
              { key: "products", label: "Products" },
              { key: "assets", label: "Assets (PMax)" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setInsightsTab(tab.key as InsightsTab)}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  insightsTab === tab.key
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeInsightsLoading && <LoadingSkeleton rows={4} />}
          {activeInsightsError && <ErrorState />}

          {insightsTab === "recommendations" && !recommendationsQuery.isLoading && (
            <div className="space-y-4">
              <section className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Growth Score
                    </p>
                    <p className="mt-1 text-2xl font-semibold">{growthScore.score}/100</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">Upside: {growthScore.upsideLevel}</Badge>
                    <Badge variant="outline">Priority issues: {growthScore.priorityIssues}</Badge>
                  </div>
                </div>
                <div className="mt-3 h-2 rounded bg-muted">
                  <div
                    className="h-2 rounded bg-primary"
                    style={{ width: `${growthScore.score}%` }}
                  />
                </div>
              </section>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Optimization Issues
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {growthEngineRecommendations
                    .filter((rec) => rec.category === "optimization")
                    .map((rec) => (
                      <RecommendationCard
                        key={rec.id}
                        recommendation={rec}
                        scopeLabel={SCOPE_LABELS[optimizationScope]}
                        onOpen={() => setDrawerPayload({ type: "recommendation", data: rec })}
                      />
                    ))}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Growth Opportunities
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {growthEngineRecommendations
                    .filter((rec) => rec.category === "growth")
                    .map((rec) => (
                      <RecommendationCard
                        key={rec.id}
                        recommendation={rec}
                        scopeLabel={SCOPE_LABELS[optimizationScope]}
                        onOpen={() => setDrawerPayload({ type: "recommendation", data: rec })}
                      />
                    ))}
                </div>
              </div>
            </div>
          )}

          {insightsTab === "searchTerms" && !searchTermsQuery.isLoading && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <input
                  value={searchTermQuery}
                  onChange={(event) => setSearchTermQuery(event.target.value)}
                  placeholder="Search terms..."
                  className="h-9 min-w-56 rounded-md border bg-background px-3 text-sm"
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={showComingSoon}>
                    Select rows
                  </Button>
                  <Button size="sm" onClick={showComingSoon}>
                    Propose negatives
                  </Button>
                </div>
              </div>
              <div className="max-h-[600px] overflow-auto rounded-xl border">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-background">
                    <tr className="border-b">
                      {[
                        "search_term",
                        "match_type",
                        "campaign",
                        "ad_group",
                        "clicks",
                        "impressions",
                        "cost",
                        "conversions",
                        "conv_value",
                        "roas",
                        "cpa",
                      ].map((head) => (
                        <th key={head} className="px-3 py-2 text-left text-xs font-medium uppercase">
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(searchTermsQuery.data ?? []).map((row) => (
                      <tr
                        key={row.id}
                        className="cursor-pointer border-b last:border-0 hover:bg-muted/25"
                        onClick={() => setDrawerPayload({ type: "searchTerm", data: row })}
                      >
                        <td className="px-3 py-2">{row.search_term}</td>
                        <td className="px-3 py-2">{row.match_type}</td>
                        <td className="px-3 py-2">{row.campaign}</td>
                        <td className="px-3 py-2">{row.ad_group}</td>
                        <td className="px-3 py-2">{row.clicks}</td>
                        <td className="px-3 py-2">{row.impressions}</td>
                        <td className="px-3 py-2">{sym}{row.cost}</td>
                        <td className="px-3 py-2">{row.conversions}</td>
                        <td className="px-3 py-2">{sym}{row.conv_value}</td>
                        <td className="px-3 py-2">{row.roas.toFixed(2)}</td>
                        <td className="px-3 py-2">{sym}{row.cpa.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {insightsTab === "products" && !productsQuery.isLoading && (
            <>
              {(productsQuery.data ?? []).length === 0 ? (
                <EmptyState
                  title="Requires Merchant Center feed / Shopping data"
                  description="Connect Merchant Center to view product-level performance."
                />
              ) : (
                <div className="max-h-[600px] overflow-auto rounded-xl border">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-background">
                      <tr className="border-b">
                        {[
                          "item_id",
                          "title",
                          "brand",
                          "price",
                          "clicks",
                          "cost",
                          "conversions",
                          "conv_value",
                          "roas",
                        ].map((head) => (
                          <th key={head} className="px-3 py-2 text-left text-xs font-medium uppercase">
                            {head}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(productsQuery.data ?? []).map((row) => (
                        <tr
                          key={row.id}
                          className="cursor-pointer border-b last:border-0 hover:bg-muted/25"
                          onClick={() => setDrawerPayload({ type: "product", data: row })}
                        >
                          <td className="px-3 py-2">{row.item_id}</td>
                          <td className="px-3 py-2">{row.title}</td>
                          <td className="px-3 py-2">{row.brand}</td>
                          <td className="px-3 py-2">{sym}{row.price}</td>
                          <td className="px-3 py-2">{row.clicks}</td>
                          <td className="px-3 py-2">{sym}{row.cost}</td>
                          <td className="px-3 py-2">{row.conversions}</td>
                          <td className="px-3 py-2">{sym}{row.conv_value}</td>
                          <td className="px-3 py-2">{row.roas.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {insightsTab === "assets" && !assetsQuery.isLoading && (
            <div className="max-h-[600px] overflow-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="border-b">
                    {[
                      "asset_group",
                      "asset_type",
                      "asset_name",
                      "performance_label",
                      "cost",
                      "conv_value",
                      "roas",
                    ].map((head) => (
                      <th key={head} className="px-3 py-2 text-left text-xs font-medium uppercase">
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(assetsQuery.data ?? []).map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b last:border-0 hover:bg-muted/25"
                      onClick={() => setDrawerPayload({ type: "asset", data: row })}
                    >
                      <td className="px-3 py-2">{row.asset_group}</td>
                      <td className="px-3 py-2 capitalize">{row.asset_type}</td>
                      <td className="px-3 py-2">{row.asset_name}</td>
                      <td className="px-3 py-2">
                        <Badge variant={row.performance_label === "Best" ? "default" : "secondary"}>
                          {row.performance_label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">{sym}{row.cost}</td>
                      <td className="px-3 py-2">{sym}{row.conv_value}</td>
                      <td className="px-3 py-2">{row.roas.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <GoogleInsightsDrawer
        payload={drawerPayload}
        dateRange={insightsDateRange}
        optimizationScope={optimizationScope}
        selectedProductSku={selectedProductSku}
        shopifyProducts={shopifyProductsQuery.data ?? []}
        onClose={() => setDrawerPayload(null)}
        onToast={(message) => setToastMessage(message)}
      />
      </>)}
    </div>
  );
}

function formatMetricCell(column: MetricColumn, row: PlatformTableRow, sym = "$") {
  const value = row.metrics[column];
  if (typeof value !== "number") return "-";
  if (column === "spend" || column === "revenue" || column === "cpa" || column === "cpm") {
    return `${sym}${value.toLocaleString()}`;
  }
  if (column === "roas") return value.toFixed(2);
  if (column === "ctr") return `${value.toFixed(2)}%`;
  return value.toLocaleString();
}

function RecommendationCard({
  recommendation,
  scopeLabel,
  onOpen,
}: {
  recommendation: GrowthRecommendation;
  scopeLabel: string;
  onOpen: () => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{recommendation.title}</h3>
        <Badge
          variant={
            recommendation.impact === "High"
              ? "destructive"
              : recommendation.impact === "Med"
                ? "secondary"
                : "outline"
          }
        >
          {recommendation.impact}
        </Badge>
      </div>
      <Badge variant="outline" className="mt-2">
        Scope: {scopeLabel}
      </Badge>
      <p className="mt-2 text-xs text-muted-foreground">{recommendation.description}</p>
      <Button className="mt-4" variant="outline" size="sm" onClick={onOpen}>
        View details
      </Button>
    </div>
  );
}

function calculateGrowthScore(recommendations: GrowthRecommendation[]) {
  const impactPoints = recommendations.reduce((sum, rec) => {
    if (rec.impact === "High") return sum + 14;
    if (rec.impact === "Med") return sum + 9;
    return sum + 5;
  }, 0);
  const optimizationPenalty = recommendations.filter(
    (rec) => rec.category === "optimization"
  ).length;
  const score = Math.max(35, Math.min(96, 100 - optimizationPenalty * 9 + impactPoints / 6));
  const upsideLevel = score >= 75 ? "High" : score >= 55 ? "Medium" : "Low";
  return {
    score: Math.round(score),
    upsideLevel,
    priorityIssues: optimizationPenalty,
  };
}

function GoogleInsightsDrawer({
  payload,
  dateRange,
  optimizationScope,
  selectedProductSku,
  shopifyProducts,
  onClose,
  onToast,
}: {
  payload: DrawerPayload;
  dateRange: DateRange;
  optimizationScope: OptimizationScope;
  selectedProductSku: string;
  shopifyProducts: ShopifyProductPerformance[];
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const sym = useCurrencySymbol();
  return (
    <Sheet open={Boolean(payload)} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        {payload && (
          <>
            <SheetHeader>
              <SheetTitle>
                {payload.type === "recommendation"
                  ? payload.data.title
                  : payload.type === "searchTerm"
                    ? "Term analysis"
                    : payload.type === "product"
                      ? "Product efficiency analysis"
                      : "Asset improvement suggestions"}
              </SheetTitle>
              <SheetDescription>Date range: last {dateRange} days</SheetDescription>
            </SheetHeader>

            <div className="space-y-4 overflow-y-auto px-4 pb-6">
              {payload.type === "recommendation" && (
                <RecommendationDrawerContent
                  recommendation={payload.data}
                  optimizationScope={optimizationScope}
                  selectedProductSku={selectedProductSku}
                  shopifyProducts={shopifyProducts}
                  onToast={onToast}
                />
              )}

              {payload.type === "searchTerm" && (
                <section className="rounded-xl border p-4 text-sm">
                  <h3 className="font-semibold">{payload.data.search_term}</h3>
                  <p className="mt-2 text-muted-foreground">
                    {payload.data.roas < 1.2
                      ? "Low return and high CPA suggest this term should be added as negative."
                      : "Strong return profile suggests this term should be promoted as exact/phrase."}
                  </p>
                  <ul className="mt-3 space-y-1">
                    <li>- Match type: {payload.data.match_type}</li>
                    <li>- ROAS: {payload.data.roas.toFixed(2)}</li>
                    <li>- CPA: {sym}{payload.data.cpa.toFixed(2)}</li>
                  </ul>
                </section>
              )}

              {payload.type === "product" && (
                <section className="rounded-xl border p-4 text-sm">
                  <h3 className="font-semibold">{payload.data.title}</h3>
                  <p className="mt-2 text-muted-foreground">
                    {payload.data.roas < 1.5
                      ? "This product is likely leaking budget. Consider bid down or temporary exclusion."
                      : "This product is efficient. Consider scaling with dedicated asset coverage."}
                  </p>
                  <ul className="mt-3 space-y-1">
                    <li>- Brand: {payload.data.brand}</li>
                    <li>- ROAS: {payload.data.roas.toFixed(2)}</li>
                    <li>- Cost: {sym}{payload.data.cost.toLocaleString()}</li>
                    <li>- Conversion value: {sym}{payload.data.conv_value.toLocaleString()}</li>
                  </ul>
                </section>
              )}

              {payload.type === "asset" && (
                <section className="rounded-xl border p-4 text-sm">
                  <h3 className="font-semibold">{payload.data.asset_name}</h3>
                  <p className="mt-2 text-muted-foreground">
                    {payload.data.performance_label === "Low"
                      ? "Refresh this asset with sharper value proposition and clearer visual hierarchy."
                      : "Keep this asset in rotation and test close variants to prevent fatigue."}
                  </p>
                  <ul className="mt-3 space-y-1">
                    <li>- Asset group: {payload.data.asset_group}</li>
                    <li>- Type: {payload.data.asset_type}</li>
                    <li>- Performance: {payload.data.performance_label}</li>
                    <li>- ROAS: {payload.data.roas.toFixed(2)}</li>
                  </ul>
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function RecommendationDrawerContent({
  recommendation,
  optimizationScope,
  selectedProductSku,
  shopifyProducts,
  onToast,
}: {
  recommendation: GoogleRecommendation;
  optimizationScope: OptimizationScope;
  selectedProductSku: string;
  shopifyProducts: ShopifyProductPerformance[];
  onToast: (message: string) => void;
}) {
  if (recommendation.id === "rec-1") {
    return <NegativeKeywordDrawer recommendation={recommendation} onToast={onToast} />;
  }

  if (recommendation.id === "rec-3" || recommendation.id === "rec-2") {
    return <SearchThemeDrawer recommendation={recommendation} onToast={onToast} />;
  }

  if (recommendation.id === "rec-5") {
    return (
      <ProductWasteDrawer
        recommendation={recommendation}
        optimizationScope={optimizationScope}
        selectedProductSku={selectedProductSku}
        shopifyProducts={shopifyProducts}
      />
    );
  }

  if (recommendation.id.startsWith("rec-g-")) {
    return <GrowthOpportunityDrawer recommendation={recommendation} />;
  }

  return <AssetImprovementDrawer recommendation={recommendation} />;
}

function NegativeKeywordDrawer({
  recommendation,
  onToast,
}: {
  recommendation: GoogleRecommendation;
  onToast: (message: string) => void;
}) {
  const negativePack = getNegativeKeywordPack(recommendation.title);
  return (
    <>
      <SectionSummary summary={recommendation.summary} />
      <SectionEvidence evidence={recommendation.evidence} />
      <SectionSimulation recommendation={recommendation} />
      <SectionSuggestedActions
        actions={[
          "Review candidates by campaign intent",
          "Apply list in shared negative keyword set",
          "Monitor conversion rate and query mix for 7 days",
        ]}
      />
      <SectionReadyToCopy
        title="Ready to copy"
        subtitle={`Campaign type: ${negativePack.campaignType}`}
        lines={negativePack.keywords}
        onToast={onToast}
      />
      <DrawerDisclaimer />
    </>
  );
}

function SearchThemeDrawer({
  recommendation,
  onToast,
}: {
  recommendation: GoogleRecommendation;
  onToast: (message: string) => void;
}) {
  const themeClusters = [
    "Eco detergent alternatives",
    "Sensitive skin laundry",
    "Plastic-free cleaning products",
    "Bulk subscription savings",
  ];
  return (
    <>
      <SectionSummary summary={recommendation.summary} />
      <SectionEvidence evidence={recommendation.evidence} />
      <section className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">Root Cause</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Existing PMax search themes are broad and miss high-intent cluster coverage.
        </p>
      </section>
      <section className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">Theme clusters</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {themeClusters.map((cluster) => (
            <li key={cluster}>- {cluster}</li>
          ))}
        </ul>
      </section>
      <SectionSimulation recommendation={recommendation} />
      <SectionSuggestedActions
        actions={[
          "Create new search themes from top clusters",
          "Map one theme per asset group",
          "Align headlines with cluster intent language",
        ]}
      />
      <SectionReadyToCopy
        title="Ready to copy"
        subtitle="Theme list"
        lines={themeClusters}
        onToast={onToast}
      />
      <DrawerDisclaimer />
    </>
  );
}

function ProductWasteDrawer({
  recommendation,
  optimizationScope,
  selectedProductSku,
  shopifyProducts,
}: {
  recommendation: GoogleRecommendation;
  optimizationScope: OptimizationScope;
  selectedProductSku: string;
  shopifyProducts: ShopifyProductPerformance[];
}) {
  const sym = useCurrencySymbol();
  const selectedProduct =
    shopifyProducts.find((product) => product.sku === selectedProductSku) ?? shopifyProducts[0];
  const scopeRows =
    optimizationScope === "productLevel" && selectedProduct
      ? [selectedProduct]
      : shopifyProducts.filter((row) => row.revenue < row.adSpend * 1.2);
  const metrics = calculateProductWasteMetrics(scopeRows);
  const simulation = generateProductWasteSimulation(metrics);
  return (
    <>
      <SectionSummary summary={recommendation.summary} />
      <section className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">Evidence</h3>
        <table className="mt-2 min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2">SKU</th>
              <th className="py-2">Spend</th>
              <th className="py-2">Revenue</th>
              <th className="py-2">Margin</th>
              <th className="py-2">Profit</th>
              <th className="py-2">Profit ROAS</th>
            </tr>
          </thead>
          <tbody>
            {scopeRows.map((row) => {
              const margin = row.revenue - row.cogs - row.refunds;
              const profit = margin - row.adSpend;
              const profitRoas = profit / Math.max(row.adSpend, 1);
              return (
                <tr key={row.sku} className="border-b last:border-0">
                  <td className="py-2">{row.sku}</td>
                  <td className="py-2">{sym}{row.adSpend.toLocaleString()}</td>
                  <td className="py-2">{sym}{row.revenue.toLocaleString()}</td>
                  <td className="py-2">{sym}{margin.toLocaleString()}</td>
                  <td className="py-2">{sym}{profit.toLocaleString()}</td>
                  <td className="py-2">{profitRoas.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">Root Cause</h3>
        <ul className="mt-2 space-y-1 text-sm">
          <li>- Shopify margin data indicates weak gross margin after COGS and refunds.</li>
          <li>- Low-margin SKUs absorb paid traffic without sufficient unit economics.</li>
          <li>- Current bid strategy over-indexes on low-profit query/product mixes.</li>
        </ul>
      </section>
      <section className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">Simulation</h3>
        <table className="mt-2 min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2">Metric</th>
              <th className="py-2">Current</th>
              <th className="py-2">Simulated</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-2">Profit</td>
              <td className="py-2">{sym}{simulation.currentProfit.toLocaleString()}</td>
              <td className="py-2">{sym}{simulation.simulatedProfit.toLocaleString()}</td>
            </tr>
            <tr>
              <td className="py-2">Profit ROAS</td>
              <td className="py-2">{simulation.currentProfitRoas.toFixed(2)}</td>
              <td className="py-2">{simulation.simulatedProfitRoas.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
        <div className="mt-3">
          <Badge variant="default">
            Profit ROAS +{simulation.profitRoasImprovement.toFixed(2)}
          </Badge>
        </div>
      </section>
      <SectionSuggestedActions
        actions={[
          "Reduce bids",
          "Exclude SKU",
          "Increase bids on high margin products",
        ]}
      />
      <DrawerDisclaimer />
    </>
  );
}

function AssetImprovementDrawer({ recommendation }: { recommendation: GoogleRecommendation }) {
  const lowAssets = [
    { name: "UGC Demo Cut v2", type: "video", roas: 1.11 },
    { name: "Headline - Best Soap Ever", type: "text", roas: 1.24 },
    { name: "Image - Plain Product Shot", type: "image", roas: 1.38 },
  ];
  return (
    <>
      <SectionSummary summary={recommendation.summary} />
      <section className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">Evidence</h3>
        <table className="mt-2 min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2">Asset</th>
              <th className="py-2">Type</th>
              <th className="py-2">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {lowAssets.map((asset) => (
              <tr key={asset.name} className="border-b last:border-0">
                <td className="py-2">{asset.name}</td>
                <td className="py-2 capitalize">{asset.type}</td>
                <td className="py-2">{asset.roas.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">Root Cause</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Repeated generic messaging and low-contrast imagery reduce engagement in
          prospecting traffic.
        </p>
      </section>
      <SectionSimulation recommendation={recommendation} />
      <section className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">Suggested Actions</h3>
        <ul className="mt-2 space-y-1 text-sm">
          <li>- Test headline variant: "Zero Plastic Laundry in 1 Sheet"</li>
          <li>- Replace static packshots with in-use lifestyle context</li>
          <li>- Add offer-forward description for first 90 characters</li>
        </ul>
      </section>
      <DrawerDisclaimer />
    </>
  );
}

function GrowthOpportunityDrawer({
  recommendation,
}: {
  recommendation: GoogleRecommendation;
}) {
  return (
    <>
      <SectionSummary summary={recommendation.summary} />
      <SectionEvidence evidence={recommendation.evidence} />
      <section className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">Root Cause</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Current allocation under-weights this growth vector relative to conversion quality and
          incremental demand potential.
        </p>
      </section>
      <SectionSimulation recommendation={recommendation} />
      <SectionSuggestedActions
        actions={[
          "Reallocate 10-15% budget toward this opportunity",
          "Track incremental conversion value by cohort",
          "Promote winning entities into dedicated campaigns",
        ]}
      />
      <DrawerDisclaimer />
    </>
  );
}

function SectionSummary({ summary }: { summary: string[] }) {
  return (
    <section className="rounded-xl border p-4">
      <h3 className="text-sm font-semibold">AI Summary</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {summary.map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </section>
  );
}

function SectionEvidence({
  evidence,
}: {
  evidence: Array<{ label: string; value: string }>;
}) {
  return (
    <section className="rounded-xl border p-4">
      <h3 className="text-sm font-semibold">Evidence</h3>
      <table className="mt-2 min-w-full text-sm">
        <tbody>
          {evidence.map((row) => (
            <tr key={row.label} className="border-b last:border-0">
              <td className="py-2 text-muted-foreground">{row.label}</td>
              <td className="py-2 text-right">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SectionSimulation({ recommendation }: { recommendation: GoogleRecommendation }) {
  const sym = useCurrencySymbol();
  const simulation = generateSimulationImpact(recommendation);
  return (
    <section className="rounded-xl border p-4">
      <h3 className="text-sm font-semibold">Simulation</h3>
      <table className="mt-2 min-w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2">Metric</th>
            <th className="py-2">Current</th>
            <th className="py-2">Simulated</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-2">Spend</td>
            <td className="py-2">{sym}{simulation.current.spend.toLocaleString()}</td>
            <td className="py-2">{sym}{simulation.simulated.spend.toLocaleString()}</td>
          </tr>
          <tr className="border-b">
            <td className="py-2">Revenue</td>
            <td className="py-2">{sym}{simulation.current.revenue.toLocaleString()}</td>
            <td className="py-2">{sym}{simulation.simulated.revenue.toLocaleString()}</td>
          </tr>
          <tr>
            <td className="py-2">ROAS</td>
            <td className="py-2">{simulation.current.roas.toFixed(2)}</td>
            <td className="py-2">{simulation.simulated.roas.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant="default">ROAS +{simulation.impact.roasLift.toFixed(2)}</Badge>
        <Badge variant="secondary">
          Efficiency +{simulation.impact.efficiencyPct.toFixed(1)}%
        </Badge>
        <Badge variant="outline">
          Waste removed ${simulation.impact.wasteRemoved.toLocaleString()}
        </Badge>
      </div>
      <div className="mt-3 inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs">
        <span className="text-muted-foreground">Prediction confidence</span>
        <Badge
          variant={
            simulation.confidence === "High"
              ? "default"
              : simulation.confidence === "Medium"
                ? "secondary"
                : "outline"
          }
        >
          {simulation.confidence}
        </Badge>
      </div>
    </section>
  );
}

function SectionSuggestedActions({ actions }: { actions: string[] }) {
  return (
    <section className="rounded-xl border p-4">
      <h3 className="text-sm font-semibold">Suggested Actions</h3>
      <ul className="mt-2 space-y-1 text-sm">
        {actions.map((action) => (
          <li key={action}>- {action}</li>
        ))}
      </ul>
    </section>
  );
}

function SectionReadyToCopy({
  title,
  subtitle,
  lines,
  onToast,
}: {
  title: string;
  subtitle?: string;
  lines: string[];
  onToast: (message: string) => void;
}) {
  return (
    <section className="rounded-xl border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      <pre className="mt-3 overflow-auto rounded-md border bg-muted/20 p-3 text-xs">
{lines.join("\n")}
      </pre>
      <Button
        size="sm"
        className="mt-3"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(lines.join("\n"));
            onToast("List copied");
          } catch {
            onToast("Could not copy list");
          }
        }}
      >
        Copy list
      </Button>
    </section>
  );
}

function DrawerDisclaimer() {
  return (
    <p className="px-1 text-xs text-muted-foreground">
      Recommendations are not applied automatically. Review and apply them inside
      Google Ads.
    </p>
  );
}

function reweightRecommendationForScope(
  recommendation: GoogleRecommendation,
  scope: OptimizationScope,
  context: string
): GoogleRecommendation {
  const multipliers: Record<OptimizationScope, number> = {
    account: 1,
    campaign: 0.92,
    assetGroup: 0.86,
    country: 0.95,
    productCategory: 0.9,
    productLevel: 0.88,
  };

  const multiplier = multipliers[scope];
  const evidence = recommendation.evidence.map((row) => ({
    ...row,
    value: scaleEvidenceValue(row.value, multiplier),
  }));

  return {
    ...recommendation,
    description: `${recommendation.description} Scope: ${context}.`,
    evidence,
  };
}

function scaleEvidenceValue(value: string, multiplier: number) {
  const money = value.match(/^[^\d]*([\d,.]+)$/);
  if (money) {
    const sym = getCurrencySymbol();
    const amount = Number(money[1].replace(/,/g, ""));
    return `${sym}${Math.round(amount * multiplier).toLocaleString()}`;
  }

  const percent = value.match(/^([+-]?[\d.]+)%$/);
  if (percent) {
    return `${(Number(percent[1]) * multiplier).toFixed(1)}%`;
  }

  const numeric = value.match(/^[\d.]+$/);
  if (numeric) {
    const scaled = Number(numeric[0]) * multiplier;
    return Number.isInteger(Number(numeric[0]))
      ? String(Math.round(scaled))
      : scaled.toFixed(2);
  }

  return value;
}

function getNegativeKeywordPack(recommendationTitle: string): {
  campaignType: "Search" | "PMAX" | "Shopping";
  keywords: string[];
} {
  const normalized = recommendationTitle.toLowerCase();

  if (normalized.includes("pmax")) {
    return {
      campaignType: "PMAX",
      keywords: [
        "free",
        "cheap",
        "manual",
        "download",
        "template",
        '"free trial"',
        '"cheap alternative"',
        "[brand manual]",
        "[cheap product]",
        '"how to use"',
      ],
    };
  }

  if (normalized.includes("product")) {
    return {
      campaignType: "Shopping",
      keywords: [
        "free",
        "cheap",
        "manual",
        "download",
        "template",
        '"free trial"',
        '"cheap alternative"',
        "[brand manual]",
        "[cheap product]",
        '"used"',
      ],
    };
  }

  return {
    campaignType: "Search",
    keywords: [
      "free",
      "cheap",
      "manual",
      "download",
      "template",
      '"free trial"',
      '"cheap alternative"',
      "[brand manual]",
      "[cheap product]",
    ],
  };
}

function generateSimulationImpact(_: GoogleRecommendation): {
  current: { spend: number; revenue: number; roas: number };
  simulated: { spend: number; revenue: number; roas: number };
  impact: { roasLift: number; efficiencyPct: number; wasteRemoved: number };
  confidence: "Low" | "Medium" | "High";
} {
  const currentSpend = 10000;
  const simulatedSpend = 8760;
  const currentRevenue = 32000;
  const simulatedRevenue = 32000;
  const currentRoas = currentRevenue / currentSpend;
  const simulatedRoas = simulatedRevenue / simulatedSpend;

  return {
    current: {
      spend: currentSpend,
      revenue: currentRevenue,
      roas: Number(currentRoas.toFixed(2)),
    },
    simulated: {
      spend: simulatedSpend,
      revenue: simulatedRevenue,
      roas: Number(simulatedRoas.toFixed(2)),
    },
    impact: {
      roasLift: Number((simulatedRoas - currentRoas).toFixed(2)),
      efficiencyPct: Number((((currentSpend - simulatedSpend) / currentSpend) * 100).toFixed(1)),
      wasteRemoved: currentSpend - simulatedSpend,
    },
    confidence: "Medium",
  };
}

function calculateProductWasteMetrics(rows: ShopifyProductPerformance[]) {
  const spend = rows.reduce((sum, row) => sum + row.adSpend, 0);
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const margin = rows.reduce((sum, row) => sum + (row.revenue - row.cogs - row.refunds), 0);
  const profit = margin - spend;
  const profitRoas = profit / Math.max(spend, 1);
  return { spend, revenue, margin, profit, profitRoas };
}

function generateProductWasteSimulation(current: {
  spend: number;
  revenue: number;
  margin: number;
  profit: number;
  profitRoas: number;
}) {
  const simulatedSpend = current.spend * 0.86;
  const simulatedRevenue = current.revenue * 0.98;
  const simulatedMargin = current.margin * 0.97;
  const simulatedProfit = simulatedMargin - simulatedSpend;
  const simulatedProfitRoas = simulatedProfit / Math.max(simulatedSpend, 1);

  return {
    currentProfit: Math.round(current.profit),
    simulatedProfit: Math.round(simulatedProfit),
    currentProfitRoas: Number(current.profitRoas.toFixed(2)),
    simulatedProfitRoas: Number(simulatedProfitRoas.toFixed(2)),
    profitRoasImprovement: Number((simulatedProfitRoas - current.profitRoas).toFixed(2)),
  };
}
