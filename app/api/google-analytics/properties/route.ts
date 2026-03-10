import { NextRequest, NextResponse } from "next/server";
import { getIntegration, upsertIntegration } from "@/lib/integrations";
import {
  fetchGA4Properties,
  refreshGA4AccessToken,
} from "@/lib/google-analytics-accounts";
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

  const integration = await getIntegration(businessId, "ga4");

  if (!integration || integration.status !== "connected") {
    return NextResponse.json(
      {
        error: "integration_not_found",
        message:
          "Google Analytics integration not found or not connected for this business.",
      },
      { status: 404 },
    );
  }

  let accessToken = integration.access_token;
  const refreshToken = integration.refresh_token;

  // Check if token is expired and refresh if possible
  if (integration.token_expires_at) {
    const isExpired =
      new Date(integration.token_expires_at).getTime() <= Date.now();
    if (isExpired && refreshToken) {
      console.log("[ga4-properties] access token expired, refreshing...");
      try {
        const refreshed = await refreshGA4AccessToken(refreshToken);
        accessToken = refreshed.accessToken;

        await upsertIntegration({
          businessId,
          provider: "ga4",
          status: "connected",
          accessToken: refreshed.accessToken,
          tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
        });
        console.log("[ga4-properties] token refreshed successfully");
      } catch (refreshErr) {
        const msg =
          refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
        console.error("[ga4-properties] token refresh failed", { msg });
        return NextResponse.json(
          {
            error: "token_refresh_failed",
            message:
              "Google Analytics access token has expired and could not be refreshed. Please reconnect.",
          },
          { status: 401 },
        );
      }
    } else if (isExpired && !refreshToken) {
      return NextResponse.json(
        {
          error: "token_expired",
          message:
            "Google Analytics access token has expired and no refresh token is available. Please reconnect.",
        },
        { status: 401 },
      );
    }
  }

  if (!accessToken) {
    return NextResponse.json(
      {
        error: "missing_access_token",
        message: "Google Analytics access token is missing. Please reconnect.",
      },
      { status: 401 },
    );
  }

  const result = await fetchGA4Properties(accessToken);

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

  // Include current selection metadata if available
  const metadata = (integration.metadata ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    data: result.properties,
    selectedPropertyId: metadata.ga4PropertyId ?? null,
  });
}
