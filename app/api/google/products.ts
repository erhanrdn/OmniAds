import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import {
  executeGaqlQuery,
  getAssignedGoogleAccounts,
  getDateRangeForQuery,
  normalizeCostMicros,
  calculateRoas,
} from "@/lib/google-ads-gaql";

/**
 * GET /api/google/products
 *
 * Fetch real product performance data from Google Shopping campaigns
 * Query params:
 *   - businessId: required
 *   - accountId: optional (specific customer account ID, or "all" for aggregation)
 *   - dateRange: required ("7" | "14" | "30" | "custom")
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const accountId = searchParams.get("accountId");
  const dateRange = (searchParams.get("dateRange") || "30") as "7" | "14" | "30" | "custom";

  if (!businessId) {
    return NextResponse.json(
      { error: "businessId is required" },
      { status: 400 }
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  try {
    const dateRangeParams = getDateRangeForQuery(dateRange);
    const assignedAccounts = await getAssignedGoogleAccounts(businessId);

    if (assignedAccounts.length === 0) {
      return NextResponse.json({
        data: [],
        count: 0,
        note: "No Google Ads accounts assigned to this business",
      });
    }

    const accountsToQuery =
      accountId && accountId !== "all"
        ? [accountId]
        : assignedAccounts;

    const allResults = await Promise.all(
      accountsToQuery.map((customerId) =>
        executeGaqlQuery({
          businessId,
          customerId,
          query: `
            SELECT
              shopping_product.item_id,
              shopping_product.title,
              shopping_product.brand,
              shopping_product.custom_attribute0,
              metrics.impressions,
              metrics.clicks,
              metrics.cost_micros,
              metrics.conversions,
              metrics.conversions_value
            FROM shopping_product_view
            WHERE segments.date >= '${dateRangeParams.startDate}'
              AND segments.date <= '${dateRangeParams.endDate}'
            ORDER BY metrics.cost_micros DESC
          `,
        }).catch((error) => {
          console.error(`[products] Query failed for account ${customerId}:`, error);
          return { results: [] };
        })
      )
    );

    const products = allResults
      .flatMap((result) => result.results || [])
      .map((row, index) => {
        const product = row.shopping_product as any;
        const metrics = row as any;
        const cost = normalizeCostMicros(metrics.metrics?.cost_micros || 0);
        const convValue = parseFloat(metrics.metrics?.conversions_value || "0");
        const conversions = parseInt(metrics.metrics?.conversions || "0");

        return {
          id: `prd-${index}`,
          item_id: product?.item_id || `unknown-${index}`,
          title: product?.title || "Unknown Product",
          brand: product?.brand || "No Brand",
          price: parseFloat(product?.custom_attribute0 || "0") || 0,
          clicks: parseInt(metrics.metrics?.clicks || "0"),
          cost,
          conversions,
          conv_value: convValue,
          roas: calculateRoas(convValue, cost),
        };
      })
      .filter((p) => p.item_id !== "unknown");

    // Deduplicate by item_id
    const uniqueProducts = Array.from(
      new Map(products.map((p) => [p.item_id, p])).values()
    );

    return NextResponse.json({
      data: uniqueProducts,
      count: uniqueProducts.length,
    });
  } catch (error) {
    console.error("[products] API error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch products" },
      { status: 500 }
    );
  }
}
