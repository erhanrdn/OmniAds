import { NextRequest, NextResponse } from "next/server";
import { getIntegration, upsertIntegration } from "@/lib/integrations";
import {
  fetchGoogleAdsAccounts,
  refreshGoogleAccessToken,
} from "@/lib/google-ads-accounts";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";

/**
 * GET /integrations/google/ad-accounts?businessId=...
 *
 * Returns accessible Google Ads customer accounts for the connected Google integration.
 * If the access token is expired, attempts a refresh using the stored refresh_token.
 */
export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");

  console.log("[google-ad-accounts] request", { businessId });

  if (!businessId) {
    return NextResponse.json(
      {
        error: "missing_business_id",
        message: "businessId query parameter is required.",
      },
      { status: 400 },
    );
  }

  const integration = await getIntegration(businessId, "google");
  console.log("[google-ad-accounts] integration lookup", {
    businessId,
    found: Boolean(integration),
  });

  if (!integration) {
    return NextResponse.json(
      {
        error: "integration_not_found",
        message: "Google integration not found for this business.",
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
      console.log("[google-ad-accounts] access token expired, refreshing...");
      try {
        const refreshed = await refreshGoogleAccessToken(refreshToken);
        accessToken = refreshed.accessToken;

        // Update the stored access token
        await upsertIntegration({
          businessId,
          provider: "google",
          status: "connected",
          accessToken: refreshed.accessToken,
          tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
        });
        console.log("[google-ad-accounts] token refreshed successfully");
      } catch (refreshErr) {
        const msg =
          refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
        console.error("[google-ad-accounts] token refresh failed", { msg });
        return NextResponse.json(
          {
            error: "token_refresh_failed",
            message:
              "Google access token has expired and could not be refreshed. Please reconnect.",
          },
          { status: 401 },
        );
      }
    } else if (isExpired && !refreshToken) {
      return NextResponse.json(
        {
          error: "token_expired",
          message:
            "Google access token has expired and no refresh token is available. Please reconnect.",
        },
        { status: 401 },
      );
    }
  }

  if (!accessToken) {
    return NextResponse.json(
      {
        error: "missing_access_token",
        message:
          "Google access token is missing for this business integration.",
      },
      { status: 401 },
    );
  }

  try {
    const result = await fetchGoogleAdsAccounts(accessToken);

    if (!result.ok) {
      console.error("[google-ad-accounts] Google Ads API error", {
        businessId,
        error: result.error,
      });
      return NextResponse.json(
        {
          error: "google_ads_api_error",
          message: result.error ?? "Failed to fetch Google Ads accounts.",
        },
        { status: 502 },
      );
    }

    // Fetch existing assignments
    let assignedSet = new Set<string>();
    try {
      const assignmentRow = await getProviderAccountAssignments(
        businessId,
        "google",
      );
      assignedSet = new Set(assignmentRow?.account_ids ?? []);
    } catch (assignmentError: unknown) {
      const msg =
        assignmentError instanceof Error
          ? assignmentError.message
          : String(assignmentError);
      console.warn("[google-ad-accounts] assignment_read_failed (non-fatal)", {
        businessId,
        message: msg,
      });
    }

    console.log("[google-ad-accounts] normalized", {
      businessId,
      count: result.customers.length,
      assignedCount: assignedSet.size,
    });

    return NextResponse.json({
      data: result.customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        currency: customer.currency,
        timezone: customer.timezone,
        manager: customer.manager,
        status: customer.status,
        assigned: assignedSet.has(customer.id),
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[google-ad-accounts] unexpected_error", {
      businessId,
      message,
    });

    return NextResponse.json(
      {
        error: "google_ads_api_error",
        message,
      },
      { status: 500 },
    );
  }
}
