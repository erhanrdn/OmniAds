import { NextRequest, NextResponse } from "next/server";
import {
  fetchGA4Properties,
} from "@/lib/google-analytics-accounts";
import {
  resolveGa4AnalyticsContext,
  GA4AuthError,
  type GA4ResolvedAnalyticsContext,
} from "@/lib/google-analytics-reporting";
import { requireBusinessAccess } from "@/lib/access";

/**
 * GET /api/google-analytics/properties?businessId=...
 *
 * Returns accessible GA4 properties for the connected Google Analytics integration.
 * If the access token is expired, attempts a refresh using the stored refresh_token.
 */
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
    minRole: "collaborator",
  });
  if ("error" in access) return access.error;

  let ga4Context: GA4ResolvedAnalyticsContext;
  try {
    ga4Context = await resolveGa4AnalyticsContext(businessId, {
      requireProperty: false,
    });
  } catch (err) {
    if (err instanceof GA4AuthError) {
      return NextResponse.json(
        {
          error: err.code,
          message: err.message,
          action: err.action,
          reconnectRequired: err.action === "reconnect_ga4",
        },
        { status: err.status },
      );
    }
    throw err;
  }

  const result = await fetchGA4Properties(ga4Context.accessToken);

  if (!result.ok) {
    console.error("[ga4-properties] fetch failed", {
      businessId,
      error: result.error,
    });
    return NextResponse.json(
      {
        error: "ga4_fetch_failed",
        message: result.error ?? "Could not load accessible GA4 properties.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    data: result.properties,
    selectedPropertyId: ga4Context.propertyResourceName,
  });
}
