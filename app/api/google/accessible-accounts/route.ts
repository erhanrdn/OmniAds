import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getIntegration, upsertIntegration } from "@/lib/integrations";
import {
  fetchGoogleAdsAccounts,
  refreshGoogleAccessToken,
} from "@/lib/google-ads-accounts";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";

/**
 * GET /api/google/accessible-accounts
 *
 * Returns ALL accessible Google Ads customer accounts from the connected Google integration.
 * This is used for the assignment modal to show which accounts can be assigned.
 *
 * Query params:
 *   - businessId: required
 *
 * Returns:
 *   {
 *     data: [
 *       {
 *         id: "1234567890",
 *         name: "My Ads Account",
 *         currency: "USD",
 *         timezone: "America/Los_Angeles",
 *         isManager: false,
 *         assigned: true
 *       }
 *     ]
 *   }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");

  if (!businessId) {
    return NextResponse.json(
      {
        error: "missing_business_id",
        message: "businessId query parameter is required.",
      },
      { status: 400 }
    );
  }

  // Validate access
  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  // Load Google integration
  const integration = await getIntegration(businessId, "google");

  if (!integration) {
    return NextResponse.json(
      {
        error: "integration_not_found",
        message: "Google integration not found for this business.",
      },
      { status: 404 }
    );
  }

  let accessToken = integration.access_token;
  const refreshToken = integration.refresh_token;

  // Check if token is expired and refresh if possible
  if (integration.token_expires_at) {
    const isExpired =
      new Date(integration.token_expires_at).getTime() <= Date.now();
    
    if (isExpired && refreshToken) {
      console.log("[accessible-accounts] access token expired, refreshing...");
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
        console.log("[accessible-accounts] token refreshed successfully");
      } catch (refreshErr) {
        console.error("[accessible-accounts] token refresh failed", refreshErr);
        return NextResponse.json(
          {
            error: "token_refresh_failed",
            message:
              "Google access token has expired and could not be refreshed. Please reconnect.",
          },
          { status: 401 }
        );
      }
    } else if (isExpired && !refreshToken) {
      return NextResponse.json(
        {
          error: "token_expired",
          message:
            "Google access token has expired and no refresh token is available. Please reconnect.",
        },
        { status: 401 }
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
      { status: 401 }
    );
  }

  try {
    // Fetch all accessible Google Ads accounts
    const result = await fetchGoogleAdsAccounts(accessToken);

    if (!result.ok) {
      console.error("[accessible-accounts] Google Ads API error", result.error);
      return NextResponse.json(
        {
          error: "google_ads_fetch_failed",
          message:
            result.error ?? "Could not load accessible Google Ads accounts.",
        },
        { status: 502 }
      );
    }

    // Fetch existing assignments to mark which accounts are already assigned
    let assignedSet = new Set<string>();
    try {
      const assignmentRow = await getProviderAccountAssignments(
        businessId,
        "google"
      );
      assignedSet = new Set(assignmentRow?.account_ids ?? []);
    } catch (assignmentError) {
      console.warn(
        "[accessible-accounts] Could not fetch assignments (non-fatal):",
        assignmentError
      );
    }

    // Return all accessible accounts with assigned flag
    // This allows the modal to show all accounts even before any are assigned
    const accounts = result.customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      currency: customer.currency,
      timezone: customer.timezone,
      isManager: customer.isManager,
      assigned: assignedSet.has(customer.id),
    }));

    console.log("[accessible-accounts] Success", {
      businessId,
      totalAccessible: accounts.length,
      alreadyAssigned: assignedSet.size,
    });

    return NextResponse.json({
      data: accounts,
      count: accounts.length,
    });
  } catch (error) {
    console.error("[accessible-accounts] Unexpected error:", error);

    return NextResponse.json(
      {
        error: "google_ads_fetch_failed",
        message: "Could not load accessible Google Ads accounts.",
      },
      { status: 500 }
    );
  }
}
