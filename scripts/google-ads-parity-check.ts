import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  getGoogleAdsCampaignsReport,
  getGoogleAdsOverviewSummaryAggregate,
  getGoogleAdsProductsReport,
  getGoogleAdsSearchIntelligenceReport,
} from "@/lib/google-ads/serving";
import {
  normalizeGoogleAdsQueryText,
  readGoogleAdsSearchQueryHotDailySupportRows,
} from "@/lib/google-ads/search-intelligence-storage";
import {
  readGoogleAdsAggregatedRange,
} from "@/lib/google-ads/warehouse";
import { analyzeProducts } from "@/lib/google-ads/tab-analysis";
import { classifySearchAction } from "@/lib/google-ads/reporting";
import { classifySearchIntent } from "@/lib/google-ads-intelligence";

interface ParsedCliArgs {
  businessId: string;
  startDate: string;
  endDate: string;
  jsonOut: string | null;
}

interface GoogleParityDiff {
  surface: string;
  kind:
    | "missing_current_row"
    | "missing_reference_row"
    | "field_mismatch"
    | "surface_status";
  key: string;
  field?: string;
  currentValue?: unknown;
  referenceValue?: unknown;
}

function parseArgs(argv: string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value =
      argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : "true";
    parsed.set(key, value);
    if (value !== "true") index += 1;
  }
  return parsed;
}

