import { NextRequest, NextResponse } from "next/server";

import { requireBusinessAccess } from "@/lib/access";
import { getShopifyStatus } from "@/lib/shopify/status";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const businessId = url.searchParams.get("businessId");
  const startDate = url.searchParams.get("startDate")?.trim();
  const endDate = url.searchParams.get("endDate")?.trim();

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  const status =
    startDate && endDate
      ? await getShopifyStatus({ businessId: businessId!, startDate, endDate })
      : await getShopifyStatus(businessId!);

  return NextResponse.json(status, {
    headers: { "Cache-Control": "no-store" },
  });
}
