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
 * GET /api/google/assets
 *
 * Fetch real Performance Max (PMax) asset performance data
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
              asset_group_asset.asset_group.name,
              asset_group_asset.asset.type,
              asset_group_asset.asset.name,
              asset_group_asset.performance_label,
              metrics.cost_micros,
              metrics.conversions_value
            FROM asset_group_asset
            WHERE segments.date >= '${dateRangeParams.startDate}'
              AND segments.date <= '${dateRangeParams.endDate}'
            ORDER BY metrics.cost_micros DESC
          `,
        }).catch((error) => {
          console.error(`[assets] Query failed for account ${customerId}:`, error);
          return { results: [] };
        })
      )
    );

    const assets = allResults
      .flatMap((result) => result.results || [])
      .map((row, index) => {
        const assetGroupAsset = row.asset_group_asset as any;
        const metrics = row as any;
        const cost = normalizeCostMicros(metrics.metrics?.cost_micros || 0);
        const convValue = parseFloat(metrics.metrics?.conversions_value || "0");

        return {
          id: `ast-${index}`,
          asset_group: assetGroupAsset?.asset_group?.name || "Unknown Asset Group",
          asset_type: normalizeAssetType(assetGroupAsset?.asset?.type),
          asset_name:
            assetGroupAsset?.asset?.name ||
            `${assetGroupAsset?.asset?.type || "Unknown"} Asset`,
          performance_label: normalizePerformanceLabel(
            assetGroupAsset?.performance_label
          ),
          cost,
          conv_value: convValue,
          roas: calculateRoas(convValue, cost),
        };
      });

    return NextResponse.json({
      data: assets,
      count: assets.length,
    });
  } catch (error) {
    console.error("[assets] API error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch assets" },
      { status: 500 }
    );
  }
}

function normalizeAssetType(
  type: string | undefined
): "image" | "video" | "text" | "unknown" {
  if (!type) return "unknown";
  const lower = type.toLowerCase();
  if (lower.includes("text")) return "text";
  if (lower.includes("image")) return "image";
  if (lower.includes("video")) return "video";
  return "unknown";
}

function normalizePerformanceLabel(
  label: string | undefined
): "Best" | "Good" | "Low" | "Unknown" {
  if (!label) return "Unknown";
  const lower = label.toLowerCase();
  if (lower.includes("best")) return "Best";
  if (lower.includes("good")) return "Good";
  if (lower.includes("low")) return "Low";
  return "Unknown";
}