function parseGoogleParityCliArgs(argv: string[]): ParsedCliArgs {
  const args = parseArgs(argv);
  const businessId = args.get("business-id") ?? args.get("businessId");
  const startDate = args.get("start-date") ?? args.get("startDate");
  const endDate = args.get("end-date") ?? args.get("endDate");
  if (!businessId || !startDate || !endDate) {
    throw new Error(
      "Missing required args. Required: --business-id --start-date --end-date",
    );
  }
  return {
    businessId,
    startDate,
    endDate,
    jsonOut: args.get("json-out") ?? args.get("jsonOut") ?? null,
  };
}

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stableSerialize(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map((entry) => stableSerialize(entry));
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = stableSerialize((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function compareValues(
  currentValue: unknown,
  referenceValue: unknown,
  fieldPath: string,
  diffs: GoogleParityDiff[],
  surface: string,
  key: string,
  numericTolerance = 0.01,
) {
  const current = currentValue === undefined ? null : currentValue;
  const reference = referenceValue === undefined ? null : referenceValue;
  if (typeof current === "number" && typeof reference === "number") {
    if (Math.abs(current - reference) > numericTolerance) {
      diffs.push({
        surface,
        kind: "field_mismatch",
        key,
        field: fieldPath,
        currentValue: current,
        referenceValue: reference,
      });
    }
    return;
  }

  if (Array.isArray(current) || Array.isArray(reference)) {
    const currentArray = Array.isArray(current) ? current : [];
    const referenceArray = Array.isArray(reference) ? reference : [];
    if (currentArray.length !== referenceArray.length) {
      diffs.push({
        surface,
        kind: "field_mismatch",
        key,
        field: fieldPath,
        currentValue: stableSerialize(currentArray),
        referenceValue: stableSerialize(referenceArray),
      });
      return;
    }
    for (let index = 0; index < currentArray.length; index += 1) {
      compareValues(
        currentArray[index],
        referenceArray[index],
        `${fieldPath}[${index}]`,
        diffs,
        surface,
        key,
        numericTolerance,
      );
    }
    return;
  }

  if (
    current &&
    reference &&
    typeof current === "object" &&
    typeof reference === "object"
  ) {
    const keys = Array.from(
      new Set([
        ...Object.keys(current as Record<string, unknown>),
        ...Object.keys(reference as Record<string, unknown>),
      ]),
    ).sort();
    for (const childKey of keys) {
      compareValues(
        (current as Record<string, unknown>)[childKey],
        (reference as Record<string, unknown>)[childKey],
        fieldPath ? `${fieldPath}.${childKey}` : childKey,
        diffs,
        surface,
        key,
        numericTolerance,
      );
    }
    return;
  }

  if (Object.is(current, reference)) return;
  if (stableSerialize(current) === stableSerialize(reference)) return;
  diffs.push({
    surface,
    kind: "field_mismatch",
    key,
    field: fieldPath,
    currentValue: stableSerialize(current),
    referenceValue: stableSerialize(reference),
  });
}

function compareKeyedParityRows<T extends object>(input: {
  surface: string;
  keyField: string;
  currentRows: T[];
  referenceRows: T[];
  numericTolerance?: number;
}) {
  const currentMap = new Map<string, Record<string, unknown>>();
  const referenceMap = new Map<string, Record<string, unknown>>();
  for (const row of input.currentRows) {
    const record = row as Record<string, unknown>;
    currentMap.set(String(record[input.keyField] ?? ""), record);
  }
  for (const row of input.referenceRows) {
    const record = row as Record<string, unknown>;
    referenceMap.set(String(record[input.keyField] ?? ""), record);
  }
  const keys = Array.from(new Set([...currentMap.keys(), ...referenceMap.keys()])).sort();
  const blockingDiffs: GoogleParityDiff[] = [];
  for (const key of keys) {
    const currentRow = currentMap.get(key);
    const referenceRow = referenceMap.get(key);
    if (!currentRow) {
      blockingDiffs.push({
        surface: input.surface,
        kind: "missing_current_row",
        key,
        referenceValue: stableSerialize(referenceRow),
      });
      continue;
    }
    if (!referenceRow) {
      blockingDiffs.push({
        surface: input.surface,
        kind: "missing_reference_row",
        key,
        currentValue: stableSerialize(currentRow),
      });
      continue;
    }
    const fieldKeys = Array.from(
      new Set([...Object.keys(currentRow), ...Object.keys(referenceRow)]),
    ).sort();
    for (const fieldKey of fieldKeys) {
      compareValues(
        currentRow[fieldKey],
        referenceRow[fieldKey],
        fieldKey,
        blockingDiffs,
        input.surface,
        key,
        input.numericTolerance,
      );
    }
  }
  return {
    surface: input.surface,
    currentRowCount: input.currentRows.length,
    referenceRowCount: input.referenceRows.length,
    blockingDiffs,
    nonBlockingDiffs: [] as GoogleParityDiff[],
  };
}

function normalizeOverviewRow(source: Record<string, unknown>) {
  return {
    key: "overview",
    spend: toNumber(source.spend),
    revenue: toNumber(source.revenue),
    conversions: toNumber(source.conversions),
    roas: toNumber(source.roas),
    cpa: toNumber(source.cpa),
    cpc: toNumber(source.cpc),
    ctr: toNumber(source.ctr),
    impressions: toNumber(source.impressions),
    clicks: toNumber(source.clicks),
  };
}

function normalizeCampaignRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    id: String(row.id ?? row.entityKey ?? ""),
    name: String(row.name ?? row.campaignName ?? row.entityLabel ?? row.id ?? ""),
    status: row.status == null ? null : String(row.status),
    channel: row.channel == null ? null : String(row.channel),
    spend: toNumber(row.spend),
    revenue: toNumber(row.revenue),
    conversions: toNumber(row.conversions),
    impressions: toNumber(row.impressions),
    clicks: toNumber(row.clicks),
    roas: toNumber(row.roas),
    cpa: toNumber(row.cpa),
    ctr: toNumber(row.ctr),
    cpc: row.cpc == null ? null : toNumber(row.cpc),
    conversionRate:
      row.conversionRate == null ? null : toNumber(row.conversionRate),
  }));
}

function normalizeProductRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    id: String(row.id ?? row.entityKey ?? row.productItemId ?? ""),
    name: String(
      row.name ?? row.productTitle ?? row.title ?? row.entityLabel ?? row.id ?? "",
    ),
    status: row.status == null ? null : String(row.status),
    campaignId: row.campaignId == null ? null : String(row.campaignId),
    campaignName: row.campaignName == null ? null : String(row.campaignName),
    spend: toNumber(row.spend),
    revenue: toNumber(row.revenue),
    conversions: toNumber(row.conversions),
    impressions: toNumber(row.impressions),
    clicks: toNumber(row.clicks),
    roas: toNumber(row.roas),
    classification: row.classification == null ? null : String(row.classification),
  }));
}

function normalizeSearchRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    key: String(row.key ?? ""),
    searchTerm: String(row.searchTerm ?? ""),
    campaignId: row.campaignId == null ? null : String(row.campaignId),
    campaignName: row.campaignName == null ? null : String(row.campaignName),
    adGroupId: row.adGroupId == null ? null : String(row.adGroupId),
    adGroupName: row.adGroupName == null ? null : String(row.adGroupName),
    status: row.status == null ? null : String(row.status),
    source: row.source == null ? null : String(row.source),
    matchSource: row.matchSource == null ? null : String(row.matchSource),
    classification: row.classification == null ? null : String(row.classification),
    intentClass: row.intentClass == null ? null : String(row.intentClass),
    ownershipClass: row.ownershipClass == null ? null : String(row.ownershipClass),
    isKeyword: Boolean(row.isKeyword),
    wasteFlag: Boolean(row.wasteFlag),
    keywordOpportunityFlag: Boolean(row.keywordOpportunityFlag),
    negativeKeywordFlag: Boolean(row.negativeKeywordFlag),
    clusterId: row.clusterId == null ? null : String(row.clusterId),
    recommendation: row.recommendation == null ? null : String(row.recommendation),
    spend: toNumber(row.spend),
    revenue: toNumber(row.revenue),
    conversions: toNumber(row.conversions),
    impressions: toNumber(row.impressions),
    clicks: toNumber(row.clicks),
    roas: toNumber(row.roas),
    cpa: toNumber(row.cpa),
    ctr: toNumber(row.ctr),
    cpc: row.cpc == null ? null : toNumber(row.cpc),
    conversionRate:
      row.conversionRate == null ? null : toNumber(row.conversionRate),
  }));
}

function buildOverviewKpisFromRows(rows: Array<Record<string, unknown>>) {
  const spend = rows.reduce((sum, row) => sum + toNumber(row.spend), 0);
  const revenue = rows.reduce((sum, row) => sum + toNumber(row.revenue), 0);
  const conversions = rows.reduce((sum, row) => sum + toNumber(row.conversions), 0);
  const clicks = rows.reduce((sum, row) => sum + toNumber(row.clicks), 0);
  const impressions = rows.reduce((sum, row) => sum + toNumber(row.impressions), 0);
  const roas = spend > 0 ? revenue / spend : 0;
  const cpa = conversions > 0 ? spend / conversions : 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  return {
    spend: Number(spend.toFixed(2)),
    conversions: Number(conversions.toFixed(2)),
    revenue: Number(revenue.toFixed(2)),
    roas: Number(roas.toFixed(2)),
    cpa: Number(cpa.toFixed(2)),
    cpc: Number(cpc.toFixed(2)),
    ctr: Number(ctr.toFixed(2)),
    impressions,
    clicks,
  };
}

function shouldFallbackGoogleOverviewToCampaignScope(input: {
  account: ReturnType<typeof buildOverviewKpisFromRows>;
  campaign: ReturnType<typeof buildOverviewKpisFromRows>;
}) {
  const spendGap = input.campaign.spend - input.account.spend;
  const revenueGap = input.campaign.revenue - input.account.revenue;
  const conversionGap = input.campaign.conversions - input.account.conversions;
  const spendRatio =
    input.account.spend > 0
      ? input.campaign.spend / input.account.spend
      : input.campaign.spend > 0
        ? Infinity
        : 1;
  const revenueRatio =
    input.account.revenue > 0
      ? input.campaign.revenue / input.account.revenue
      : input.campaign.revenue > 0
        ? Infinity
        : 1;

  return (
    (spendGap > 50 && spendRatio > 1.2) ||
    (revenueGap > 50 && revenueRatio > 1.2) ||
    conversionGap >= 3
  );
}

function deriveBrandTerms(rows: Array<{ campaignName?: string | null }>) {
  return Array.from(
    new Set(
      rows
        .filter((row) => String(row.campaignName ?? "").toLowerCase().includes("brand"))
        .flatMap((row) =>
          String(row.campaignName ?? "")
            .toLowerCase()
            .replace(/[^a-z0-9\\s-]+/g, " ")
            .split(/\\s+/)
            .filter(
              (token) =>
                token.length >= 4 &&
                token !== "brand" &&
                token !== "search",
            ),
        ),
    ),
  );
}

