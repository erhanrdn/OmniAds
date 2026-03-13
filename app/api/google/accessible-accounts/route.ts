import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getIntegration, upsertIntegration } from "@/lib/integrations";
import {
  fetchGoogleAdsAccounts,
  refreshGoogleAccessToken,
} from "@/lib/google-ads-accounts";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { resolveProviderAccountSnapshot } from "@/lib/provider-account-snapshots";

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

  console.log("[accessible-accounts] 🔹 ROUTE ENTERED", { businessId, timestamp: new Date().toISOString() });

  if (!businessId) {
    console.log("[accessible-accounts] ❌ MISSING BUSINESS_ID");
    return NextResponse.json(
      {
        error: "missing_business_id",
        message: "businessId query parameter is required.",
      },
      { status: 400 }
    );
  }

  console.log("[accessible-accounts] ✓ businessId received", { businessId });

  // Validate access
  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });

  if ("error" in access) {
    console.log("[accessible-accounts] ❌ BUSINESS ACCESS FAILED", { error: access.error });
    return access.error;
  }

  console.log("[accessible-accounts] ✓ business access validated");

  // Load Google integration
  const integration = await getIntegration(businessId, "google");

  if (!integration) {
    console.log("[accessible-accounts] ❌ GOOGLE INTEGRATION NOT FOUND", { businessId });
    return NextResponse.json(
      {
        error: "google_integration_missing",
        message: "No connected Google integration found for this business.",
      },
      { status: 404 }
    );
  }

  console.log("[accessible-accounts] ✓ Google integration found", {
    businessId,
    integrationId: integration.id,
    hasAccessToken: !!integration.access_token,
    hasRefreshToken: !!integration.refresh_token,
    tokenExpiry: integration.token_expires_at,
  });

  let accessToken = integration.access_token;
  const refreshToken = integration.refresh_token;

  if (!accessToken) {
    console.log("[accessible-accounts] ❌ MISSING ACCESS TOKEN", { businessId });
    return NextResponse.json(
      {
        error: "google_access_token_missing",
        message: "Google integration has no valid access token.",
      },
      { status: 401 }
    );
  }

  // Check if token is expired and refresh if possible
  if (integration.token_expires_at) {
    const isExpired =
      new Date(integration.token_expires_at).getTime() <= Date.now();
    
    console.log("[accessible-accounts] ℹ Token expiry check", {
      expiresAt: integration.token_expires_at,
      isExpired,
      hasRefreshToken: !!refreshToken,
    });

    if (isExpired && refreshToken) {
      console.log("[accessible-accounts] 🔄 Access token expired, attempting refresh...");
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
        console.log("[accessible-accounts] ✓ Token refreshed successfully");
      } catch (refreshErr) {
        console.error("[accessible-accounts] ❌ TOKEN REFRESH FAILED", {
          error: refreshErr instanceof Error ? refreshErr.message : String(refreshErr),
        });
        return NextResponse.json(
          {
            error: "google_token_refresh_failed",
            message:
              "Google access token has expired and could not be refreshed. Please reconnect.",
          },
          { status: 401 }
        );
      }
    } else if (isExpired && !refreshToken) {
      console.log("[accessible-accounts] ❌ TOKEN EXPIRED, NO REFRESH TOKEN");
      return NextResponse.json(
        {
          error: "google_token_expired",
          message:
            "Google access token has expired and no refresh token is available. Please reconnect.",
        },
        { status: 401 }
      );
    }
  }

  console.log("[accessible-accounts] ✓ access token validated");

  try {
    console.log("[accessible-accounts] 🔄 Resolving Google Ads account snapshot...");
    const snapshot = await resolveProviderAccountSnapshot({
      businessId,
      provider: "google",
      liveLoader: async () => {
        const result = await fetchGoogleAdsAccounts(accessToken);

        console.log("[accessible-accounts] Response from fetchGoogleAdsAccounts", {
          ok: result.ok,
          error: result.error || null,
          customerCount: result.customers?.length || 0,
        });

        if (!result.ok) {
          throw new Error(
            result.error ?? "Could not discover accessible Google Ads accounts."
          );
        }

        return result.customers.map((customer) => ({
          id: customer.id,
          name: customer.name,
          currency: customer.currency ?? undefined,
          timezone: customer.timezone ?? undefined,
          isManager: customer.isManager,
        }));
      },
    });

    console.log("[accessible-accounts] ✓ Account snapshot resolved", {
      accessibleAccountCount: snapshot.accounts.length,
      source: snapshot.meta.source,
      stale: snapshot.meta.stale,
      refreshFailed: snapshot.meta.refreshFailed,
      hasLastKnownGood: snapshot.meta.lastKnownGoodAvailable,
    });

    // Fetch existing assignments to mark which accounts are already assigned
    let assignedSet = new Set<string>();
    try {
      const assignmentRow = await getProviderAccountAssignments(
        businessId,
        "google"
      );
      assignedSet = new Set(assignmentRow?.account_ids ?? []);
      console.log("[accessible-accounts] ✓ Assignment records loaded", {
        alreadyAssignedCount: assignedSet.size,
      });
    } catch (assignmentError) {
      console.warn(
        "[accessible-accounts] ⚠ Could not fetch assignments (non-fatal):",
        assignmentError instanceof Error ? assignmentError.message : String(assignmentError)
      );
    }

    // Return all accessible accounts with assigned flag
    // This allows the modal to show all accounts even before any are assigned
    const accounts = snapshot.accounts.map((account) => ({
      ...account,
      assigned: assignedSet.has(account.id),
    }));

    console.log("[accessible-accounts] ✓ SUCCESS", {
      businessId,
      totalAccessible: accounts.length,
      alreadyAssigned: assignedSet.size,
      timeMs: new Date().getTime(),
    });

    return NextResponse.json({
      data: accounts,
      count: accounts.length,
      meta: snapshot.meta,
    });
  } catch (error) {
    console.error("[accessible-accounts] ❌ UNEXPECTED ERROR", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        error: "google_ads_discovery_error",
        message: "Unexpected error during Google Ads account discovery.",
      },
      { status: 500 }
    );
  }
}
