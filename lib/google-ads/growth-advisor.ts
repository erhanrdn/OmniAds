import type {
  AssetGroupPerformanceRow,
  AssetPerformanceRow,
  CampaignPerformanceRow,
  DevicePerformanceRow,
  GeoPerformanceRow,
  ProductPerformanceRow,
  SearchTermPerformanceRow,
} from "@/lib/google-ads/intelligence-model";
import type {
  GoogleAdvisorResponse,
  GoogleCampaignFamily,
  GoogleCampaignRoleRow,
  GoogleContributionImpact,
  GoogleDemandRole,
  GooglePotentialContribution,
  GoogleRecommendation,
  GoogleRecommendationEvidence,
  GoogleRecommendationSection,
} from "@/lib/google-ads/growth-advisor-types";

interface WindowInput {
  key: "last3" | "last7" | "last14" | "last30" | "last90" | "all_history";
  label: string;
  campaigns: CampaignPerformanceRow[];
  searchTerms: SearchTermPerformanceRow[];
  products: ProductPerformanceRow[];
}

interface BuildGoogleGrowthAdvisorInput {
  selectedLabel: string;
  selectedCampaigns: CampaignPerformanceRow[];
  selectedSearchTerms: SearchTermPerformanceRow[];
  selectedProducts: ProductPerformanceRow[];
  selectedAssets: AssetPerformanceRow[];
  selectedAssetGroups: AssetGroupPerformanceRow[];
  selectedGeos: GeoPerformanceRow[];
  selectedDevices: DevicePerformanceRow[];
  windows: WindowInput[];
}

interface MetricAggregate {
  spend: number;
  revenue: number;
  conversions: number;
  clicks: number;
  impressions: number;
  roas: number;
  cpa: number;
}

interface FamilySummary {
  family: GoogleCampaignFamily;
  familyLabel: string;
  campaigns: CampaignPerformanceRow[];
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
  cpa: number;
  spendShare: number;
  revenueShare: number;
}

const WINDOW_WEIGHTS: Array<{ key: WindowInput["key"]; weight: number }> = [
  { key: "last3", weight: 0.26 },
  { key: "last7", weight: 0.22 },
  { key: "last14", weight: 0.18 },
  { key: "last30", weight: 0.16 },
  { key: "last90", weight: 0.12 },
  { key: "all_history", weight: 0.06 },
];

const SEARCH_TOKEN_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "your",
  "best",
  "shop",
  "store",
  "official",
  "site",
  "buy",
  "online",
]);

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function sumMetrics<T>(rows: T[], get: (row: T) => MetricAggregate): MetricAggregate {
  return rows.reduce<MetricAggregate>(
    (acc, row) => {
      const metrics = get(row);
      acc.spend += metrics.spend;
      acc.revenue += metrics.revenue;
      acc.conversions += metrics.conversions;
      acc.clicks += metrics.clicks;
      acc.impressions += metrics.impressions;
      return acc;
    },
    {
      spend: 0,
      revenue: 0,
      conversions: 0,
      clicks: 0,
      impressions: 0,
      roas: 0,
      cpa: 0,
    }
  );
}

function finalizeMetrics(metrics: MetricAggregate): MetricAggregate {
  return {
    ...metrics,
    roas: metrics.spend > 0 ? round(metrics.revenue / metrics.spend) : 0,
    cpa: metrics.conversions > 0 ? round(metrics.spend / metrics.conversions) : 0,
  };
}

function aggregateCampaignRows(rows: CampaignPerformanceRow[]): MetricAggregate {
  return finalizeMetrics(
    sumMetrics(rows, (row) => ({
      spend: Number(row.spend ?? 0),
      revenue: Number(row.revenue ?? 0),
      conversions: Number(row.conversions ?? 0),
      clicks: Number(row.clicks ?? 0),
      impressions: Number(row.impressions ?? 0),
      roas: 0,
      cpa: 0,
    }))
  );
}

function labelForFamily(family: GoogleCampaignFamily) {
  switch (family) {
    case "brand_search":
      return "Brand Search";
    case "non_brand_search":
      return "Non-Brand Search";
    case "shopping":
      return "Shopping";
    case "pmax_scaling":
      return "PMax";
    case "remarketing":
      return "Remarketing";
    default:
      return "Support";
  }
}

function classifyCampaignFamily(campaign: CampaignPerformanceRow): GoogleCampaignFamily {
  const name = String(campaign.campaignName ?? "").toLowerCase();
  const channel = String(campaign.channel ?? "").toLowerCase();
  if (channel.includes("performance_max")) return "pmax_scaling";
  if (channel.includes("shopping")) return "shopping";
  if (name.includes("remarketing") || name.includes("retarget") || name.includes("rmkt")) {
    return "remarketing";
  }
  if (channel.includes("search")) {
    if (name.includes("brand") || name.includes("branded")) return "brand_search";
    return "non_brand_search";
  }
  return "supporting";
}

function roleForFamily(
  family: GoogleCampaignFamily,
  familySummary?: FamilySummary
): GoogleDemandRole {
  if (family === "brand_search" || family === "remarketing" || family === "supporting") {
    return "Support";
  }
  if (!familySummary) {
    return family === "pmax_scaling" ? "Scaling" : "Validation";
  }
  if (familySummary.conversions >= 20 && familySummary.roas >= 2) {
    return "Scaling";
  }
  if (familySummary.conversions >= 6 || familySummary.spend >= 300) {
    return "Validation";
  }
  return "Test";
}

function buildFamilySummaries(campaigns: CampaignPerformanceRow[]): FamilySummary[] {
  const totals = aggregateCampaignRows(campaigns);
  const byFamily = new Map<GoogleCampaignFamily, CampaignPerformanceRow[]>();
  for (const campaign of campaigns) {
    const family = classifyCampaignFamily(campaign);
    const current = byFamily.get(family) ?? [];
    current.push(campaign);
    byFamily.set(family, current);
  }

  return Array.from(byFamily.entries()).map(([family, rows]) => {
    const aggregate = aggregateCampaignRows(rows);
    return {
      family,
      familyLabel: labelForFamily(family),
      campaigns: rows,
      spend: aggregate.spend,
      revenue: aggregate.revenue,
      conversions: aggregate.conversions,
      roas: aggregate.roas,
      cpa: aggregate.cpa,
      spendShare: totals.spend > 0 ? round((aggregate.spend / totals.spend) * 100, 1) : 0,
      revenueShare:
        totals.revenue > 0 ? round((aggregate.revenue / totals.revenue) * 100, 1) : 0,
    };
  });
}

function buildCoreFamilyMetrics(
  windows: WindowInput[],
  family: GoogleCampaignFamily
): MetricAggregate {
  let spend = 0;
  let revenue = 0;
  let conversions = 0;
  let clicks = 0;
  let impressions = 0;
  let usedWeights = 0;

  for (const { key, weight } of WINDOW_WEIGHTS) {
    const window = windows.find((entry) => entry.key === key);
    if (!window) continue;
    const aggregate = aggregateCampaignRows(
      window.campaigns.filter((campaign) => classifyCampaignFamily(campaign) === family)
    );
    if (aggregate.spend <= 0 && aggregate.revenue <= 0 && aggregate.conversions <= 0) continue;
    spend += aggregate.spend * weight;
    revenue += aggregate.revenue * weight;
    conversions += aggregate.conversions * weight;
    clicks += aggregate.clicks * weight;
    impressions += aggregate.impressions * weight;
    usedWeights += weight;
  }

  if (usedWeights <= 0) {
    return finalizeMetrics({
      spend: 0,
      revenue: 0,
      conversions: 0,
      clicks: 0,
      impressions: 0,
      roas: 0,
      cpa: 0,
    });
  }

  return finalizeMetrics({
    spend: spend / usedWeights,
    revenue: revenue / usedWeights,
    conversions: conversions / usedWeights,
    clicks: clicks / usedWeights,
    impressions: impressions / usedWeights,
    roas: 0,
    cpa: 0,
  });
}

