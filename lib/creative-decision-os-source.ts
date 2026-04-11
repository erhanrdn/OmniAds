import type { NextRequest } from "next/server";
import { getBusinessCommercialTruthSnapshot } from "@/lib/business-commercial";
import { buildAccountOperatingMode } from "@/lib/business-operating-mode";
import {
  getDemoMetaAdSets,
  getDemoMetaBreakdowns,
  getDemoMetaCampaigns,
  getDemoMetaCreatives,
  isDemoBusinessId,
} from "@/lib/demo-business";
import {
  buildCreativeDecisionOs,
  buildEmptyCreativeHistoricalAnalysis,
  type CreativeDecisionOsHistoricalWindows,
  type CreativeDecisionOsInputRow,
  type CreativeDecisionOsV1Response,
} from "@/lib/creative-decision-os";
import { buildCreativeHistoricalAnalysis } from "@/lib/creative-historical-intelligence";
import { addDaysToIsoDate, META_WAREHOUSE_HISTORY_DAYS } from "@/lib/meta/history";
import { getMetaCreativesApiPayload } from "@/lib/meta/creatives-api";
import {
  getMetaDecisionSourceSnapshot,
  getMetaDecisionWindowContext,
} from "@/lib/meta/operator-decision-source";
import { mapApiRowToUiRow } from "@/app/(dashboard)/creatives/page-support";
import type { MetaCreativeApiRow } from "@/app/api/meta/creatives/route";
import type { MetaCreativeRow } from "@/components/creatives/metricConfig";

