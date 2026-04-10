import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
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
  type CreativeDecisionOsHistoricalWindows,
  type CreativeDecisionOsInputRow,
  type CreativeDecisionOsV1Response,
} from "@/lib/creative-decision-os";
import { isCreativeDecisionOsV1EnabledForBusiness } from "@/lib/creative-decision-os-config";
import { addDaysToIsoDate, META_WAREHOUSE_HISTORY_DAYS } from "@/lib/meta/history";
import { getMetaAdSetsForRange } from "@/lib/meta/adsets-source";
import { getMetaBreakdownsForRange } from "@/lib/meta/breakdowns-source";
import { getMetaCampaignsForRange } from "@/lib/meta/campaigns-source";
import { getMetaCreativesApiPayload } from "@/lib/meta/creatives-api";
import { mapApiRowToUiRow } from "@/app/(dashboard)/creatives/page-support";
import type { MetaCreativeApiRow } from "@/app/api/meta/creatives/route";
import type { MetaCreativeRow } from "@/components/creatives/metricConfig";

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

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

function buildHistoryById(input: Partial<Record<keyof CreativeDecisionOsHistoricalWindows, MetaCreativeRow[]>>) {
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
  return {
    creativeId: row.id,
    name: row.name,
    creativeFormat: row.format,
    creativeAgeDays: calculateCreativeAgeDays(row.launchDate),
    spendVelocity: row.spend / Math.max(1, calculateCreativeAgeDays(row.launchDate) || 1),
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

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json(
      {
        error: "missing_business_id",
        message: "businessId query parameter is required.",
      },
      { status: 400 },
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  if (!isCreativeDecisionOsV1EnabledForBusiness(businessId)) {
    return NextResponse.json(
      {
        error: "creative_decision_os_disabled",
        message: "Creative Decision OS is feature-gated for this workspace.",
      },
      { status: 404 },
    );
  }

  const startDate =
    request.nextUrl.searchParams.get("startDate") ?? toISODate(daysAgo(29));
  const endDate =
    request.nextUrl.searchParams.get("endDate") ?? toISODate(new Date());

  let selectedRows: MetaCreativeRow[] = [];
  let historyById = new Map<string, CreativeDecisionOsHistoricalWindows>();
  let campaigns: Awaited<ReturnType<typeof getMetaCampaignsForRange>>["rows"] = [];
  let adSets: Awaited<ReturnType<typeof getMetaAdSetsForRange>>["rows"] = [];
  let breakdowns: Awaited<ReturnType<typeof getMetaBreakdownsForRange>> = {
    age: [],
    location: [],
    placement: [],
    budget: { campaign: [], adset: [] },
    audience: { available: false },
    products: { available: false },
  };

  if (isDemoBusinessId(businessId)) {
    selectedRows = (getDemoMetaCreatives().rows as unknown as MetaCreativeApiRow[]).map(mapApiRowToUiRow);
    historyById = buildDemoHistoryById(selectedRows);
    campaigns = getDemoMetaCampaigns().rows as Awaited<ReturnType<typeof getMetaCampaignsForRange>>["rows"];
    adSets = getDemoMetaAdSets();
    breakdowns = getDemoMetaBreakdowns() as Awaited<ReturnType<typeof getMetaBreakdownsForRange>>;
  } else {
    const windowDefs = {
      last3: { startDate: addDaysToIsoDate(endDate, -2), endDate },
      last7: { startDate: addDaysToIsoDate(endDate, -6), endDate },
      last14: { startDate: addDaysToIsoDate(endDate, -13), endDate },
      last30: { startDate: addDaysToIsoDate(endDate, -29), endDate },
      last90: { startDate: addDaysToIsoDate(endDate, -89), endDate },
      allHistory: { startDate: addDaysToIsoDate(endDate, -(META_WAREHOUSE_HISTORY_DAYS - 1)), endDate },
    } satisfies Record<keyof CreativeDecisionOsHistoricalWindows, { startDate: string; endDate: string }>;

    const [
      selected,
      last3,
      last7,
      last14,
      last30,
      last90,
      allHistory,
      snapshot,
      campaignRows,
      breakdownRows,
      adSetRows,
    ] = await Promise.all([
      fetchCreativeRowsForWindow({ request, businessId, startDate, endDate }),
      fetchCreativeRowsForWindow({ request, businessId, ...windowDefs.last3 }),
      fetchCreativeRowsForWindow({ request, businessId, ...windowDefs.last7 }),
      fetchCreativeRowsForWindow({ request, businessId, ...windowDefs.last14 }),
      fetchCreativeRowsForWindow({ request, businessId, ...windowDefs.last30 }),
      fetchCreativeRowsForWindow({ request, businessId, ...windowDefs.last90 }),
      fetchCreativeRowsForWindow({ request, businessId, ...windowDefs.allHistory }),
      getBusinessCommercialTruthSnapshot(businessId),
      getMetaCampaignsForRange({ businessId, startDate, endDate }),
      getMetaBreakdownsForRange({ businessId, startDate, endDate }),
      getMetaAdSetsForRange({ businessId, campaignId: null, startDate, endDate }),
    ]);

    selectedRows = selected;
    historyById = buildHistoryById({
      last3,
      last7,
      last14,
      last30,
      last90,
      allHistory,
    });
    campaigns = campaignRows.rows ?? [];
    adSets = adSetRows.rows ?? [];
    breakdowns = breakdownRows;

    const operatingMode = buildAccountOperatingMode({
      businessId,
      startDate,
      endDate,
      snapshot,
      campaigns: campaignRows,
      breakdowns: breakdownRows,
    });

    const payload = buildCreativeDecisionOs({
      businessId,
      startDate,
      endDate,
      rows: selectedRows.map((row) => toDecisionInputRow(row, historyById.get(row.id) ?? null)),
      campaigns,
      adSets,
      breakdowns: {
        location: breakdowns.location ?? [],
      },
      commercialTruth: snapshot,
      operatingMode,
    });

    return NextResponse.json(payload satisfies CreativeDecisionOsV1Response, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const snapshot = await getBusinessCommercialTruthSnapshot(businessId);
  const operatingMode = buildAccountOperatingMode({
    businessId,
    startDate,
    endDate,
    snapshot,
    campaigns: { rows: campaigns },
    breakdowns,
  });

  const payload = buildCreativeDecisionOs({
    businessId,
    startDate,
    endDate,
    rows: selectedRows.map((row) => toDecisionInputRow(row, historyById.get(row.id) ?? null)),
    campaigns,
    adSets,
    breakdowns: {
      location: breakdowns.location ?? [],
    },
    commercialTruth: snapshot,
    operatingMode,
  });

  return NextResponse.json(payload satisfies CreativeDecisionOsV1Response, {
    headers: { "Cache-Control": "no-store" },
  });
}
