import { NextRequest, NextResponse } from "next/server";
import type { MetaBreakdownsResponse } from "@/app/api/meta/breakdowns/route";
import type { MetaCampaignsResponse } from "@/app/api/meta/campaigns/route";
import { requireBusinessAccess } from "@/lib/access";
import { getBusinessCommercialTruthSnapshot } from "@/lib/business-commercial";
import { buildAccountOperatingMode } from "@/lib/business-operating-mode";

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

async function fetchInternalJson<T>(
  request: NextRequest,
  path: string,
  params: URLSearchParams,
): Promise<T | null> {
  const url = new URL(path, request.nextUrl.origin);
  url.search = params.toString();
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
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
  const params = new URLSearchParams({
    businessId,
    startDate,
    endDate,
  });

  const [snapshot, campaigns, breakdowns] = await Promise.all([
    getBusinessCommercialTruthSnapshot(businessId),
    fetchInternalJson<MetaCampaignsResponse>(request, "/api/meta/campaigns", params),
    fetchInternalJson<MetaBreakdownsResponse>(request, "/api/meta/breakdowns", params),
  ]);

  const payload = buildAccountOperatingMode({
    businessId,
    startDate,
    endDate,
    snapshot,
    campaigns,
    breakdowns,
  });

  return NextResponse.json(payload);
}
