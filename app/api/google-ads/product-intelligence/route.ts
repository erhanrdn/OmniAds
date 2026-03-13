import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import { getDemoGoogleAdsProductIntelligence } from "@/lib/demo-business";
import { getGoogleAdsProductIntelligenceReport } from "@/lib/google-ads/reporting";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const accountId = searchParams.get("accountId");
  const dateRange = (searchParams.get("dateRange") || "30") as "7" | "14" | "30" | "custom";

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "guest" });
  if ("error" in access) return access.error;

  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoGoogleAdsProductIntelligence());
  }

  const report = await getGoogleAdsProductIntelligenceReport({
    businessId,
    accountId,
    dateRange,
  });

  return NextResponse.json({
    products: report.products,
    totalSpend: report.totalSpend,
    count: report.products.length,
    available: report.available,
    unavailableReason: report.unavailableReason,
    meta: report.meta,
  });
}