async function buildReferenceOverviewRow(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const [accountRows, campaignRows] = await Promise.all([
    readGoogleAdsAggregatedRange({
      scope: "account_daily",
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      disableDimensionOverlay: true,
    }),
    readGoogleAdsAggregatedRange({
      scope: "campaign_daily",
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      disableDimensionOverlay: true,
    }),
  ]);
  const accountKpis = buildOverviewKpisFromRows(accountRows);
  const campaignKpis = buildOverviewKpisFromRows(campaignRows);
  return normalizeOverviewRow(
    shouldFallbackGoogleOverviewToCampaignScope({
      account: accountKpis,
      campaign: campaignKpis,
    })
      ? campaignKpis
      : accountKpis,
  );
}

async function buildReferenceSearchRows(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const [hotRows, keywordRows, productRows] = await Promise.all([
    readGoogleAdsSearchQueryHotDailySupportRows({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
    }),
    readGoogleAdsAggregatedRange({
      scope: "keyword_daily",
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      disableDimensionOverlay: true,
    }),
    readGoogleAdsAggregatedRange({
      scope: "product_daily",
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
    }),
  ]);

  const keywordSet = new Set(
    keywordRows
      .map((row) =>
        normalizeGoogleAdsQueryText(
          String(
            row.keywordText ??
              row.keyword ??
              row.entityLabel ??
              row.name ??
              "",
          ),
        ),
      )
      .filter(Boolean),
  );
  const productTerms = Array.from(
    new Set(
      productRows
        .map((row) =>
          String(
            row.name ??
              row.productTitle ??
              row.title ??
              row.entityLabel ??
              "",
          ).trim(),
        )
        .filter((value) => value.length >= 4),
    ),
  );
  const brandTerms = deriveBrandTerms(
    hotRows.map((row) => ({ campaignName: row.campaignName })),
  );

  const byTerm = new Map<
    string,
    {
      key: string;
      searchTerm: string;
      campaignId: string | null;
      campaignName: string | null;
      adGroupId: string | null;
      adGroupName: string | null;
      clusterId: string;
      intentClass: string;
      ownershipClass: string | null;
      spend: number;
      revenue: number;
      conversions: number;
      impressions: number;
      clicks: number;
      sourceSnapshotId: string | null;
    }
  >();

  for (const row of hotRows) {
    const searchTerm = String(
      row.displayQuery ?? row.normalizedQuery ?? row.queryHash,
    ).trim();
    if (!searchTerm) continue;
    const normalizedQuery = normalizeGoogleAdsQueryText(searchTerm);
    if (!normalizedQuery) continue;
    const key = [
      row.providerAccountId,
      row.campaignId ?? "",
      row.adGroupId ?? "",
      normalizedQuery,
    ].join(":");
    const current = byTerm.get(key);
    if (!current) {
      byTerm.set(key, {
        key,
        searchTerm,
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        adGroupId: row.adGroupId,
        adGroupName: row.adGroupName,
        clusterId: row.clusterKey || row.clusterLabel || normalizedQuery,
        intentClass: row.intentClass ?? classifySearchIntent(searchTerm),
        ownershipClass: row.ownershipClass ?? null,
        spend: row.spend,
        revenue: row.revenue,
        conversions: row.conversions,
        impressions: row.impressions,
        clicks: row.clicks,
        sourceSnapshotId: row.sourceSnapshotId,
      });
      continue;
    }
    current.spend += row.spend;
    current.revenue += row.revenue;
    current.conversions += row.conversions;
    current.impressions += row.impressions;
    current.clicks += row.clicks;
    if (row.campaignName) current.campaignName = row.campaignName;
    if (row.adGroupName) current.adGroupName = row.adGroupName;
    if (!current.sourceSnapshotId && row.sourceSnapshotId) {
      current.sourceSnapshotId = row.sourceSnapshotId;
    }
  }

  return Array.from(byTerm.values())
    .map((row) => {
      const normalizedQuery = normalizeGoogleAdsQueryText(row.searchTerm);
      const isKeyword = keywordSet.has(normalizedQuery);
      const spend = Number(row.spend.toFixed(2));
      const revenue = Number(row.revenue.toFixed(2));
      const conversions = Number(row.conversions.toFixed(2));
      const impressions = Math.round(row.impressions);
      const clicks = Math.round(row.clicks);
      const roas = spend > 0 ? Number((revenue / spend).toFixed(2)) : 0;
      const cpa =
        conversions > 0 ? Number((spend / conversions).toFixed(2)) : 0;
      const ctr =
        impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
      const cpc = clicks > 0 ? Number((spend / clicks).toFixed(2)) : null;
      const conversionRate =
        clicks > 0
          ? Number(((conversions / clicks) * 100).toFixed(2))
          : null;
      const wasteFlag = spend > 20 && conversions === 0;
      const keywordOpportunityFlag = !isKeyword && conversions >= 2;
      const negativeKeywordFlag =
        clicks >= 20 && conversions === 0 && spend > 10;
      return {
        key: row.key,
        searchTerm: row.searchTerm,
        status: "HOT_WINDOW",
        campaignId: row.campaignId,
        campaignName: row.campaignName ?? "",
        adGroupId: row.adGroupId,
        adGroupName: row.adGroupName ?? "",
        matchSource: "SEARCH",
        source: "search_query_hot_daily",
        impressions,
        clicks,
        spend,
        conversions,
        revenue,
        roas,
        cpa,
        ctr,
        cpc,
        conversionRate,
        classification: row.intentClass,
        intentClass: row.intentClass,
        isKeyword,
        wasteFlag,
        keywordOpportunityFlag,
        negativeKeywordFlag,
        clusterId: row.clusterId,
        ownershipClass: row.ownershipClass,
        recommendation: classifySearchAction(
          {
            searchTerm: row.searchTerm,
            campaign: row.campaignName ?? "",
            isKeyword,
            conversions,
            spend,
            clicks,
            roas,
            conversionRate,
          },
          brandTerms,
          productTerms,
        ),
      };
    })
    .sort((left, right) => right.spend - left.spend);
}

