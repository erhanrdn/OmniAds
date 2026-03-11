import { NextRequest, NextResponse } from "next/server";
import { getIntegration, upsertIntegration } from "@/lib/integrations";
import {
  fetchGA4Properties,
  isPropertyAccessible
} from "@/lib/google-analytics-accounts";
import {
  resolveGa4AnalyticsContext,
  GA4AuthError,
  type GA4ResolvedAnalyticsContext,
} from "@/lib/google-analytics-reporting";
import { requireBusinessAccess } from "@/lib/access";

function normalizeGa4PropertyId(value: string): string {
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return `properties/${trimmed}`;
  return trimmed;
}

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

  // Validate that the property is accessible by this user
  const propertiesResult = await fetchGA4Properties(ga4Context.accessToken);
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

  const normalizedPropertyId = normalizeGa4PropertyId(propertyId);
  if (
    !isPropertyAccessible(normalizedPropertyId, propertiesResult.properties)
  ) {
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
      ga4PropertyId: normalizedPropertyId,
      ga4PropertyName: propertyName,
      ga4AccountId: accountId,
      ga4AccountName: accountName,
    },
  });

  console.log("[ga4-select-property] property linked", {
    businessId,
    propertyId: normalizedPropertyId,
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
