import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getBusinessCommercialTruthSnapshot } from "@/lib/business-commercial";
import { buildAccountOperatingMode } from "@/lib/business-operating-mode";
import {
  getMetaDecisionSourceSnapshot,
  getMetaDecisionWindowContext,
} from "@/lib/meta/operator-decision-source";

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
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

  const startDate =
    request.nextUrl.searchParams.get("startDate") ?? toISODate(daysAgo(29));
  const endDate =
    request.nextUrl.searchParams.get("endDate") ?? toISODate(new Date());
  const [snapshot, decisionContext] = await Promise.all([
    getBusinessCommercialTruthSnapshot(businessId),
    getMetaDecisionWindowContext({
      businessId,
      startDate,
      endDate,
    }),
  ]);
  const { campaigns, breakdowns } = await getMetaDecisionSourceSnapshot({
    businessId,
    decisionWindows: decisionContext.decisionWindows,
  });

  const payload = buildAccountOperatingMode({
    businessId,
    startDate,
    endDate,
    analyticsWindow: decisionContext.analyticsWindow,
    decisionWindows: decisionContext.decisionWindows,
    historicalMemory: decisionContext.historicalMemory,
    decisionAsOf: decisionContext.decisionAsOf,
    snapshot,
    campaigns: campaigns ?? null,
    breakdowns: breakdowns ?? null,
  });

  return NextResponse.json(payload);
}
