"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPlatformTable } from "@/src/services";
import {
  getGoogleAssets,
  getGoogleProducts,
  getGoogleRecommendations,
  getGoogleSearchTerms,
  getGoogleShopifyProducts,
} from "@/src/services/google";
import { MetricsRow, Platform, PlatformLevel } from "@/src/types";
import {
  calculateGrowthScore,
  DATE_RANGE,
  DEFAULT_COLUMNS,
  EXTRA_GROWTH_RECOMMENDATIONS,
  reweightRecommendationForScope,
  TAB_TO_LEVEL,
  type DateRange,
  type GrowthRecommendation,
  type InsightsTab,
  type MainTab,
  type OptimizationScope,
  type SortColumn,
  type SortDirection,
  type StatusFilter,
} from "@/app/(dashboard)/platforms/google/google-page-support";

interface UseGooglePageDataParams {
  businessId: string;
  googleConnected: boolean;
  mainTab: MainTab;
  insightsTab: InsightsTab;
  insightsDateRange: DateRange;
  optimizationScope: OptimizationScope;
  selectedCampaign: string;
  selectedAssetGroup: string;
  selectedCountry: string;
  selectedProductCategory: string;
  selectedProductSku: string;
  statusFilter: StatusFilter;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  selectedAccountId: string;
  searchTermQuery: string;
  setSelectedAccountId: (accountId: string) => void;
}

export function useGooglePageData({
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
}: UseGooglePageDataParams) {
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
    queryFn: () =>
      getGoogleRecommendations({
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
    queryFn: () =>
      getGoogleProducts({
        businessId,
        dateRange: insightsDateRange,
        accountId: selectedAccountId === "all" ? undefined : selectedAccountId,
      }),
  });

  const assetsQuery = useQuery({
    queryKey: ["google-assets", businessId, insightsDateRange, selectedAccountId],
    enabled: googleConnected && mainTab === "insights" && insightsTab === "assets",
    queryFn: () =>
      getGoogleAssets({
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
    if (enabledAccounts.length === 0) return;
    if (
      selectedAccountId !== "all" &&
      !enabledAccounts.some((account) => account.accountId === selectedAccountId)
    ) {
      setSelectedAccountId(enabledAccounts[0].accountId);
    }
  }, [enabledAccounts, selectedAccountId, setSelectedAccountId]);

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
  }, [sortColumn, sortDirection, statusFilter, tableQuery.data]);

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

    const base = (recommendationsQuery.data ?? []).map((recommendation) =>
      reweightRecommendationForScope(recommendation, optimizationScope, scopeContext)
    );
    const growthExtras = EXTRA_GROWTH_RECOMMENDATIONS.map((recommendation) =>
      reweightRecommendationForScope(recommendation, optimizationScope, scopeContext)
    );
    return [...base, ...growthExtras];
  }, [
    optimizationScope,
    recommendationsQuery.data,
    selectedAssetGroup,
    selectedCampaign,
    selectedCountry,
    selectedProductCategory,
    selectedProductSku,
  ]);

  const growthEngineRecommendations = useMemo(() => {
    const optimizationIds = new Set(["rec-1", "rec-4", "rec-5"]);
    const growthIds = new Set(["rec-2", "rec-g-product-scale", "rec-g-geo-expand", "rec-g-creative-op"]);
    return scopedRecommendations
      .filter((recommendation) => optimizationIds.has(recommendation.id) || growthIds.has(recommendation.id))
      .map<GrowthRecommendation>((recommendation) => ({
        ...recommendation,
        title:
          recommendation.id === "rec-1"
            ? "Negative keyword waste"
            : recommendation.id === "rec-2"
              ? "Keyword expansion"
              : recommendation.title,
        category: optimizationIds.has(recommendation.id) ? "optimization" : "growth",
      }));
  }, [scopedRecommendations]);

  const growthScore = useMemo(
    () => calculateGrowthScore(growthEngineRecommendations),
    [growthEngineRecommendations]
  );

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

  return {
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
  };
}
