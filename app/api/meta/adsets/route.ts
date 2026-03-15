import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { resolveMetaCredentials, getAdSets } from "@/lib/api/meta";
import type { MetaAdSetData } from "@/lib/api/meta";
import {
  getCachedRouteReport,
  setCachedRouteReport,
} from "@/lib/route-report-cache";

// ── Demo stub ─────────────────────────────────────────────────────────────────

function getDemoAdSets(campaignId: string): MetaAdSetData[] {
  return [
    {
      id: `${campaignId}_adset_1`,
      name: "Prospecting — 18–34 Wide",
      campaignId,
      status: "ACTIVE",
      dailyBudget: 5000,
      lifetimeBudget: null,
      spend: 1240.5,
      purchases: 62,
      revenue: 5580.0,
      roas: 4.5,
      cpa: 20.01,
      ctr: 2.14,
      cpm: 12.3,
      impressions: 100854,
      clicks: 2158,
    },
    {
      id: `${campaignId}_adset_2`,
      name: "Retargeting — 30-day visitors",
      campaignId,
      status: "ACTIVE",
      dailyBudget: 2500,
      lifetimeBudget: null,
      spend: 620.25,
      purchases: 48,
      revenue: 3840.0,
      roas: 6.19,
      cpa: 12.92,
      ctr: 3.45,
      cpm: 9.8,
      impressions: 63291,
      clicks: 2183,
    },
  ];
}

// ── Route ─────────────────────────────────────────────────────────────────────

export interface MetaAdSetsResponse {
  status?: "ok" | "no_credentials" | "no_campaign_id";
  rows: MetaAdSetData[];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const campaignId = searchParams.get("campaignId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  if (!campaignId) {
    return NextResponse.json(
      { error: "missing_campaign_id", message: "campaignId is required." },
      { status: 400 }
    );
  }

  if (await isDemoBusiness(businessId!)) {
    return NextResponse.json({
      status: "ok",
      rows: getDemoAdSets(campaignId),
    } satisfies MetaAdSetsResponse);
  }

  const cached = await getCachedRouteReport<MetaAdSetsResponse>({
    businessId: businessId!,
    provider: "meta",
    reportType: `meta_adsets_${campaignId}`,
    searchParams,
  });
  if (cached) return NextResponse.json(cached);

  const resolvedStart =
    startDate ?? new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const resolvedEnd =
    endDate ?? new Date().toISOString().slice(0, 10);

  const credentials = await resolveMetaCredentials(businessId!);
  if (!credentials) {
    return NextResponse.json({
      status: "no_credentials",
      rows: [],
    } satisfies MetaAdSetsResponse);
  }

  const rows = await getAdSets(
    credentials,
    campaignId,
    resolvedStart,
    resolvedEnd
  );

  const payload: MetaAdSetsResponse = { status: "ok", rows };
  await setCachedRouteReport({
    businessId: businessId!,
    provider: "meta",
    reportType: `meta_adsets_${campaignId}`,
    searchParams,
    payload,
  });

  return NextResponse.json(payload);
}
