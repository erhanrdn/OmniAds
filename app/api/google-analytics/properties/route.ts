import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDemoGa4Properties, getDemoSelectedGa4PropertyId } from "@/lib/demo-business";
import {
  fetchGA4Properties,
} from "@/lib/google-analytics-accounts";
import {
  resolveGa4AnalyticsContext,
  GA4AuthError,
  type GA4ResolvedAnalyticsContext,
} from "@/lib/google-analytics-reporting";
import { requireBusinessAccess } from "@/lib/access";
import {
  ProviderRequestCooldownError,
  runProviderRequestWithGovernance,
} from "@/lib/provider-request-governance";

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

  if (await isDemoBusiness(businessId)) {
    return NextResponse.json({
      data: getDemoGa4Properties(),
      selectedPropertyId: getDemoSelectedGa4PropertyId(),
    });
  }

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

  let result;
  try {
    result = await runProviderRequestWithGovernance({
      provider: "ga4",
      businessId,
      requestType: "properties",
      requestSource: "discovery",
      requestPath: "/api/google-analytics/properties",
      tripGlobalBreakerFor: ["quota", "auth", "permission"],
      execute: async () => {
        const propertiesResult = await fetchGA4Properties(ga4Context.accessToken);
        if (!propertiesResult.ok) {
          const error = new Error(
            propertiesResult.error ?? "Could not load accessible GA4 properties.",
          ) as Error & { status?: number };
          error.status = propertiesResult.status;
          throw error;
        }
        return propertiesResult;
      },
    });
  } catch (error) {
    if (error instanceof ProviderRequestCooldownError) {
      return NextResponse.json(
        {
          error: "ga4_properties_cooldown",
          message:
            "GA4 property refresh is temporarily paused after repeated failures. Please try again shortly.",
          retryAfterMs: error.retryAfterMs,
        },
        { status: 503 },
      );
    }
    throw error;
  }

  return NextResponse.json({
    data: result.properties,
    selectedPropertyId: ga4Context.propertyResourceName,
  });
}
