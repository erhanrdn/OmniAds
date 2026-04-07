import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getMetaCanonicalOverviewSummary } from "@/lib/meta/canonical-overview";
import { isDemoBusinessId, getDemoMetaSummary } from "@/lib/demo-business";

export interface MetaSummaryRouteResponse
  extends Awaited<ReturnType<typeof getMetaCanonicalOverviewSummary>> {}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const businessId = url.searchParams.get("businessId");
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");

  const access = await requireBusinessAccess({ request, businessId });
  if ("error" in access) return access.error;

  if (isDemoBusinessId(businessId)) {
    return NextResponse.json({ ...getDemoMetaSummary(), isPartial: false, notReadyReason: null });
  }

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: "missing_date_range", message: "startDate and endDate are required." },
      { status: 400 }
    );
  }

  const payload = await getMetaCanonicalOverviewSummary({
    businessId: businessId!,
    startDate,
    endDate,
  });

  return NextResponse.json(
    payload satisfies MetaSummaryRouteResponse,
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}
