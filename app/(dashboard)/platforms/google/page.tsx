"use client";

import { useEffect, useMemo, useState } from "react";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { useAppStore } from "@/store/app-store";
import { useIntegrationsStore } from "@/store/integrations-store";
import { buildDefaultProviderDomains, deriveProviderViewState } from "@/store/integrations-support";
import { IntegrationEmptyState } from "@/components/states/IntegrationEmptyState";
import {
  GoogleAssetRow,
  GoogleProductRow,
  GoogleSearchTermRow,
  ShopifyProductPerformance,
} from "@/src/services/google";
import { MetricsRow, PlatformTableRow } from "@/src/types";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCurrencySymbol } from "@/hooks/use-currency";
import {
  DATE_RANGE,
  DEFAULT_COLUMNS,
  formatMetricCell,
  RecommendationCard,
  GoogleInsightsDrawer,
  getScopeLabels,
  type DrawerPayload,
  type GrowthRecommendation,
  type InsightsTab,
  type MainTab,
  type MetricColumn,
  type OptimizationScope,
  type SortColumn,
  type SortDirection,
  type StatusFilter,
  TAB_TO_LEVEL,
  type DateRange,
} from "@/app/(dashboard)/platforms/google/google-page-support";
import { useGooglePageData } from "@/app/(dashboard)/platforms/google/google-page-hooks";
import { useBusinessIntegrationsBootstrap } from "@/hooks/use-business-integrations-bootstrap";
import { usePreferencesStore } from "@/store/preferences-store";