function brandTokensFromAccount(
  campaigns: CampaignPerformanceRow[],
  searchTerms: SearchTermPerformanceRow[]
) {
  const tokens = new Set<string>();
  for (const campaign of campaigns) {
    if (classifyCampaignFamily(campaign) !== "brand_search") continue;
    for (const token of String(campaign.campaignName ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length >= 3 && !SEARCH_TOKEN_STOPWORDS.has(part))) {
      tokens.add(token);
    }
  }
  for (const row of searchTerms) {
    if (!String(row.campaignName ?? "").toLowerCase().includes("brand")) continue;
    for (const token of String(row.searchTerm ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length >= 3 && !SEARCH_TOKEN_STOPWORDS.has(part))) {
      tokens.add(token);
    }
  }
  return tokens;
}

function isBrandLikeQuery(query: string, brandTokens: Set<string>) {
  const lowered = query.toLowerCase();
  for (const token of brandTokens) {
    if (lowered.includes(token)) return true;
  }
  return false;
}

function formatCurrencyRange(min: number, max: number) {
  return `$${round(min).toLocaleString()}-$${round(max).toLocaleString()}`;
}

function toContribution(
  label: string,
  impact: GoogleContributionImpact,
  summary: string,
  estimatedRevenueLiftRange?: string,
  estimatedWasteRecoveryRange?: string,
  estimatedEfficiencyLiftRange?: string
): GooglePotentialContribution {
  return {
    label,
    impact,
    summary,
    estimatedRevenueLiftRange,
    estimatedWasteRecoveryRange,
    estimatedEfficiencyLiftRange,
  };
}

function buildTimeframeContext(
  coreVerdict: string,
  selectedRangeNote: string,
  historicalSupport: string
) {
  return {
    coreVerdict,
    selectedRangeNote,
    historicalSupport,
  };
}

function metricEvidence(label: string, value: string): GoogleRecommendationEvidence {
  return { label, value };
}

function topSearchTerms(
  rows: SearchTermPerformanceRow[],
  limit: number,
  predicate: (row: SearchTermPerformanceRow) => boolean
) {
  return rows
    .filter(predicate)
    .sort((a, b) => Number(b.revenue ?? 0) - Number(a.revenue ?? 0))
    .slice(0, limit)
    .map((row) => row.searchTerm);
}

function topClusters(rows: SearchTermPerformanceRow[], limit: number, predicate: (row: SearchTermPerformanceRow) => boolean) {
  const clusterMap = new Map<string, { spend: number; conversions: number }>();
  for (const row of rows.filter(predicate)) {
    const key = row.clusterId || row.searchTerm.toLowerCase();
    const current = clusterMap.get(key) ?? { spend: 0, conversions: 0 };
    current.spend += Number(row.spend ?? 0);
    current.conversions += Number(row.conversions ?? 0);
    clusterMap.set(key, current);
  }
  return Array.from(clusterMap.entries())
    .sort((a, b) => b[1].conversions - a[1].conversions || b[1].spend - a[1].spend)
    .slice(0, limit)
    .map(([cluster]) => cluster.replace(/-/g, " "));
}