export async function buildGoogleAdsParityArtifact(input: ParsedCliArgs) {
  const reportParams = {
    businessId: input.businessId,
    accountId: null,
    dateRange: "custom",
    customStart: input.startDate,
    customEnd: input.endDate,
  } as const;
  const campaignParams = {
    ...reportParams,
    compareMode: "none",
  } as const;

  const [
    currentOverview,
    currentCampaigns,
    currentSearch,
    currentProducts,
    referenceOverview,
    referenceCampaignsRaw,
    referenceProductsRaw,
    referenceSearchRaw,
  ] = await Promise.all([
    getGoogleAdsOverviewSummaryAggregate(reportParams),
    getGoogleAdsCampaignsReport(campaignParams as never),
    getGoogleAdsSearchIntelligenceReport(reportParams),
    getGoogleAdsProductsReport(reportParams),
    buildReferenceOverviewRow(input),
    readGoogleAdsAggregatedRange({
      scope: "campaign_daily",
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      disableDimensionOverlay: true,
    }),
    readGoogleAdsAggregatedRange({
      scope: "product_daily",
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
    }),
    buildReferenceSearchRows(input),
  ]);

  const referenceCampaigns = normalizeCampaignRows(referenceCampaignsRaw);
  const referenceProducts = normalizeProductRows(
    analyzeProducts(referenceProductsRaw as Array<Record<string, unknown>>).rows,
  );

  const currentOverviewRows = [
    normalizeOverviewRow(currentOverview.kpis as Record<string, unknown>),
  ];
  const referenceOverviewRows = [referenceOverview];
  const currentCampaignRows = normalizeCampaignRows(
    currentCampaigns.rows as Array<Record<string, unknown>>,
  );
  const currentProductRows = normalizeProductRows(
    currentProducts.rows as Array<Record<string, unknown>>,
  );
  const currentSearchRows = normalizeSearchRows(
    currentSearch.rows as Array<Record<string, unknown>>,
  );
  const referenceSearchRows = normalizeSearchRows(referenceSearchRaw);

  const currentAdvisorRows = [
    {
      key: "selected_window",
      selectedCampaigns: currentCampaignRows.length,
      selectedSearchTerms: currentSearchRows.length,
      selectedProducts: currentProductRows.length,
      spend: Number(
        currentCampaignRows.reduce((sum, row) => sum + toNumber(row.spend), 0).toFixed(2),
      ),
      revenue: Number(
        currentCampaignRows.reduce((sum, row) => sum + toNumber(row.revenue), 0).toFixed(2),
      ),
      conversions: Number(
        currentCampaignRows
          .reduce((sum, row) => sum + toNumber(row.conversions), 0)
          .toFixed(2),
      ),
      roas: (() => {
        const spend = currentCampaignRows.reduce((sum, row) => sum + toNumber(row.spend), 0);
        const revenue = currentCampaignRows.reduce((sum, row) => sum + toNumber(row.revenue), 0);
        return spend > 0 ? Number((revenue / spend).toFixed(2)) : 0;
      })(),
    },
  ];
  const referenceAdvisorRows = [
    {
      key: "selected_window",
      selectedCampaigns: referenceCampaigns.length,
      selectedSearchTerms: referenceSearchRows.length,
      selectedProducts: referenceProducts.length,
      spend: Number(
        referenceCampaigns.reduce((sum, row) => sum + toNumber(row.spend), 0).toFixed(2),
      ),
      revenue: Number(
        referenceCampaigns.reduce((sum, row) => sum + toNumber(row.revenue), 0).toFixed(2),
      ),
      conversions: Number(
        referenceCampaigns
          .reduce((sum, row) => sum + toNumber(row.conversions), 0)
          .toFixed(2),
      ),
      roas: (() => {
        const spend = referenceCampaigns.reduce((sum, row) => sum + toNumber(row.spend), 0);
        const revenue = referenceCampaigns.reduce((sum, row) => sum + toNumber(row.revenue), 0);
        return spend > 0 ? Number((revenue / spend).toFixed(2)) : 0;
      })(),
    },
  ];

  const overviewSurface = compareKeyedParityRows({
    surface: "overview",
    keyField: "key",
    currentRows: currentOverviewRows,
    referenceRows: referenceOverviewRows,
  });
  const campaignSurface = compareKeyedParityRows({
    surface: "campaigns",
    keyField: "id",
    currentRows: currentCampaignRows,
    referenceRows: referenceCampaigns,
  });
  const searchSurface = compareKeyedParityRows({
    surface: "search_intelligence",
    keyField: "key",
    currentRows: currentSearchRows,
    referenceRows: referenceSearchRows,
  });
  const productSurface = compareKeyedParityRows({
    surface: "products",
    keyField: "id",
    currentRows: currentProductRows,
    referenceRows: referenceProducts,
  });
  const advisorSurface = compareKeyedParityRows({
    surface: "advisor",
    keyField: "key",
    currentRows: currentAdvisorRows,
    referenceRows: referenceAdvisorRows,
  });

  const blockingDiffs = [
    ...(currentOverview.meta?.warnings?.length
      ? [
          {
            surface: "overview",
            kind: "surface_status" as const,
            key: "overview",
            currentValue: currentOverview.meta.warnings,
            referenceValue: [],
          },
        ]
      : []),
    ...overviewSurface.blockingDiffs,
    ...campaignSurface.blockingDiffs,
    ...searchSurface.blockingDiffs,
    ...productSurface.blockingDiffs,
    ...advisorSurface.blockingDiffs,
  ];

  return stableSerialize({
    capturedAt: new Date().toISOString(),
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    blockingDiffs,
    nonBlockingDiffs: [] as GoogleParityDiff[],
    summary: {
      blockingDiffCount: blockingDiffs.length,
      surfaces: [
        overviewSurface,
        campaignSurface,
        searchSurface,
        productSurface,
        advisorSurface,
      ].map((surface) => ({
        surface: surface.surface,
        currentRowCount: surface.currentRowCount,
        referenceRowCount: surface.referenceRowCount,
        blockingDiffCount: surface.blockingDiffs.length,
      })),
    },
  });
}

async function main() {
  const parsed = parseGoogleParityCliArgs(process.argv.slice(2));
  const artifact = await buildGoogleAdsParityArtifact(parsed);
  if (parsed.jsonOut) {
    writeFileSync(resolve(parsed.jsonOut), JSON.stringify(artifact, null, 2));
  }
  console.log(JSON.stringify(artifact, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
