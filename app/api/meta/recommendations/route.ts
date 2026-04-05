import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDemoMetaBreakdowns, getDemoMetaCampaigns } from "@/lib/demo-business";
import { buildMetaRecommendations, type MetaRecommendationsResponse } from "@/lib/meta/recommendations";
import { readMetaBidRegimeHistorySummaries } from "@/lib/meta/config-snapshots";
import { buildMetaCreativeIntelligence } from "@/lib/meta/creative-intelligence";
import { getCreativeScoreSnapshot } from "@/lib/meta/creative-score-service";
import type { MetaBreakdownsResponse } from "@/app/api/meta/breakdowns/route";
import type { MetaCampaignRow } from "@/app/api/meta/campaigns/route";
import { resolveRequestLanguage } from "@/lib/request-language";
import { META_WAREHOUSE_HISTORY_DAYS } from "@/lib/meta/history";

// Intentional exception: AI recommendations keep snapshot-backed historical
// config regime analysis across multi-window history. This is not a normal
// campaign/adset historical UI serving path.

function parseISODate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function addDaysToISO(value: string, days: number): string {
  const date = parseISODate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayDiffInclusive(startDate: string, endDate: string): number {
  const start = parseISODate(startDate).getTime();
  const end = parseISODate(endDate).getTime();
  return Math.max(1, Math.floor((end - start) / 86_400_000) + 1);
}

async function fetchInternalJson<T>(
  request: NextRequest,
  pathname: string,
  params: URLSearchParams
): Promise<T> {
  const url = new URL(pathname, request.nextUrl.origin);
  url.search = params.toString();
  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const payload = await res.text().catch(() => "");
    throw new Error(`Internal fetch failed (${pathname} ${res.status}): ${payload.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const language = await resolveRequestLanguage(request);
  const businessId = searchParams.get("businessId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  if (!businessId || !startDate || !endDate) {
    return NextResponse.json(
      { error: "missing_params", message: "businessId, startDate and endDate are required." },
      { status: 400 }
    );
  }

  if (await isDemoBusiness(businessId)) {
    const demoCampaigns = getDemoMetaCampaigns().rows as MetaCampaignRow[];
    const demoBreakdowns = getDemoMetaBreakdowns() as MetaBreakdownsResponse;
    return NextResponse.json(
      buildMetaRecommendations({
        windows: {
          selected: demoCampaigns,
          previousSelected: demoCampaigns,
          last3: demoCampaigns,
          last7: demoCampaigns,
          last14: demoCampaigns,
          last30: demoCampaigns,
          last90: demoCampaigns,
          allHistory: demoCampaigns,
        },
        breakdowns: demoBreakdowns,
        language,
      })
    );
  }

  const selectedSpanDays = dayDiffInclusive(startDate, endDate);
  const previousEnd = addDaysToISO(startDate, -1);
  const previousStart = addDaysToISO(previousEnd, -(selectedSpanDays - 1));
  const last3Start = addDaysToISO(endDate, -2);
  const last7Start = addDaysToISO(endDate, -6);
  const last14Start = addDaysToISO(endDate, -13);
  const last30Start = addDaysToISO(endDate, -29);
  const last90Start = addDaysToISO(endDate, -89);
  const allHistoryStart = addDaysToISO(endDate, -(META_WAREHOUSE_HISTORY_DAYS - 1));

  const baseParams = new URLSearchParams({ businessId });

  const [
    selectedCampaigns,
    previousSelectedCampaigns,
    last3Campaigns,
    last7Campaigns,
    last14Campaigns,
    last30Campaigns,
    last90Campaigns,
    allHistoryCampaigns,
    breakdowns,
    creativeScoreSnapshot,
  ] = await Promise.all([
    fetchInternalJson<{ rows: MetaCampaignRow[] }>(
      request,
      "/api/meta/campaigns",
      new URLSearchParams({ ...Object.fromEntries(baseParams), startDate, endDate, includePrev: "1" })
    ),
    fetchInternalJson<{ rows: MetaCampaignRow[] }>(
      request,
      "/api/meta/campaigns",
      new URLSearchParams({ ...Object.fromEntries(baseParams), startDate: previousStart, endDate: previousEnd })
    ),
    fetchInternalJson<{ rows: MetaCampaignRow[] }>(
      request,
      "/api/meta/campaigns",
      new URLSearchParams({ ...Object.fromEntries(baseParams), startDate: last3Start, endDate })
    ),
    fetchInternalJson<{ rows: MetaCampaignRow[] }>(
      request,
      "/api/meta/campaigns",
      new URLSearchParams({ ...Object.fromEntries(baseParams), startDate: last7Start, endDate })
    ),
    fetchInternalJson<{ rows: MetaCampaignRow[] }>(
      request,
      "/api/meta/campaigns",
      new URLSearchParams({ ...Object.fromEntries(baseParams), startDate: last14Start, endDate })
    ),
    fetchInternalJson<{ rows: MetaCampaignRow[] }>(
      request,
      "/api/meta/campaigns",
      new URLSearchParams({ ...Object.fromEntries(baseParams), startDate: last30Start, endDate })
    ),
    fetchInternalJson<{ rows: MetaCampaignRow[] }>(
      request,
      "/api/meta/campaigns",
      new URLSearchParams({ ...Object.fromEntries(baseParams), startDate: last90Start, endDate })
    ),
    fetchInternalJson<{ rows: MetaCampaignRow[] }>(
      request,
      "/api/meta/campaigns",
      new URLSearchParams({ ...Object.fromEntries(baseParams), startDate: allHistoryStart, endDate })
    ),
    fetchInternalJson<MetaBreakdownsResponse>(
      request,
      "/api/meta/breakdowns",
      new URLSearchParams({ ...Object.fromEntries(baseParams), startDate, endDate })
    ),
    getCreativeScoreSnapshot({
      request,
      businessId,
      selectedStartDate: startDate,
      selectedEndDate: endDate,
    }),
  ]);

  const creativeIntelligence = buildMetaCreativeIntelligence({
    rows: creativeScoreSnapshot.selectedRows,
    historyById: creativeScoreSnapshot.historyById,
    campaigns: selectedCampaigns.rows ?? [],
  });

  const payload = buildMetaRecommendations({
    windows: {
      selected: selectedCampaigns.rows ?? [],
      previousSelected: previousSelectedCampaigns.rows ?? [],
      last3: last3Campaigns.rows ?? [],
      last7: last7Campaigns.rows ?? [],
      last14: last14Campaigns.rows ?? [],
      last30: last30Campaigns.rows ?? [],
      last90: last90Campaigns.rows ?? [],
      allHistory: allHistoryCampaigns.rows ?? [],
    },
    breakdowns,
    creativeIntelligence,
    historicalBidRegimes: Object.fromEntries(
      (
        await readMetaBidRegimeHistorySummaries({
          businessId,
          entityLevel: "campaign",
          entityIds: (selectedCampaigns.rows ?? []).map((row) => row.id),
        })
      ).entries()
    ),
    language,
  });

  return NextResponse.json(payload);
}
