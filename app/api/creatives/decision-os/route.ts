import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import type { CreativeDecisionOsV1Response } from "@/lib/creative-decision-os";
import { isCreativeDecisionOsV1EnabledForBusiness } from "@/lib/creative-decision-os-config";
import { getCreativeDecisionOsForRange } from "@/lib/creative-decision-os-source";
import type { CreativeDecisionBenchmarkScopeInput } from "@/lib/creative-decision-os";

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function parseBenchmarkScope(
  request: NextRequest,
): CreativeDecisionBenchmarkScopeInput | null {
  const scope = request.nextUrl.searchParams.get("benchmarkScope");
  if (scope !== "account" && scope !== "campaign") return null;

  const scopeId = request.nextUrl.searchParams.get("benchmarkScopeId");
  const scopeLabel = request.nextUrl.searchParams.get("benchmarkScopeLabel");

  return {
    scope,
    ...(scopeId?.trim() ? { scopeId: scopeId.trim() } : {}),
    ...(scopeLabel?.trim() ? { scopeLabel: scopeLabel.trim() } : {}),
  };
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

  const analyticsStartDateParam = request.nextUrl.searchParams.get("analyticsStartDate");
  const analyticsEndDateParam = request.nextUrl.searchParams.get("analyticsEndDate");
  const startDate =
    request.nextUrl.searchParams.get("startDate") ??
    analyticsStartDateParam ??
    toISODate(daysAgo(29));
  const endDate =
    request.nextUrl.searchParams.get("endDate") ??
    analyticsEndDateParam ??
    toISODate(new Date());
  const analyticsStartDate =
    analyticsStartDateParam ?? startDate;
  const analyticsEndDate =
    analyticsEndDateParam ?? endDate;
  const decisionAsOf = request.nextUrl.searchParams.get("decisionAsOf");
  const benchmarkScope = parseBenchmarkScope(request);

  const payload = await getCreativeDecisionOsForRange({
    request,
    businessId,
    startDate,
    endDate,
    analyticsStartDate,
    analyticsEndDate,
    decisionAsOf,
    benchmarkScope,
  });

  return NextResponse.json(payload satisfies CreativeDecisionOsV1Response, {
    headers: { "Cache-Control": "no-store" },
  });
}