function normalizeSearchTerm(term: string) {
  return term
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function buildQueryWindowSupportMap(
  windows: WindowInput[],
  predicate: (row: SearchTermPerformanceRow) => boolean
) {
  const supportMap = new Map<string, number>();
  for (const window of windows) {
    const seen = new Set<string>();
    for (const row of window.searchTerms.filter(predicate)) {
      const key = normalizeSearchTerm(row.searchTerm);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      supportMap.set(key, (supportMap.get(key) ?? 0) + 1);
    }
  }
  return supportMap;
}

function uniqueTokensFromQueries(queries: string[], limit: number) {
  return Array.from(
    new Set(
      queries.flatMap((query) =>
        query
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((token) => token.length >= 4 && !SEARCH_TOKEN_STOPWORDS.has(token))
      )
    )
  ).slice(0, limit);
}

function buildReplacementAngles(
  searchTerms: SearchTermPerformanceRow[],
  products: ProductPerformanceRow[]
) {
  const themes = topClusters(
    searchTerms,
    3,
    (row) => Number(row.revenue ?? 0) > 0 && Number(row.conversions ?? 0) >= 1
  );
  const productAngles = products
    .filter((row) => Number(row.revenueShare ?? 0) >= 15 || row.hiddenWinnerState === "hidden_winner")
    .slice(0, 2)
    .map((row) => row.productTitle);

  return [
    ...themes.map((theme) => `Lead with "${theme}" intent in the first line`),
    ...productAngles.map((title) => `Use ${title} as the anchor proof point`),
  ].slice(0, 4);
}

function buildCampaignRoleRows(
  familySummaries: FamilySummary[],
  recommendations: GoogleRecommendation[]
): GoogleCampaignRoleRow[] {
  return familySummaries.flatMap((familySummary) => {
    const familyRecommendations = recommendations.filter((recommendation) => {
      return (
        recommendation.affectedFamilies?.includes(familySummary.family) ||
        familySummary.campaigns.some((campaign) =>
          recommendation.affectedCampaignIds?.includes(String(campaign.campaignId ?? ""))
        )
      );
    });

    const topActionHint = familyRecommendations[0]?.recommendedAction ?? null;
    const role = roleForFamily(familySummary.family, familySummary);

    return familySummary.campaigns.map((campaign) => ({
      campaignId: String(campaign.campaignId),
      campaignName: campaign.campaignName,
      family: familySummary.family,
      familyLabel: familySummary.familyLabel,
      role,
      roleLabel: role,
      recommendationCount: familyRecommendations.length,
      topActionHint,
    }));
  });
}

function sectionOrder(): GoogleRecommendationSection["title"][] {
  return [
    "Operating Model",
    "Search Governance",
    "Non-Brand Expansion",
    "Shopping & Products",
    "PMax Scaling",
    "Budget Moves",
    "Assets & Testing",
    "Diagnostics",
  ];
}

export function buildGoogleGrowthAdvisor(
  input: BuildGoogleGrowthAdvisorInput
): GoogleAdvisorResponse {
  const selectedFamilies = buildFamilySummaries(input.selectedCampaigns);
  const recommendationPool: GoogleRecommendation[] = [];
  const selectedTotals = aggregateCampaignRows(input.selectedCampaigns);
  const accountCore = finalizeMetrics(
    WINDOW_WEIGHTS.reduce(
      (acc, { key, weight }) => {
        const window = input.windows.find((entry) => entry.key === key);
        if (!window) return acc;
        const metrics = aggregateCampaignRows(window.campaigns);
        acc.spend += metrics.spend * weight;
        acc.revenue += metrics.revenue * weight;
        acc.conversions += metrics.conversions * weight;
        acc.clicks += metrics.clicks * weight;
        acc.impressions += metrics.impressions * weight;
        acc.weights += weight;
        return acc;
      },
      { spend: 0, revenue: 0, conversions: 0, clicks: 0, impressions: 0, weights: 0 }
    ).weights > 0
      ? {
          spend: WINDOW_WEIGHTS.reduce((sum, { key, weight }) => {
            const window = input.windows.find((entry) => entry.key === key);
            return sum + aggregateCampaignRows(window?.campaigns ?? []).spend * weight;
          }, 0) / WINDOW_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0),
          revenue: WINDOW_WEIGHTS.reduce((sum, { key, weight }) => {
            const window = input.windows.find((entry) => entry.key === key);
            return sum + aggregateCampaignRows(window?.campaigns ?? []).revenue * weight;
          }, 0) / WINDOW_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0),
          conversions: WINDOW_WEIGHTS.reduce((sum, { key, weight }) => {
            const window = input.windows.find((entry) => entry.key === key);
            return sum + aggregateCampaignRows(window?.campaigns ?? []).conversions * weight;
          }, 0) / WINDOW_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0),
          clicks: WINDOW_WEIGHTS.reduce((sum, { key, weight }) => {
            const window = input.windows.find((entry) => entry.key === key);
            return sum + aggregateCampaignRows(window?.campaigns ?? []).clicks * weight;
          }, 0) / WINDOW_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0),
          impressions: WINDOW_WEIGHTS.reduce((sum, { key, weight }) => {
            const window = input.windows.find((entry) => entry.key === key);
            return sum + aggregateCampaignRows(window?.campaigns ?? []).impressions * weight;
          }, 0) / WINDOW_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0),
          roas: 0,
          cpa: 0,
        }
      : {
          spend: selectedTotals.spend,
          revenue: selectedTotals.revenue,
          conversions: selectedTotals.conversions,
          clicks: selectedTotals.clicks,
          impressions: selectedTotals.impressions,
          roas: 0,
          cpa: 0,
        }
  );

  const familyMap = new Map(selectedFamilies.map((family) => [family.family, family]));
  const hasFamily = (family: GoogleCampaignFamily) => familyMap.has(family);
  const brandTokens = brandTokensFromAccount(input.selectedCampaigns, input.selectedSearchTerms);
  const recurringNonBrandSupport = buildQueryWindowSupportMap(
    input.windows,
    (row) =>
      !isBrandLikeQuery(row.searchTerm, brandTokens) &&
      (Number(row.conversions ?? 0) >= 1 || Number(row.revenue ?? 0) >= 100)
  );
  const recurringWasteSupport = buildQueryWindowSupportMap(
    input.windows,
    (row) => Boolean(row.negativeKeywordFlag || row.wasteFlag) && Number(row.spend ?? 0) >= 20
  );

  const nonBrandSeedRows = input.selectedSearchTerms
    .filter((row) => !isBrandLikeQuery(row.searchTerm, brandTokens))
    .filter((row) => Number(row.conversions ?? 0) >= 1 || Number(row.revenue ?? 0) >= 100)
    .filter((row) => Number(row.roas ?? 0) >= Math.max(accountCore.roas * 0.8, 1.25))
    .sort((a, b) => Number(b.revenue ?? 0) - Number(a.revenue ?? 0));

  const brandLeakageRows = input.selectedSearchTerms
    .filter((row) => isBrandLikeQuery(row.searchTerm, brandTokens))
    .filter((row) => {
      const family = input.selectedCampaigns.find(
        (campaign) => String(campaign.campaignId ?? "") === String(row.campaignId ?? "")
      )
        ? classifyCampaignFamily(
            input.selectedCampaigns.find(
              (campaign) => String(campaign.campaignId ?? "") === String(row.campaignId ?? "")
            )!
          )
        : String(row.campaignName ?? "").toLowerCase().includes("brand")
          ? "brand_search"
          : "supporting";
      return family !== "brand_search";
    })
    .filter((row) => Number(row.spend ?? 0) >= 15 || Number(row.conversions ?? 0) >= 1)
    .sort((a, b) => Number(b.spend ?? 0) - Number(a.spend ?? 0));

  if (hasFamily("brand_search") && hasFamily("pmax_scaling") && !hasFamily("non_brand_search")) {
    if (nonBrandSeedRows.length >= 2) {
      const exactSeedRows = nonBrandSeedRows.filter((row) => {
        const support = recurringNonBrandSupport.get(normalizeSearchTerm(row.searchTerm)) ?? 0;
        return Number(row.conversions ?? 0) >= 2 && support >= 2;
      });
      const phraseSeedRows = nonBrandSeedRows.filter((row) => {
        const support = recurringNonBrandSupport.get(normalizeSearchTerm(row.searchTerm)) ?? 0;
        return !exactSeedRows.includes(row) && Number(row.conversions ?? 0) >= 1 && support >= 1;
      });
      const seedQueriesExact = exactSeedRows.slice(0, 5).map((row) => row.searchTerm);
      const seedQueriesPhrase = phraseSeedRows.slice(0, 5).map((row) => row.searchTerm);
      const seedThemesBroad = topClusters(nonBrandSeedRows, 4, (row) => {
        const support = recurringNonBrandSupport.get(normalizeSearchTerm(row.searchTerm)) ?? 0;
        return Number(row.clicks ?? 0) >= 15 && support >= 2;
      });
      const negativeQueries = topSearchTerms(
        input.selectedSearchTerms,
        6,
        (row) => Boolean(row.negativeKeywordFlag || row.wasteFlag)
      );
      const negativeGuardrails = uniqueTokensFromQueries(negativeQueries, 6);

      recommendationPool.push({
        id: "google-non-brand-expansion",
        level: "account",
        type: "non_brand_expansion",
        strategyLayer: "Non-Brand Expansion",
        decisionState: "act",
        priority: "high",
        confidence: nonBrandSeedRows.length >= 4 ? "high" : "medium",
        comparisonCohort: "Brand Search + PMax",
        title: "Non-brand demand is showing up, but no search lane is catching it directly",
        summary:
          "Recurring non-brand converting queries are appearing in the current account mix, but they are still being captured indirectly through PMax instead of a controlled Search build.",
        why:
          "A dedicated non-brand lane would make query capture cleaner, give you exact/phrase control, and stop PMax from being the only home for proven commercial intent.",
        recommendedAction:
          "Launch a non-brand Search buildout: start with exact on the most proven commercial terms, add phrase around adjacent variants, keep broad limited to controlled discovery themes, and attach shared negatives from the waste cluster list.",
        potentialContribution: toContribution(
          "Incremental revenue capture",
          "high",
          "A non-brand lane should unlock cleaner demand mapping and incremental order volume beyond brand demand alone.",
          formatCurrencyRange(selectedTotals.revenue * 0.08, selectedTotals.revenue * 0.18)
        ),
        evidence: [
          metricEvidence("Recurring non-brand query count", String(nonBrandSeedRows.length)),
          metricEvidence(
            "Recurring exact-ready terms",
            String(exactSeedRows.length)
          ),
          metricEvidence("Best seed ROAS", `${round(nonBrandSeedRows[0]?.roas ?? 0)}x`),
          metricEvidence(
            "Expected launch shape",
            `${seedQueriesExact.length} exact / ${seedQueriesPhrase.length} phrase / ${seedThemesBroad.length} broad themes`
          ),
        ],
        timeframeContext: buildTimeframeContext(
          "Core verdict says there is enough recurring commercial demand to justify a dedicated non-brand lane.",
          `${input.selectedLabel} is only used to confirm which queries are live right now; the core call is supported by recurring query behavior.`,
          `Historical support comes from ${input.windows.filter((window) => window.searchTerms.some((row) => !isBrandLikeQuery(row.searchTerm, brandTokens) && Number(row.conversions ?? 0) >= 1)).length}/${input.windows.length} windows showing non-brand conversions.`
        ),
        affectedFamilies: ["brand_search", "pmax_scaling"],
        seedQueriesExact,
        seedQueriesPhrase,
        seedThemesBroad,
        negativeGuardrails,
        prerequisites: [
          "Brand demand is already protected separately",
          "Recurring non-brand terms are visible in current traffic",
        ],
        playbookSteps: [
          "Launch exact first for the most proven commercial queries.",
          "Add phrase only around adjacent proven variants.",
          "Keep broad limited to a small discovery theme set with shared negatives attached.",
        ],
      });
    }
  }

  const productWinners = input.selectedProducts
    .filter(
      (row) =>
        row.hiddenWinnerState === "hidden_winner" ||
        (row.scaleState === "scale" && Number(row.roas ?? 0) >= Math.max(accountCore.roas, 2))
    )
    .sort((a, b) => Number(b.revenue ?? 0) - Number(a.revenue ?? 0));
  const topProductShare = input.selectedProducts.length
    ? Math.max(...input.selectedProducts.map((row) => Number(row.revenueShare ?? 0)))
    : 0;
  const heroSkuClusters = input.selectedProducts
    .filter(
      (row) =>
        Number(row.revenueShare ?? 0) >= 20 ||
        Number(row.spendShare ?? 0) >= 20
    )
    .slice(0, 4)
    .map((row) => row.productTitle);

  if (hasFamily("pmax_scaling") && !hasFamily("shopping") && input.selectedProducts.length >= 3) {
    const shouldLaunchShopping =
      productWinners.length > 0 || topProductShare >= 40 || nonBrandSeedRows.length >= 3;
    if (shouldLaunchShopping) {
      const launchMode =
        topProductShare >= 55
          ? "hero_sku_shopping"
          : productWinners.length >= 2
          ? "category_split"
          : "new_control_shopping";
      const startingSkuClusters = (productWinners.length > 0 ? productWinners : input.selectedProducts)
        .slice(0, 4)
        .map((row) => row.productTitle);

      recommendationPool.push({
        id: "google-shopping-launch",
        level: "account",
        type: "shopping_launch_or_split",
        strategyLayer: "Shopping & Products",
        decisionState: "act",
        priority: "high",
        confidence: productWinners.length >= 2 ? "high" : "medium",
        comparisonCohort: "PMax product demand",
        title: "PMax is carrying catalog demand alone; a Shopping control lane would add useful control",
        summary:
          "The account has enough product depth and winner concentration to justify a Shopping lane for cleaner SKU control and product-level budget steering.",
        why:
          "A Standard Shopping layer helps expose product winners and losers more directly, keeps hero SKUs visible, and reduces over-reliance on opaque PMax routing.",
        recommendedAction:
          launchMode === "hero_sku_shopping"
            ? "Launch a hero-SKU Shopping control campaign around the top products first, then decide whether broader category splits are warranted."
            : launchMode === "category_split"
            ? "Launch Shopping with category or product-cluster separation so winners can scale independently from weak catalog segments."
            : "Launch a lightweight Shopping control campaign to validate SKU-level steering before adding more PMax budget.",
        potentialContribution: toContribution(
          "Control gain",
          "medium",
          "Shopping should improve SKU-level budget precision and make product winners easier to scale without relying on PMax opacity.",
          formatCurrencyRange(selectedTotals.revenue * 0.05, selectedTotals.revenue * 0.12),
          undefined,
          "Higher SKU accountability and cleaner product pruning"
        ),
        evidence: [
          metricEvidence("Product rows in play", String(input.selectedProducts.length)),
          metricEvidence("Hidden / scale-ready winners", String(productWinners.length)),
          metricEvidence("Top product revenue share", `${round(topProductShare, 1)}%`),
        ],
        timeframeContext: buildTimeframeContext(
          "Core verdict says product signal density is high enough that Shopping control would add value.",
          `${input.selectedLabel} confirms the current catalog pressure, but the launch call is supported by recurring product concentration across longer windows.`,
          `Historical support comes from ${input.windows.filter((window) => window.products.some((row) => row.hiddenWinnerState === "hidden_winner" || row.scaleState === "scale")).length}/${input.windows.length} windows showing reusable product winners.`
        ),
        affectedFamilies: ["pmax_scaling"],
        launchMode,
        startingSkuClusters,
        shoppingRationale:
          "Shopping adds SKU-level control, clearer product accountability, and a cleaner read on catalog winners than PMax alone can provide.",
        heroSkuClusters,
        prerequisites: [
          "Merchant Center feed quality is stable",
          "At least one reusable product winner or concentrated hero SKU exists",
        ],
        playbookSteps: launchMode === "hero_sku_shopping"
          ? [
              "Start with a hero-SKU Shopping control campaign around the strongest products.",
              "Keep budgets tight until price and query coverage are clean.",
              "Expand into category splits only after hero SKUs prove controllable scale.",
            ]
          : launchMode === "category_split"
            ? [
                "Split Shopping by category or winner clusters first.",
                "Keep weak products isolated from hero products.",
                "Use early Shopping results to decide which clusters deserve more budget than PMax.",
              ]
            : [
                "Launch a light Shopping control lane next to PMax.",
                "Use it to validate product-level steering and query visibility before scaling spend.",
                "Escalate only if Shopping shows clearer winner control than PMax alone.",
              ],
      });
    }
  }

  const brandSummary = familyMap.get("brand_search");
  const nonBrandSummary = familyMap.get("non_brand_search");
  const pmaxSummary = familyMap.get("pmax_scaling");
  if (
    brandSummary &&
    brandSummary.revenueShare >= 35 &&
    brandSummary.roas >= Math.max((nonBrandSummary?.roas ?? 0) * 1.4, (pmaxSummary?.roas ?? 0) * 1.2)
  ) {
    recommendationPool.push({
      id: "google-brand-control",
      level: "account",
      type: "brand_capture_control",
      strategyLayer: "Operating Model",
      decisionState: "act",
      priority: "medium",
      confidence: "high",
      comparisonCohort: "Brand vs growth lanes",
      title: "Brand demand is masking the true efficiency of the growth engine",
      summary:
        "Brand Search is materially stronger than the rest of the account, so blended ROAS overstates how healthy true growth lanes are.",
      why:
        "If brand remains mixed into top-line decision-making, the account can look healthier than its non-brand demand capture actually is.",
      recommendedAction:
        "Keep Brand Search isolated, judge scale decisions on non-brand and PMax cohorts separately, and avoid letting branded demand justify broader budget expansion on its own.",
      potentialContribution: toContribution(
        "Control gain",
        "medium",
        "Separating brand performance gives cleaner growth decisions and prevents false-positive scale calls.",
        undefined,
        formatCurrencyRange(brandSummary.spend * 0.05, brandSummary.spend * 0.12)
      ),
      evidence: [
        metricEvidence("Brand revenue share", `${round(brandSummary.revenueShare, 1)}%`),
        metricEvidence("Brand ROAS", `${round(brandSummary.roas)}x`),
        metricEvidence(
          "Best growth-lane ROAS",
          `${round(Math.max(nonBrandSummary?.roas ?? 0, pmaxSummary?.roas ?? 0))}x`
        ),
      ],
      timeframeContext: buildTimeframeContext(
        "Core verdict says brand is behaving like a support lane, not the growth benchmark.",
        `${input.selectedLabel} can move brand efficiency around, but the broader operating model still needs brand kept separate from growth evaluation.`,
        `Historical support persists in ${input.windows.filter((window) => {
          const families = buildFamilySummaries(window.campaigns);
          const brand = families.find((entry) => entry.family === "brand_search");
          const growthBest = Math.max(
            families.find((entry) => entry.family === "non_brand_search")?.roas ?? 0,
            families.find((entry) => entry.family === "pmax_scaling")?.roas ?? 0
          );
          return Boolean(brand && brand.roas >= growthBest * 1.2);
        }).length}/${input.windows.length} windows.`
      ),
      affectedFamilies: ["brand_search", "non_brand_search", "pmax_scaling"],
      prerequisites: [
        "Brand should stay isolated from true growth evaluation",
      ],
      playbookSteps: [
        "Keep Brand Search separate from non-brand and PMax evaluation.",
        "Do not let branded demand justify broader scale decisions by itself.",
      ],
    });
  }

  if (brandLeakageRows.length >= 2) {
    const leakageQueries = brandLeakageRows.slice(0, 6).map((row) => row.searchTerm);
    recommendationPool.push({
      id: "google-brand-leakage-control",
      level: "account",
      type: "brand_capture_control",
      strategyLayer: "Search Governance",
      decisionState: "act",
      priority: "high",
      confidence: "high",
      comparisonCohort: "Brand leakage",
      title: "Brand demand is leaking into non-brand lanes",
      summary:
        "Brand-like search demand is showing up outside the dedicated brand lane, which muddies growth measurement and makes PMax/Search routing harder to trust.",
      why:
        "When brand queries are allowed to convert through non-brand or PMax lanes, those lanes look healthier than their true incremental contribution.",
      recommendedAction:
        "Add brand negatives or exclusions to the growth lanes where possible, keep branded demand isolated, and use the leaked brand queries as a control list before scaling broader discovery.",
      potentialContribution: toContribution(
        "Control gain",
        "medium",
        "Cleaning brand leakage improves the truthfulness of non-brand and PMax performance before more budget is pushed.",
        undefined,
        formatCurrencyRange(
          brandLeakageRows.reduce((sum, row) => sum + Number(row.spend ?? 0), 0) * 0.15,
          brandLeakageRows.reduce((sum, row) => sum + Number(row.spend ?? 0), 0) * 0.35
        )
      ),
      evidence: [
        metricEvidence("Leaked brand queries", String(brandLeakageRows.length)),
        metricEvidence(
          "Leakage spend",
          `$${round(brandLeakageRows.reduce((sum, row) => sum + Number(row.spend ?? 0), 0)).toLocaleString()}`
        ),
        metricEvidence(
          "Main leakage lane",
          brandLeakageRows[0]?.campaignName ?? "n/a"
        ),
      ],
      timeframeContext: buildTimeframeContext(
        "Core verdict says brand capture is not clean enough to trust the growth-lane read at face value.",
        `${input.selectedLabel} shows the current leakage, but the underlying issue is lane contamination rather than one short-term query spike.`,
        `Historical support found in ${input.windows.filter((window) => window.searchTerms.some((row) => isBrandLikeQuery(row.searchTerm, brandTokens) && !String(row.campaignName ?? "").toLowerCase().includes("brand"))).length}/${input.windows.length} windows.`
      ),
      affectedFamilies: ["brand_search", "non_brand_search", "pmax_scaling"],
      negativeQueries: leakageQueries,
      negativeGuardrails: uniqueTokensFromQueries(leakageQueries, 6),
      prerequisites: [
        "Brand query controls must be available in the growth lanes where possible",
      ],
      playbookSteps: [
        "Create a brand leakage control list from the leaked branded queries.",
        "Apply brand negatives or exclusions to non-brand and PMax growth lanes where possible.",
        "Re-check whether growth lanes still look efficient after leakage is removed.",
      ],
    });
  }

  const wasteQueries = input.selectedSearchTerms
    .filter((row) => Boolean(row.negativeKeywordFlag || row.wasteFlag))
    .filter((row) => Number(row.spend ?? 0) >= 20)
    .sort((a, b) => Number(b.spend ?? 0) - Number(a.spend ?? 0));
  if (wasteQueries.length >= 2) {
    const negativeQueries = wasteQueries.slice(0, 6).map((row) => row.searchTerm);
    const negativeClusters = topClusters(wasteQueries, 4, () => true);
    const negativeGuardrails = uniqueTokensFromQueries(negativeQueries, 8);
    recommendationPool.push({
      id: "google-query-governance",
      level: "account",
      type: "query_governance",
      strategyLayer: "Search Governance",
      decisionState: "act",
      priority: "high",
      confidence: "high",
      comparisonCohort: "Search query waste",
      title: "Query waste is still being allowed through the account",
      summary:
        "Multiple search terms are consuming meaningful spend without enough return, which means negatives and tighter intent control should happen before more scaling.",
      why:
        "Wasteful search clusters drag blended efficiency and distort which campaigns look ready for more budget.",
      recommendedAction:
        "Add the waste clusters and worst queries to shared negatives, then tighten phrase/broad traffic with a cleaner negative guardrail list before expanding budgets.",
      potentialContribution: toContribution(
        "Waste recovery",
        "high",
        "This should recover budget quickly and improve signal quality for the remaining search traffic.",
        undefined,
        formatCurrencyRange(
          wasteQueries.reduce((sum, row) => sum + Number(row.spend ?? 0), 0) * 0.25,
          wasteQueries.reduce((sum, row) => sum + Number(row.spend ?? 0), 0) * 0.45
        )
      ),
      evidence: [
        metricEvidence("Waste query count", String(wasteQueries.length)),
        metricEvidence(
          "Recurring waste queries",
          String(
            wasteQueries.filter(
              (row) =>
                (recurringWasteSupport.get(normalizeSearchTerm(row.searchTerm)) ?? 0) >= 2
            ).length
          )
        ),
        metricEvidence(
          "Waste spend",
          `$${round(wasteQueries.reduce((sum, row) => sum + Number(row.spend ?? 0), 0)).toLocaleString()}`
        ),
        metricEvidence("Top waste cluster", negativeClusters[0] ?? "n/a"),
      ],
      timeframeContext: buildTimeframeContext(
        "Core verdict says query waste is broad enough to merit shared governance, not one-off cleanup.",
        `${input.selectedLabel} highlights the current leakage, but longer windows confirm this is a repeatable waste pattern rather than a one-off spike.`,
        `Historical support found in ${input.windows.filter((window) => window.searchTerms.some((row) => Boolean(row.negativeKeywordFlag || row.wasteFlag) && Number(row.spend ?? 0) >= 20)).length}/${input.windows.length} windows.`
      ),
      affectedFamilies: ["brand_search", "non_brand_search"],
      negativeClusters,
      negativeQueries,
      negativeGuardrails,
      prerequisites: [
        "Shared negative management should be clean before more scale is pushed",
      ],
      playbookSteps: [
        "Start with the highest-spend waste clusters first.",
        "Apply the strongest wasted terms to shared negatives or lane-specific control lists.",
        "Re-run query review after 7 days to confirm leakage was actually removed.",
      ],
    });
  }

  const exactCandidates = nonBrandSeedRows
    .filter((row) => {
      const support = recurringNonBrandSupport.get(normalizeSearchTerm(row.searchTerm)) ?? 0;
      return Number(row.conversions ?? 0) >= 2 && support >= 2;
    })
    .slice(0, 5)
    .map((row) => row.searchTerm);
  const phraseCandidates = nonBrandSeedRows
    .filter((row) => {
      const support = recurringNonBrandSupport.get(normalizeSearchTerm(row.searchTerm)) ?? 0;
      return Number(row.conversions ?? 0) >= 1 && support >= 1;
    })
    .map((row) => row.searchTerm)
    .filter((query) => !exactCandidates.includes(query))
    .slice(0, 5);
  const broadThemes = topClusters(nonBrandSeedRows, 4, (row) => {
    const support = recurringNonBrandSupport.get(normalizeSearchTerm(row.searchTerm)) ?? 0;
    return Number(row.clicks ?? 0) >= 15 && support >= 2;
  });
  if (exactCandidates.length > 0 || phraseCandidates.length > 0 || broadThemes.length > 0) {
    const recurringExactCount = exactCandidates.filter(
      (query) => (recurringNonBrandSupport.get(normalizeSearchTerm(query)) ?? 0) >= 2
    ).length;
    recommendationPool.push({
      id: "google-keyword-buildout",
      level: "account",
      type: "keyword_buildout",
      strategyLayer: "Search Governance",
      decisionState: exactCandidates.length >= 2 ? "act" : "test",
      priority: "medium",
      confidence: exactCandidates.length >= 2 ? "high" : "medium",
      comparisonCohort: "Search term promotion",
      title: "Search terms are ready to be promoted into cleaner keyword control",
      summary:
        "The account already has search terms that have proven intent and should move into a cleaner keyword buildout instead of remaining loose capture only.",
      why:
        "Promoting proven terms into exact and phrase improves control, keeps intent mapping cleaner, and makes it easier to decide what broad discovery deserves more room.",
      recommendedAction:
        "Promote the strongest proven terms into exact, support adjacent proven variants with phrase, and keep broad limited to theme-based discovery with negatives attached.",
      potentialContribution: toContribution(
        "Signal gain",
        "medium",
        "A cleaner keyword buildout improves demand visibility and makes budget moves more trustworthy.",
        formatCurrencyRange(selectedTotals.revenue * 0.03, selectedTotals.revenue * 0.08)
      ),
      evidence: [
        metricEvidence("Promote to exact", String(exactCandidates.length)),
        metricEvidence("Recurring exact support", String(recurringExactCount)),
        metricEvidence("Promote to phrase", String(phraseCandidates.length)),
        metricEvidence("Broad discovery themes", String(broadThemes.length)),
      ],
      timeframeContext: buildTimeframeContext(
        "Core verdict says keyword buildout is warranted because the same themes are persisting beyond a single recent window.",
        `${input.selectedLabel} highlights the freshest winners, but the promotion call depends on repeatability across windows.`,
        `Historical support found in ${input.windows.filter((window) => window.searchTerms.some((row) => Number(row.conversions ?? 0) >= 2)).length}/${input.windows.length} windows.`
      ),
      affectedFamilies: ["non_brand_search", "pmax_scaling"],
      promoteToExact: exactCandidates,
      promoteToPhrase: phraseCandidates,
      broadDiscoveryThemes: broadThemes,
      negativeGuardrails: uniqueTokensFromQueries(
        wasteQueries.slice(0, 6).map((row) => row.searchTerm),
        6
      ),
      prerequisites: [
        "Only repeated, conversion-backed themes should move into exact buildout",
      ],
      playbookSteps: [
        "Promote the strongest recurring queries into exact first.",
        "Keep weaker but promising recurring terms in phrase before giving them full exact budget.",
        "Use broad only as a discovery wrapper around clearly defined themes.",
      ],
    });
  }

  const scaleSkuClusters = input.selectedProducts
    .filter((row) => row.scaleState === "scale" && Number(row.roas ?? 0) >= Math.max(accountCore.roas, 2))
    .slice(0, 4)
    .map((row) => row.productTitle);
  const reduceSkuClusters = input.selectedProducts
    .filter(
      (row) =>
        row.underperformingState === "underperforming" ||
        (Number(row.spendShare ?? 0) >= 12 && Number(row.roas ?? 0) < Math.max(accountCore.roas * 0.75, 1))
    )
    .slice(0, 4)
    .map((row) => row.productTitle);
  const hiddenWinnerSkuClusters = input.selectedProducts
    .filter((row) => row.hiddenWinnerState === "hidden_winner")
    .slice(0, 4)
    .map((row) => row.productTitle);
  if (scaleSkuClusters.length > 0 || reduceSkuClusters.length > 0 || hiddenWinnerSkuClusters.length > 0) {
    recommendationPool.push({
      id: "google-product-allocation",
      level: "account",
      type: "product_allocation",
      strategyLayer: "Shopping & Products",
      decisionState: "act",
      priority: "high",
      confidence: "high",
      comparisonCohort: hasFamily("shopping") ? "Shopping/PMax products" : "PMax products",
      title: "Product pressure is uneven; winners and losers should not keep sharing the same budget logic",
      summary:
        "The current product mix shows a clear split between scale-worthy products, hidden winners, and products that are eating budget without enough return.",
      why:
        "Product-level steering is one of the fastest ways to improve revenue quality in ecommerce Google accounts.",
      recommendedAction:
        "Push more budget and visibility into the hidden and explicit winners, while cutting back or isolating the products that are consistently underperforming.",
      potentialContribution: toContribution(
        "Efficiency protection",
        "high",
        "Cleaner SKU allocation should protect revenue while reducing wasted shopping and PMax spend.",
        formatCurrencyRange(selectedTotals.revenue * 0.04, selectedTotals.revenue * 0.1),
        formatCurrencyRange(
          input.selectedProducts
            .filter((row) => reduceSkuClusters.includes(row.productTitle))
            .reduce((sum, row) => sum + Number(row.spend ?? 0), 0) * 0.2,
          input.selectedProducts
            .filter((row) => reduceSkuClusters.includes(row.productTitle))
            .reduce((sum, row) => sum + Number(row.spend ?? 0), 0) * 0.4
        ),
        "ROAS stabilization before new scale"
      ),
      evidence: [
        metricEvidence("Scale SKU clusters", String(scaleSkuClusters.length)),
        metricEvidence("Hidden winners", String(hiddenWinnerSkuClusters.length)),
        metricEvidence("Reduce candidates", String(reduceSkuClusters.length)),
      ],
      timeframeContext: buildTimeframeContext(
        "Core verdict says product concentration and product quality gaps are structural enough to act on now.",
        `${input.selectedLabel} is only the latest read; the product split between winners and laggards exists across longer windows too.`,
        `Historical support found in ${input.windows.filter((window) => window.products.some((row) => row.hiddenWinnerState === "hidden_winner" || row.underperformingState === "underperforming")).length}/${input.windows.length} windows.`
      ),
      affectedFamilies: ["shopping", "pmax_scaling"],
      scaleSkuClusters,
      reduceSkuClusters,
      hiddenWinnerSkuClusters,
      heroSkuClusters,
      prerequisites: hasFamily("shopping")
        ? ["Enough SKU depth", "Readable product-level conversion data"]
        : ["Feed-connected catalog", "PMax already proving product demand"],
      playbookSteps: [
        "Lock the highest-ROAS hero and hidden-winner SKUs into their own monitoring list.",
        "Reduce exposure for spend-heavy laggards before pushing new budget.",
        "Review product groups again after 7-14 days to confirm the winner/loser split persists.",
      ],
    });
  }

  if (pmaxSummary) {
    const pmaxCore = buildCoreFamilyMetrics(input.windows, "pmax_scaling");
    const weakAssetGroups = input.selectedAssetGroups.filter(
      (row) =>
        row.weakState === "weak" ||
        row.coverageRisk ||
        (Number(row.messagingAlignmentScore ?? 0) <= 0.4)
    );
    recommendationPool.push({
      id: "google-pmax-fit",
      level: "account",
      type: "pmax_scaling_fit",
      strategyLayer: "PMax Scaling",
      decisionState:
        pmaxCore.roas >= Math.max(accountCore.roas * 0.95, 2) && weakAssetGroups.length === 0
          ? "act"
          : "watch",
      priority: "medium",
      confidence: weakAssetGroups.length === 0 ? "medium" : "high",
      comparisonCohort: "PMax scaling lane",
      title:
        weakAssetGroups.length === 0
          ? "PMax looks capable of carrying more scale"
          : "PMax should be cleaned up before more budget is pushed through it",
      summary:
        weakAssetGroups.length === 0
          ? "The current PMax setup is behaving like a legitimate scaling lane rather than an opaque support layer."
          : "Asset group coverage and messaging alignment are still weak enough that more budget would likely amplify noise before it amplifies revenue.",
      why:
        weakAssetGroups.length === 0
          ? "When PMax is structurally healthy and revenue quality is stable, it can act as the primary scaling lane."
          : "Weak asset groups, thin coverage, and poor messaging alignment limit how safely PMax can scale.",
      recommendedAction:
        weakAssetGroups.length === 0
          ? "Increase PMax budget 10-15% while keeping Shopping/Search governance clean so the scaling lane stays trustworthy."
          : "Fix the weak asset groups, align search themes to message, and clear product/query waste before trying to scale PMax harder.",
      potentialContribution: toContribution(
        weakAssetGroups.length === 0 ? "Incremental revenue capture" : "Signal gain",
        weakAssetGroups.length === 0 ? "medium" : "medium",
        weakAssetGroups.length === 0
          ? "Healthy PMax lanes can usually absorb more budget faster than new campaign launches."
          : "Cleaning structure first should make later PMax scale more reliable.",
        weakAssetGroups.length === 0
          ? formatCurrencyRange(selectedTotals.revenue * 0.05, selectedTotals.revenue * 0.11)
          : undefined,
        undefined,
        weakAssetGroups.length === 0 ? "Cleaner scale absorption in PMax" : "Reduced noise before scale"
      ),
      evidence: [
        metricEvidence("Selected PMax ROAS", `${round(pmaxSummary.roas)}x`),
        metricEvidence("Core PMax ROAS", `${round(pmaxCore.roas)}x`),
        metricEvidence("Weak asset groups", String(weakAssetGroups.length)),
      ],
      timeframeContext: buildTimeframeContext(
        "Core verdict says PMax should be judged on recurring efficiency and structure quality, not just the latest revenue spike.",
        `${input.selectedLabel} is a directional overlay only; the scale call is anchored to weighted PMax performance and structure health.`,
        `Historical support found in ${input.windows.filter((window) => buildCoreFamilyMetrics([window], "pmax_scaling").roas >= Math.max(accountCore.roas * 0.9, 1.8)).length}/${input.windows.length} windows.`
      ),
      affectedFamilies: ["pmax_scaling"],
      weakAssetGroups: weakAssetGroups.slice(0, 4).map((row) => row.assetGroupName),
      prerequisites: weakAssetGroups.length === 0
        ? ["Search/query governance is already under control", "Product pressure is readable"]
        : ["Weak asset groups need cleanup before budget expansion"],
      playbookSteps: weakAssetGroups.length === 0
        ? [
            "Raise budget gradually, not all at once.",
            "Watch whether PMax efficiency holds after the first scale step.",
            "Keep Search/Shopping governance clean so PMax does not absorb avoidable waste.",
          ]
        : [
            "Clean the weakest asset groups first.",
            "Fix theme alignment and missing coverage before scaling budget.",
            "Reassess after 7-14 days to confirm structure health improved.",
          ],
    });
  }

  const weakGroups = input.selectedAssetGroups.filter(
    (row) =>
      row.weakState === "weak" ||
      row.coverageRisk ||
      (Number(row.missingAssetTypes?.length ?? 0) > 0)
  );
  if (weakGroups.length > 0) {
    recommendationPool.push({
      id: "google-asset-group-structure",
      level: "account",
      type: "asset_group_structure",
      strategyLayer: "Assets & Testing",
      decisionState: "act",
      priority: "medium",
      confidence: "high",
      comparisonCohort: "PMax asset groups",
      title: "Some asset groups are too weak to carry clean demand capture",
      summary:
        "Coverage gaps, weak theme alignment, or underdeveloped asset mixes are leaving some asset groups unable to compete with the stronger lane.",
      why:
        "Asset groups should have a clear theme and enough coverage to carry intent without leaning on generic messaging.",
      recommendedAction:
        "Split weak asset groups by clearer theme, fill missing asset types, and keep low-signal groups in a tighter test lane until they prove they can scale.",
      potentialContribution: toContribution(
        "Signal gain",
        "medium",
        "Cleaner asset groups improve the quality of PMax learning and reduce budget bleed into generic message sets.",
        undefined,
        undefined,
        "Better theme match and cleaner message routing"
      ),
      evidence: [
        metricEvidence("Weak / at-risk asset groups", String(weakGroups.length)),
        metricEvidence(
          "Missing asset fields",
          String(
            weakGroups.reduce(
              (sum, row) => sum + Number(row.missingAssetTypes?.length ?? 0),
              0
            )
          )
        ),
        metricEvidence(
          "Lowest alignment score",
          `${round(
            Math.min(...weakGroups.map((row) => Number(row.messagingAlignmentScore ?? 0)))
          )}`
        ),
      ],
      timeframeContext: buildTimeframeContext(
        "Core verdict says the structural weakness is persistent enough to justify an asset-group rebuild, not just minor copy edits.",
        `${input.selectedLabel} confirms which groups are weak right now; the structural call relies on asset coverage and alignment diagnostics.`,
        `Historical support comes from ${input.windows.filter((window) => window.campaigns.some((campaign) => classifyCampaignFamily(campaign) === "pmax_scaling")).length}/${input.windows.length} windows with PMax spend present.`
      ),
      affectedFamilies: ["pmax_scaling"],
      weakAssetGroups: weakGroups.slice(0, 5).map((row) => row.assetGroupName),
      keepSeparateAssetGroups: weakGroups
        .filter((row) => row.scaleState !== "scale" || row.weakState === "weak")
        .slice(0, 4)
        .map((row) => row.assetGroupName),
      prerequisites: ["Asset group themes should map cleanly to search intent", "Missing asset types should be filled before judging group quality"],
      playbookSteps: [
        "Split weak asset groups by a tighter theme instead of keeping them broad.",
        "Fill missing asset types and fix mismatched messaging.",
        "Keep low-signal groups separate from mature scaling groups until they prove efficiency.",
      ],
    });
  }

  const scaleReadyAssets = input.selectedAssets
    .filter((row) => String(assetMeta(row).assetState ?? assetMeta(row).performanceLabel ?? "").toLowerCase().includes("top") || Boolean(assetMeta(row).expandFlag))
    .slice(0, 4)
    .map((row) => row.assetName ?? row.assetText ?? String(assetMeta(row).preview ?? row.assetId));
  const replaceAssets = input.selectedAssets
    .filter((row) => String(assetMeta(row).assetState ?? assetMeta(row).performanceLabel ?? "").toLowerCase().includes("under") || Boolean(assetMeta(row).wasteFlag))
    .slice(0, 4)
    .map((row) => row.assetName ?? row.assetText ?? String(assetMeta(row).preview ?? row.assetId));
  const testOnlyAssets = input.selectedAssets
    .filter(
      (row) =>
        !scaleReadyAssets.includes(row.assetName ?? row.assetText ?? String(assetMeta(row).preview ?? row.assetId)) &&
        !replaceAssets.includes(row.assetName ?? row.assetText ?? String(assetMeta(row).preview ?? row.assetId))
    )
    .slice(0, 4)
    .map((row) => row.assetName ?? row.assetText ?? String(assetMeta(row).preview ?? row.assetId));
  if (scaleReadyAssets.length > 0 || replaceAssets.length > 0) {
    recommendationPool.push({
      id: "google-asset-deployment",
      level: "account",
      type: "creative_asset_deployment",
      strategyLayer: "Assets & Testing",
      decisionState: "act",
      priority: "medium",
      confidence: replaceAssets.length > 0 ? "high" : "medium",
      comparisonCohort: "PMax assets",
      title: "Asset rotation should separate scale-ready winners from replacement work",
      summary:
        "The current asset mix already shows clear winners and clear draggers, so asset rotation should become more deliberate instead of treating all assets equally.",
      why:
        "Keeping weak assets in the same rotation as proven winners slows down learning and forces scaling lanes to do creative discovery at the same time.",
      recommendedAction:
        "Keep the proven winners in the scaling lane, move average assets into controlled testing, and replace the clearly weak assets with search-led angle refreshes.",
      potentialContribution: toContribution(
        "Signal gain",
        "medium",
        "Sharper asset deployment should improve both message quality and the speed of future asset testing.",
        undefined,
        undefined,
        "Higher message quality and faster creative learning"
      ),
      evidence: [
        metricEvidence("Scale-ready assets", String(scaleReadyAssets.length)),
        metricEvidence("Replace now", String(replaceAssets.length)),
        metricEvidence("Test-only assets", String(testOnlyAssets.length)),
      ],
      timeframeContext: buildTimeframeContext(
        "Core verdict says asset deployment should follow asset quality states, not just current campaign spend.",
        `${input.selectedLabel} is the current snapshot of asset behavior; the scale vs replace call is anchored to broader asset and query signal quality.`,
        "Historical support comes from recurring query themes and product winners, which are a steadier source of message direction than a single short date range."
      ),
      affectedFamilies: ["pmax_scaling"],
      scaleReadyAssets,
      testOnlyAssets,
      replaceAssets,
      replacementAngles: buildReplacementAngles(input.selectedSearchTerms, input.selectedProducts),
      prerequisites: [
        "Do not let scaling lanes keep discovering with weak assets still in rotation",
      ],
      playbookSteps: [
        "Keep the proven winners live in the scaling mix.",
        "Move middling assets into controlled testing instead of equal rotation.",
        "Replace the worst assets with angles derived from winning queries and products.",
      ],
    });
  }

  if (brandSummary && nonBrandSeedRows.length > 0) {
    recommendationPool.push({
      id: "google-budget-move",
      level: "account",
      type: "budget_reallocation",
      strategyLayer: "Budget Moves",
      decisionState: "test",
      priority: "medium",
      confidence: "medium",
      comparisonCohort: "Support -> growth reallocation",
      title: "A small amount of support-lane budget can fund cleaner growth learning",
      summary:
        "The account does not need a wholesale budget rewrite, but carving out a small, deliberate test budget would make growth evaluation much cleaner.",
      why:
        "Brand tends to keep spending efficiently, but that does not mean every extra dollar should stay there if growth coverage is still missing.",
      recommendedAction:
        "Reallocate 10-15% of surplus support-lane budget into the new non-brand or Shopping validation lane, then judge scale on that incremental cohort separately.",
      potentialContribution: toContribution(
        "Control gain",
        "medium",
        "A controlled budget move can create learning without destabilizing the account.",
        undefined,
        undefined,
        "Cleaner read on incremental growth lanes"
      ),
      evidence: [
        metricEvidence("Support lane share", `${round((brandSummary?.spendShare ?? 0) + ((familyMap.get("remarketing")?.spendShare ?? 0)), 1)}%`),
        metricEvidence("Non-brand seed pool", String(nonBrandSeedRows.length)),
        metricEvidence("Suggested move", "10-15%"),
      ],
      timeframeContext: buildTimeframeContext(
        "Core verdict says the account has room for a measured budget carve-out without betting the full operating model on it.",
        `${input.selectedLabel} helps gauge current urgency, but the recommendation is based on lane roles more than a single recent efficiency snapshot.`,
        "Historical support comes from stable support-lane behavior and persistent uncovered growth demand."
      ),
      affectedFamilies: ["brand_search", "pmax_scaling", "non_brand_search"],
      reallocationBand: "10-15%",
      prerequisites: [
        "Support lane performance remains stable",
        "New growth lane is launched with tight query or product controls",
      ],
      playbookSteps: [
        "Move only a controlled slice of surplus support-lane budget.",
        "Judge the new lane on its own cohort, not on blended account ROAS.",
        "Only scale further after the validation lane proves repeatable efficiency.",
      ],
    });
  }

  const bestGeo = input.selectedGeos
    .slice()
    .sort((a, b) => Number(b.roas ?? 0) - Number(a.roas ?? 0))[0];
  const worstGeo = input.selectedGeos
    .slice()
    .sort((a, b) => Number(a.roas ?? 0) - Number(b.roas ?? 0))[0];
  const desktop = input.selectedDevices.find((row) => String(row.device).toLowerCase().includes("desktop"));
  const mobile = input.selectedDevices.find((row) => String(row.device).toLowerCase().includes("mobile"));
  if (
    (bestGeo && worstGeo && bestGeo.geoName !== worstGeo.geoName && Number(bestGeo.roas ?? 0) >= Math.max(Number(worstGeo.roas ?? 0) * 1.75, 2)) ||
    (desktop && mobile && Number(desktop.roas ?? 0) >= Math.max(Number(mobile.roas ?? 0) * 1.4, 2))
  ) {
    recommendationPool.push({
      id: "google-geo-device-adjustment",
      level: "account",
      type: "geo_device_adjustment",
      strategyLayer: "Budget Moves",
      decisionState: "watch",
      priority: "low",
      confidence: "medium",
      comparisonCohort: "Geo / device skew",
      title: "Geo or device performance is uneven enough to justify a small directional adjustment",
      summary:
        "There is a meaningful efficiency split in either top geos or devices, but this should stay a secondary action after the larger demand-capture fixes.",
      why:
        "Geo and device tuning can help, but they should not become the main narrative when structural demand capture issues still exist.",
      recommendedAction:
        desktop && mobile && Number(desktop.roas ?? 0) >= Math.max(Number(mobile.roas ?? 0) * 1.4, 2)
          ? "Audit mobile landing flow and hold back incremental mobile expansion until mobile conversion quality catches up."
          : `Protect ${bestGeo?.geoName ?? "the stronger geo"} while reducing expansion pressure on ${worstGeo?.geoName ?? "the weakest geo"} until its economics improve.`,
      potentialContribution: toContribution(
        "Efficiency protection",
        "low",
        "This is a secondary gain lever, useful only after bigger structural moves are already in motion.",
        undefined,
        undefined,
        "Directional efficiency cleanup"
      ),
      evidence: [
        metricEvidence("Best geo/device ROAS", `${round(Math.max(bestGeo?.roas ?? 0, desktop?.roas ?? 0))}x`),
        metricEvidence("Weak geo/device ROAS", `${round(Math.min(worstGeo?.roas ?? Number.POSITIVE_INFINITY, mobile?.roas ?? Number.POSITIVE_INFINITY))}x`),
        metricEvidence("Priority", "Secondary"),
      ],
      timeframeContext: buildTimeframeContext(
        "Core verdict says geo/device actions are secondary overlays, not the core growth answer.",
        `${input.selectedLabel} may make the skew look sharper or softer, but the recommendation remains deliberately low priority.`,
        "Historical support is intentionally treated as supportive only; structural demand capture decisions outrank this layer."
      ),
      affectedFamilies: ["non_brand_search", "pmax_scaling", "shopping"],
      prerequisites: ["Core demand-capture issues should already be addressed first"],
      playbookSteps: [
        "Treat geo/device moves as secondary overlays, not the main growth answer.",
        "Protect the strong pockets and cap the weak ones only after the major fixes are underway.",
      ],
    });
  }

  const hasSparseData = selectedTotals.conversions < 8 || (input.selectedSearchTerms.length === 0 && hasFamily("non_brand_search"));
  if (hasSparseData || (hasFamily("pmax_scaling") && input.selectedProducts.length === 0)) {
    recommendationPool.push({
      id: "google-diagnostic-guardrail",
      level: "account",
      type: "diagnostic_guardrail",
      strategyLayer: "Diagnostics",
      decisionState: "watch",
      priority: "medium",
      confidence: "high",
      title: "Decision confidence is capped by data visibility gaps",
      summary:
        "The account still has blind spots that limit how aggressive the advisor should be with structural changes.",
      why:
        "Sparse conversions, weak product visibility, or thin search-term depth can make healthy-looking trends less trustworthy than they appear.",
      recommendedAction:
        "Use the stronger structural recommendations first, but treat fine-grained budget and query moves more cautiously until signal depth improves.",
      potentialContribution: toContribution(
        "Control gain",
        "low",
        "This protects decision quality rather than creating direct revenue lift.",
        undefined,
        undefined,
        "Higher confidence and fewer false-positive actions"
      ),
      evidence: [
        metricEvidence("Selected conversions", `${round(selectedTotals.conversions)}`),
        metricEvidence("Search term rows", String(input.selectedSearchTerms.length)),
        metricEvidence("Product rows", String(input.selectedProducts.length)),
      ],
      timeframeContext: buildTimeframeContext(
        "Core verdict says confidence is capped more by visibility than by the selected period itself.",
        `${input.selectedLabel} is not the main problem; the bigger issue is missing or sparse signal.`,
        "Historical support remains limited until conversion and entity depth improve."
      ),
      affectedFamilies: ["non_brand_search", "shopping", "pmax_scaling"],
      diagnosticFlags: [
        ...(selectedTotals.conversions < 8 ? ["Sparse conversion volume"] : []),
        ...(input.selectedSearchTerms.length === 0 && hasFamily("non_brand_search")
          ? ["Thin search-term visibility"]
          : []),
        ...(hasFamily("pmax_scaling") && input.selectedProducts.length === 0
          ? ["Missing product-level visibility for PMax"]
          : []),
      ],
      prerequisites: ["Use diagnostics to temper confidence, not to stop all action"],
      playbookSteps: [
        "Prioritize broad structural fixes over micro-optimizations while data is thin.",
        "Re-evaluate once query, product, or conversion visibility improves.",
      ],
    });
  }

  const recommendations = recommendationPool.sort((a, b) => {
    const priorityScore = { high: 0, medium: 1, low: 2 };
    const decisionScore = { act: 0, test: 1, watch: 2 };
    const confidenceScore = { high: 0, medium: 1, low: 2 };
    return (
      priorityScore[a.priority] - priorityScore[b.priority] ||
      decisionScore[a.decisionState] - decisionScore[b.decisionState] ||
      confidenceScore[a.confidence] - confidenceScore[b.confidence]
    );
  });

  const sections: GoogleRecommendationSection[] = sectionOrder()
    .map((title) => ({
      id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title,
      recommendations: recommendations.filter((recommendation) => recommendation.strategyLayer === title),
    }))
    .filter((section) => section.recommendations.length > 0);

  const campaignRoles = buildCampaignRoleRows(selectedFamilies, recommendations);
  const headline = recommendations[0]?.title ?? "Google growth model is stable for now";
  const actRecommendationCount = recommendations.filter(
    (recommendation) => recommendation.decisionState === "act"
  ).length;

  return {
    summary: {
      headline,
      operatorNote:
        recommendations.length > 0
          ? `${recommendations.length} actionable Google recommendations are live. Highest priority: ${recommendations[0].title}.`
          : "No high-signal ecommerce Google recommendations were generated for this account.",
      demandMap:
        selectedFamilies.length > 0
          ? selectedFamilies
              .map(
                (family) =>
                  `${family.familyLabel} ${family.spendShare > 0 ? `${round(family.spendShare, 1)}% spend` : ""}`.trim()
              )
              .join(" • ")
          : "No active revenue lanes detected.",
      topPriority: recommendations[0]?.recommendedAction ?? "No immediate action required.",
      totalRecommendations: recommendations.length,
      actRecommendationCount,
      campaignRoles,
    },
    recommendations,
    sections,
  };
}
function assetMeta(row: AssetPerformanceRow) {
  return row as unknown as Record<string, unknown>;
}
