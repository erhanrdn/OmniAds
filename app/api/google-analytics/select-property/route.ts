import { NextRequest, NextResponse } from "next/server";
import { getIntegration, upsertIntegration } from "@/lib/integrations";
import {
  fetchGA4Properties,
  isPropertyAccessible,
  refreshGA4AccessToken,
} from "@/lib/google-analytics-accounts";
import { requireBusinessAccess } from "@/lib/access";

/**
 * POST /api/google-analytics/select-property
 *
 * Body: { businessId, propertyId, propertyName, accountId, accountName }
 *
 * Validates that the selected property is accessible by the connected
 * Google account, then persists the selection in the integration metadata.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const businessId =
    typeof body.businessId === "string" ? body.businessId : null;
  const propertyId =
    typeof body.propertyId === "string" ? body.propertyId : null;
  const propertyName =
    typeof body.propertyName === "string" ? body.propertyName : null;
  const accountId = typeof body.accountId === "string" ? body.accountId : null;
  const accountName =
    typeof body.accountName === "string" ? body.accountName : null;

  if (!businessId || !propertyId || !propertyName) {
    return NextResponse.json(
      {
        error: "missing_fields",
        message: "businessId, propertyId, and propertyName are required.",
      },
      { status: 400 },
    );
  }

  // Verify user has access to this business
  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "collaborator",
  });
  if ("error" in access) return access.error;

  // Get the existing GA4 integration
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

  // Get a valid access token (refresh if needed)
  let accessToken = integration.access_token;
  const refreshToken = integration.refresh_token;

  if (integration.token_expires_at) {
    const isExpired =
      new Date(integration.token_expires_at).getTime() <= Date.now();
    if (isExpired && refreshToken) {
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
      } catch {
        return NextResponse.json(
          {
            error: "token_refresh_failed",
            message: "Could not refresh access token. Please reconnect.",
          },
          { status: 401 },
        );
      }
    } else if (isExpired && !refreshToken) {
      return NextResponse.json(
        {
          error: "token_expired",
          message: "Access token expired. Please reconnect.",
        },
        { status: 401 },
      );
    }
  }

  if (!accessToken) {
    return NextResponse.json(
      {
        error: "missing_access_token",
        message: "Access token missing. Please reconnect.",
      },
      { status: 401 },
    );
  }

  // Validate that the property is accessible by this user
  const propertiesResult = await fetchGA4Properties(accessToken);
  if (!propertiesResult.ok) {
    return NextResponse.json(
      {
        error: "validation_failed",
        message:
          propertiesResult.error ?? "Could not validate property access.",
      },
      { status: 502 },
    );
  }

  if (!isPropertyAccessible(propertyId, propertiesResult.properties)) {
    return NextResponse.json(
      {
        error: "property_not_accessible",
        message:
          "The selected property is not accessible with this Google account.",
      },
      { status: 403 },
    );
  }

  // Save property selection to integration metadata
  const existingMetadata = (integration.metadata ?? {}) as Record<
    string,
    unknown
  >;
  const updatedIntegration = await upsertIntegration({
    businessId,
    provider: "ga4",
    status: "connected",
    metadata: {
      ...existingMetadata,
      ga4PropertyId: propertyId,
      ga4PropertyName: propertyName,
      ga4AccountId: accountId,
      ga4AccountName: accountName,
    },
  });

  console.log("[ga4-select-property] property linked", {
    businessId,
    propertyId,
    propertyName,
    accountId,
    accountName,
  });

  return NextResponse.json({
    success: true,
    integration: {
      id: updatedIntegration.id,
      provider: updatedIntegration.provider,
      status: updatedIntegration.status,
      metadata: updatedIntegration.metadata,
    },
  });
}