export default function GooglePage() {
  const language = usePreferencesStore((state) => state.language);
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businessId = selectedBusinessId ?? "";
  const sym = useCurrencySymbol();

  const domains = useIntegrationsStore((state) =>
    selectedBusinessId ? state.domainsByBusinessId[selectedBusinessId] : undefined
  );
  const { isBootstrapping, bootstrapStatus } = useBusinessIntegrationsBootstrap(
    selectedBusinessId ?? null
  );

  if (!selectedBusinessId) return <BusinessEmptyState />;

  const googleView = deriveProviderViewState(
    "google",
    domains?.google ?? buildDefaultProviderDomains().google
  );
  const googleConnected = googleView.isConnected;
  const showBootstrapGuard =
    isBootstrapping ||
    googleView.status === "loading_data" ||
    (bootstrapStatus !== "ready" && !googleView.isConnected);

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

  const {
    accountQuery,
    tableQuery,
    recommendationsQuery,
    searchTermsQuery,
    productsQuery,
    assetsQuery,
    shopifyProductsQuery,
    enabledAccounts,
    filteredRows,
    growthEngineRecommendations,
    growthScore,
    activeInsightsLoading,
    activeInsightsError,
  } = useGooglePageData({
    businessId,
    googleConnected,
    mainTab,
    insightsTab,
    insightsDateRange,
    optimizationScope,
    selectedCampaign,
    selectedAssetGroup,
    selectedCountry,
    selectedProductCategory,
    selectedProductSku,
    statusFilter,
    sortColumn,
    sortDirection,
    selectedAccountId,
    searchTermQuery,
    setSelectedAccountId,
  });

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = setTimeout(() => setToastMessage(null), 1400);
    return () => clearTimeout(timeout);
  }, [toastMessage]);

  const showComingSoon = () => setToastMessage(language === "tr" ? "Yakinda" : "Coming soon");
  const scopeLabels = getScopeLabels(language);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Google Ads</h1>
        <p className="text-sm text-muted-foreground">
          {language === "tr"
            ? "Search, Display ve Performance Max kampanya verilerini goruntuleyin."
            : "View Search, Display, and Performance Max campaign data."}
        </p>
      </div>

      {toastMessage && (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          {toastMessage}
        </div>
      )}

      {showBootstrapGuard && <LoadingSkeleton rows={4} />}

      {!showBootstrapGuard && !googleConnected && (
        <IntegrationEmptyState
          providerLabel="Google"
          status={googleView.status === "action_required" ? "error" : "disconnected"}
          description={
            language === "tr"
              ? "Google Ads hesabi baglandiktan sonra Search, Display ve Performance Max kampanya verilerini goruntuleyin."
              : "View Search, Display, and Performance Max campaign data once your Google Ads account is connected."
          }
        />
      )}

      {googleConnected && (<>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        {[
          { key: "campaigns", label: language === "tr" ? "Kampanyalar" : "Campaigns" },
          { key: "adGroups", label: language === "tr" ? "Reklam Gruplari" : "Ad Groups" },
          { key: "ads", label: language === "tr" ? "Reklamlar" : "Ads" },
          { key: "insights", label: language === "tr" ? "İçgörüler" : "Insights" },
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
              {language === "tr" ? "Hesap" : "Account"}
            </label>
            <select
              value={selectedAccountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">{language === "tr" ? "Tum etkin hesaplar" : "All enabled accounts"}</option>
              {enabledAccounts.map((account) => (
                <option key={account.accountId} value={account.accountId}>
                  {account.name}
                </option>
              ))}
            </select>

            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {language === "tr" ? "Durum" : "Status"}
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">{language === "tr" ? "Tum" : "All"}</option>
              <option value="active">{language === "tr" ? "Aktif" : "Active"}</option>
              <option value="paused">{language === "tr" ? "Duraklatildi" : "Paused"}</option>
            </select>

            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {language === "tr" ? "Siralama" : "Sort"}
            </label>
            <select
              value={sortColumn}
              onChange={(event) => setSortColumn(event.target.value as SortColumn)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="name">{language === "tr" ? "Ad" : "Name"}</option>
              <option value="status">{language === "tr" ? "Durum" : "Status"}</option>
              <option value="spend">Spend</option>
              <option value="purchases">{language === "tr" ? "Satin alimlar" : "Purchases"}</option>
              <option value="revenue">{language === "tr" ? "Gelir" : "Revenue"}</option>
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
              {sortDirection === "asc"
                ? language === "tr"
                  ? "Artan"
                  : "Asc"
                : language === "tr"
                  ? "Azalan"
                  : "Desc"}
            </Button>
          </div>

          {(tableQuery.isLoading || accountQuery.isLoading) && <LoadingSkeleton rows={3} />}
          {(tableQuery.isError || accountQuery.isError) && (
            <ErrorState onRetry={() => tableQuery.refetch()} />
          )}
          {!tableQuery.isLoading && !tableQuery.isError && filteredRows.length === 0 && (
            <EmptyState
              title={language === "tr" ? "Satir bulunamadi" : "No rows found"}
              description={
                language === "tr"
                  ? "Secilen hesap, seviye veya filtrelerle eslesen satir yok."
                  : "No rows match the selected account, level, or filters."
              }
            />
          )}

          {!tableQuery.isLoading && !tableQuery.isError && filteredRows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/45 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">{language === "tr" ? "Ad" : "Name"}</th>
                    <th className="px-4 py-3 font-medium">{language === "tr" ? "Durum" : "Status"}</th>
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
                          {row.status === "active"
                            ? language === "tr"
                              ? "Aktif"
                              : "active"
                            : row.status === "paused"
                              ? language === "tr"
                                ? "Duraklatildi"
                                : "paused"
                              : row.status}
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
              {language === "tr" ? "Hesap" : "Account"}
            </label>
            <select
              value={selectedAccountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">{language === "tr" ? "Tum etkin hesaplar" : "All enabled accounts"}</option>
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
              <option value="7">{language === "tr" ? "Son 7 gun" : "Last 7 days"}</option>
              <option value="14">{language === "tr" ? "Son 14 gun" : "Last 14 days"}</option>
              <option value="30">{language === "tr" ? "Son 30 gun" : "Last 30 days"}</option>
              <option value="custom">{language === "tr" ? "Özel (yalnızca UI)" : "Custom (UI-only)"}</option>
            </select>

            <select
              value={optimizationScope}
              onChange={(event) =>
                setOptimizationScope(event.target.value as OptimizationScope)
              }
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="account">{scopeLabels.account}</option>
              <option value="campaign">{scopeLabels.campaign}</option>
              <option value="assetGroup">{scopeLabels.assetGroup}</option>
              <option value="country">{scopeLabels.country}</option>
              <option value="productCategory">{scopeLabels.productCategory}</option>
              <option value="productLevel">{scopeLabels.productLevel}</option>
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
              { key: "recommendations", label: language === "tr" ? "Öneriler" : "Recommendations" },
              { key: "searchTerms", label: language === "tr" ? "Search term'ler" : "Search terms" },
              { key: "products", label: language === "tr" ? "Ürünler" : "Products" },
              { key: "assets", label: language === "tr" ? "Asset'ler (PMax)" : "Assets (PMax)" },
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
                      {language === "tr" ? "Buyume Skoru" : "Growth Score"}
                    </p>
                    <p className="mt-1 text-2xl font-semibold">{growthScore.score}/100</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {language === "tr" ? "Potansiyel" : "Upside"}: {growthScore.upsideLevel === "High"
                        ? language === "tr"
                          ? "Yüksek"
                          : "High"
                        : growthScore.upsideLevel === "Medium"
                          ? language === "tr"
                            ? "Orta"
                            : "Medium"
                          : language === "tr"
                            ? "Düşük"
                            : "Low"}
                    </Badge>
                    <Badge variant="outline">{language === "tr" ? "Oncelikli sorunlar" : "Priority issues"}: {growthScore.priorityIssues}</Badge>
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
                  {language === "tr" ? "Optimizasyon Sorunlari" : "Optimization Issues"}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {growthEngineRecommendations
                    .filter((rec) => rec.category === "optimization")
                    .map((rec) => (
                      <RecommendationCard
                        key={rec.id}
                        recommendation={rec}
                        scopeLabel={scopeLabels[optimizationScope]}
                        onOpen={() => setDrawerPayload({ type: "recommendation", data: rec })}
                      />
                    ))}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {language === "tr" ? "Buyume Fırsatlari" : "Growth Opportunities"}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {growthEngineRecommendations
                    .filter((rec) => rec.category === "growth")
                    .map((rec) => (
                      <RecommendationCard
                        key={rec.id}
                        recommendation={rec}
                        scopeLabel={scopeLabels[optimizationScope]}
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
                  placeholder={language === "tr" ? "Search term ara..." : "Search terms..."}
                  className="h-9 min-w-56 rounded-md border bg-background px-3 text-sm"
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={showComingSoon}>
                    {language === "tr" ? "Satir sec" : "Select rows"}
                  </Button>
                  <Button size="sm" onClick={showComingSoon}>
                    {language === "tr" ? "Negative oner" : "Propose negatives"}
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
                  title={language === "tr" ? "Merchant Center feed / Shopping verisi gerekli" : "Requires Merchant Center feed / Shopping data"}
                  description={
                    language === "tr"
                      ? "Ürün seviyesinde performans gormek için Merchant Center bağlayın."
                      : "Connect Merchant Center to view product-level performance."
                  }
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