async function fetchCreativeRowsForWindow(input: {
  request: NextRequest;
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const payload = await getMetaCreativesApiPayload({
    request: input.request,
    requestStartedAt: Date.now(),
    businessId: input.businessId,
    mediaMode: "metadata",
    groupBy: "creative",
    format: "all",
    sort: "spend",
    start: input.startDate,
    end: input.endDate,
    debugPreview: false,
    debugThumbnail: false,
    debugPerf: false,
    snapshotBypass: false,
    snapshotWarm: false,
    enableCopyRecovery: false,
    enableCreativeBasicsFallback: false,
    enableCreativeDetails: false,
    enableThumbnailBackfill: false,
    enableCardThumbnailBackfill: false,
    enableImageHashLookup: false,
    enableMediaRecovery: false,
    enableMediaCache: true,
    enableDeepAudit: false,
    perAccountSampleLimit: 10,
  });

  return ((payload.rows ?? []) as MetaCreativeApiRow[]).map(mapApiRowToUiRow);
}

function toHistoricalWindow(row: MetaCreativeRow) {
  return {
    spend: row.spend,
    purchaseValue: row.purchaseValue,
    roas: row.roas,
    cpa: row.cpa,
    ctr: row.ctrAll,
    purchases: row.purchases,
    impressions: row.impressions,
    linkClicks: row.linkClicks,
    hookRate: row.thumbstop,
    holdRate: row.video100,
    video25Rate: row.video25,
    watchRate: row.video50,
    video75Rate: row.video75,
    clickToPurchaseRate: row.clickToPurchase,
    atcToPurchaseRate: row.atcToPurchaseRatio,
  };
}

function buildHistoryById(
  input: Partial<Record<keyof CreativeDecisionOsHistoricalWindows, MetaCreativeRow[]>>,
) {
  const map = new Map<string, CreativeDecisionOsHistoricalWindows>();
  for (const [windowKey, rows] of Object.entries(input) as Array<
    [keyof CreativeDecisionOsHistoricalWindows, MetaCreativeRow[] | undefined]
  >) {
    for (const row of rows ?? []) {
      const current = map.get(row.id) ?? {};
      current[windowKey] = toHistoricalWindow(row);
      map.set(row.id, current);
    }
  }
  return map;
}

function calculateCreativeAgeDays(launchDate: string) {
  const launchMs = Date.parse(`${launchDate}T00:00:00.000Z`);
  if (!Number.isFinite(launchMs)) return 0;
  const diffMs = Date.now() - launchMs;
  return Math.max(0, Math.round(diffMs / 86_400_000));
}

function toDecisionInputRow(
  row: MetaCreativeRow,
  history: CreativeDecisionOsHistoricalWindows | null,
): CreativeDecisionOsInputRow {
  const frequency = Number((row as MetaCreativeRow & { frequency?: number }).frequency ?? 0);
  const creativeAgeDays = calculateCreativeAgeDays(row.launchDate);

  return {
    creativeId: row.id,
    name: row.name,
    creativeFormat: row.format,
    previewUrl: row.previewUrl ?? null,
    imageUrl: row.imageUrl ?? null,
    creativeAgeDays,
    spendVelocity: row.spend / Math.max(1, creativeAgeDays || 1),
    frequency,
    spend: row.spend,
    purchaseValue: row.purchaseValue,
    roas: row.roas,
    cpa: row.cpa,
    ctr: row.ctrAll,
    cpm: row.cpm,
    cpc: row.cpcLink,
    purchases: row.purchases,
    impressions: row.impressions,
    linkClicks: row.linkClicks,
    hookRate: row.thumbstop,
    holdRate: row.video100,
    video25Rate: row.video25,
    watchRate: row.video50,
    video75Rate: row.video75,
    clickToPurchaseRate: row.clickToPurchase,
    atcToPurchaseRate: row.atcToPurchaseRatio,
    copyText: row.copyText ?? null,
    copyVariants: row.copyVariants ?? [],
    headlineVariants: row.headlineVariants ?? [],
    descriptionVariants: row.descriptionVariants ?? [],
    objectStoryId: row.objectStoryId ?? null,
    effectiveObjectStoryId: row.effectiveObjectStoryId ?? null,
    postId: row.postId ?? null,
    accountId: row.accountId ?? null,
    accountName: row.accountName ?? null,
    campaignId: row.campaignId ?? null,
    campaignName: row.campaignName ?? null,
    adSetId: row.adSetId ?? null,
    adSetName: row.adSetName ?? null,
    taxonomyPrimaryLabel: row.creativePrimaryLabel ?? null,
    taxonomySecondaryLabel: row.creativeSecondaryLabel ?? null,
    taxonomyVisualFormat: row.creativeVisualFormat ?? null,
    aiTags: row.aiTags ?? {},
    historicalWindows: history,
  };
}

function buildDemoHistoryById(rows: MetaCreativeRow[]) {
  const map = new Map<string, CreativeDecisionOsHistoricalWindows>();

  rows.forEach((row, index) => {
    const strongBase = {
      spend: row.spend * 0.9,
      purchaseValue: row.purchaseValue * 1.12,
      roas: row.roas * 1.18,
      cpa: row.cpa * 0.84,
      ctr: row.ctrAll * 1.08,
      purchases: row.purchases + 2,
      impressions: row.impressions * 0.92,
      linkClicks: row.linkClicks * 0.96,
      hookRate: row.thumbstop * 1.08,
      holdRate: row.video100 * 1.04,
      video25Rate: row.video25 * 1.03,
      watchRate: row.video50 * 1.03,
      video75Rate: row.video75 * 1.03,
      clickToPurchaseRate: row.clickToPurchase * 1.08,
      atcToPurchaseRate: row.atcToPurchaseRatio * 1.05,
    };

    let history: CreativeDecisionOsHistoricalWindows = {
      last7: strongBase,
      last30: strongBase,
      last90: strongBase,
      allHistory: strongBase,
    };

    if (index === 2) {
      history = {
        last7: {
          ...strongBase,
          roas: row.roas * 1.35,
          ctr: row.ctrAll * 1.2,
          clickToPurchaseRate: row.clickToPurchase * 1.22,
        },
        last30: {
          ...strongBase,
          roas: row.roas * 1.4,
          ctr: row.ctrAll * 1.26,
          clickToPurchaseRate: row.clickToPurchase * 1.28,
        },
        last90: {
          ...strongBase,
          roas: row.roas * 1.32,
        },
        allHistory: {
          ...strongBase,
          roas: row.roas * 1.3,
        },
      };
    } else if (index === 4) {
      history = {};
    } else if (index === 5) {
      history = {
        last30: {
          ...strongBase,
          roas: row.roas * 2.1,
          ctr: row.ctrAll * 1.45,
          clickToPurchaseRate: row.clickToPurchase * 1.9,
          purchases: row.purchases + 9,
        },
        last90: {
          ...strongBase,
          roas: row.roas * 2.0,
          purchases: row.purchases + 12,
        },
        allHistory: {
          ...strongBase,
          roas: row.roas * 1.92,
          purchases: row.purchases + 14,
        },
      };
    } else if (index === 6) {
      history = {
        last30: {
          ...strongBase,
          roas: row.roas * 0.86,
          ctr: row.ctrAll * 0.9,
        },
      };
    }

    map.set(row.id, history);
  });

  return map;
}

export async function getCreativeDecisionOsForRange(input: {
  request: NextRequest;
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<CreativeDecisionOsV1Response> {
  const decisionContext = await getMetaDecisionWindowContext({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  let decisionRows: MetaCreativeRow[] = [];
  let selectedPeriodRows: MetaCreativeRow[] | null = null;
  let historyById = new Map<string, CreativeDecisionOsHistoricalWindows>();
  let campaigns: Awaited<ReturnType<typeof getMetaDecisionSourceSnapshot>>["campaigns"]["rows"] = [];
  let adSets: Awaited<ReturnType<typeof getMetaDecisionSourceSnapshot>>["adSets"]["rows"] = [];
  let breakdowns: Awaited<ReturnType<typeof getMetaDecisionSourceSnapshot>>["breakdowns"] = {
    age: [],
    location: [],
    placement: [],
    budget: { campaign: [], adset: [] },
    audience: { available: false },
    products: { available: false },
  };

  if (isDemoBusinessId(input.businessId)) {
    decisionRows = (getDemoMetaCreatives().rows as unknown as MetaCreativeApiRow[]).map(
      mapApiRowToUiRow,
    );
    selectedPeriodRows = decisionRows;
    historyById = buildDemoHistoryById(decisionRows);
    campaigns = getDemoMetaCampaigns().rows as Awaited<
      ReturnType<typeof getMetaDecisionSourceSnapshot>
    >["campaigns"]["rows"];
    adSets = getDemoMetaAdSets();
    breakdowns = getDemoMetaBreakdowns() as Awaited<
      ReturnType<typeof getMetaDecisionSourceSnapshot>
    >["breakdowns"];
  } else {
    const primaryWindow = decisionContext.decisionWindows.primary30d;
    const windowDefs = {
      last3: { startDate: addDaysToIsoDate(decisionContext.decisionAsOf, -2), endDate: decisionContext.decisionAsOf },
      last7: { startDate: addDaysToIsoDate(decisionContext.decisionAsOf, -6), endDate: decisionContext.decisionAsOf },
      last14: { startDate: addDaysToIsoDate(decisionContext.decisionAsOf, -13), endDate: decisionContext.decisionAsOf },
      last30: { startDate: primaryWindow.startDate, endDate: primaryWindow.endDate },
      last90: { startDate: addDaysToIsoDate(decisionContext.decisionAsOf, -89), endDate: decisionContext.decisionAsOf },
      allHistory: {
        startDate: addDaysToIsoDate(decisionContext.decisionAsOf, -(META_WAREHOUSE_HISTORY_DAYS - 1)),
        endDate: decisionContext.decisionAsOf,
      },
    } satisfies Record<
      keyof CreativeDecisionOsHistoricalWindows,
      { startDate: string; endDate: string }
    >;

    const [
      primary,
      last3,
      last7,
      last14,
      last30,
      last90,
      allHistory,
      decisionSnapshot,
      selectedPeriod,
    ] = await Promise.all([
      fetchCreativeRowsForWindow({
        request: input.request,
        businessId: input.businessId,
        startDate: primaryWindow.startDate,
        endDate: primaryWindow.endDate,
      }),
      fetchCreativeRowsForWindow({ request: input.request, businessId: input.businessId, ...windowDefs.last3 }),
      fetchCreativeRowsForWindow({ request: input.request, businessId: input.businessId, ...windowDefs.last7 }),
      fetchCreativeRowsForWindow({ request: input.request, businessId: input.businessId, ...windowDefs.last14 }),
      fetchCreativeRowsForWindow({ request: input.request, businessId: input.businessId, ...windowDefs.last30 }),
      fetchCreativeRowsForWindow({ request: input.request, businessId: input.businessId, ...windowDefs.last90 }),
      fetchCreativeRowsForWindow({ request: input.request, businessId: input.businessId, ...windowDefs.allHistory }),
      getMetaDecisionSourceSnapshot({
        businessId: input.businessId,
        decisionWindows: decisionContext.decisionWindows,
      }),
      fetchCreativeRowsForWindow({
        request: input.request,
        businessId: input.businessId,
        startDate: input.startDate,
        endDate: input.endDate,
      }).catch(() => null),
    ]);

    decisionRows = primary;
    selectedPeriodRows = selectedPeriod;
    historyById = buildHistoryById({
      last3,
      last7,
      last14,
      last30,
      last90,
      allHistory,
    });
    campaigns = decisionSnapshot.campaigns.rows ?? [];
    adSets = decisionSnapshot.adSets.rows ?? [];
    breakdowns = decisionSnapshot.breakdowns;
  }

  const snapshot = await getBusinessCommercialTruthSnapshot(input.businessId);
  const operatingMode = buildAccountOperatingMode({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    analyticsWindow: decisionContext.analyticsWindow,
    decisionWindows: decisionContext.decisionWindows,
    historicalMemory: decisionContext.historicalMemory,
    decisionAsOf: decisionContext.decisionAsOf,
    snapshot,
    campaigns: { rows: campaigns },
    breakdowns,
  });

  const historicalAnalysis =
    selectedPeriodRows && selectedPeriodRows.length > 0
      ? buildCreativeHistoricalAnalysis({
          startDate: input.startDate,
          endDate: input.endDate,
          rows: selectedPeriodRows.map((row) => toDecisionInputRow(row, null)),
        })
      : buildEmptyCreativeHistoricalAnalysis({
          startDate: input.startDate,
          endDate: input.endDate,
        });

  return {
    ...buildCreativeDecisionOs({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      analyticsWindow: decisionContext.analyticsWindow,
      decisionWindows: decisionContext.decisionWindows,
      historicalMemory: decisionContext.historicalMemory,
      decisionAsOf: decisionContext.decisionAsOf,
      rows: decisionRows.map((row) => toDecisionInputRow(row, historyById.get(row.id) ?? null)),
      campaigns,
      adSets,
      breakdowns: {
        location: breakdowns.location ?? [],
      },
      commercialTruth: snapshot,
      operatingMode,
    }),
    historicalAnalysis,
  };
}
