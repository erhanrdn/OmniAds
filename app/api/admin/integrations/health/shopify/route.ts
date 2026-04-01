import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { buildShopifyOverviewCanaryKey, SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS } from "@/lib/shopify/serving";
import { getShopifyStatus } from "@/lib/shopify/status";
import { getShopifyServingState } from "@/lib/shopify/warehouse";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const businessId = request.nextUrl.searchParams.get("businessId")?.trim();
    const startDate = request.nextUrl.searchParams.get("startDate")?.trim();
    const endDate = request.nextUrl.searchParams.get("endDate")?.trim();

    if (!businessId) {
      return NextResponse.json(
        { error: "businessId is required." },
        { status: 400 }
      );
    }

    const status = await getShopifyStatus({
      businessId,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });

    const serving =
      status.shopId && startDate && endDate
        ? await getShopifyServingState({
            businessId,
            providerAccountId: status.shopId,
            canaryKey: buildShopifyOverviewCanaryKey({
              startDate,
              endDate,
              timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
            }),
          }).catch(() => null)
        : null;

    return NextResponse.json({
      businessId,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      canaryKey:
        startDate && endDate
          ? buildShopifyOverviewCanaryKey({
              startDate,
              endDate,
              timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
            })
          : null,
      status,
      serving,
    });
  } catch (err) {
    console.error("[admin/integrations/health/shopify GET]", err);
    return NextResponse.json(
      { error: "internal_error", message: String(err) },
      { status: 500 }
    );
  }
}
