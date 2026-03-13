import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getIntegration, upsertIntegration } from "@/lib/integrations";
import {
  fetchGoogleAdsAccounts,
  refreshGoogleAccessToken,
} from "@/lib/google-ads-accounts";
import { GOOGLE_CONFIG } from "@/lib/oauth/google-config";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import {
  ProviderAccountSnapshotRefreshError,
  readProviderAccountSnapshot,
  requestProviderAccountSnapshotRefresh,
} from "@/lib/provider-account-snapshots";

const GOOGLE_ACCOUNT_SNAPSHOT_FRESHNESS_MS = 60 * 60_000;
const GOOGLE_ACCOUNT_REFRESH_COOLDOWN_MS = 10 * 60_000;

function getGoogleDiscoveryFailureMessage(hasSnapshot: boolean) {
  if (hasSnapshot) {
    return "Your accounts list could not be refreshed right now. Showing the last available list.";
  }
  return "We couldn't load your Google Ads accounts right now. Please wait a bit and try again.";
}

function buildAssignedFallbackRows(accountIds: string[]) {
  return accountIds.map((accountId) => ({
    id: accountId,
    name: accountId,
    assigned: true,
  }));
}

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
  const refreshRequested = searchParams.get("refresh") === "1";

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
    scopes: integration.scopes ?? null,
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
    let hasDeveloperToken = false;
    try {
      hasDeveloperToken = Boolean(GOOGLE_CONFIG.developerToken);
    } catch {
      hasDeveloperToken = false;
    }
    const hasAdsScope = Boolean(
      integration.scopes?.split(/\s+/).includes("https://www.googleapis.com/auth/adwords")
    );

    if (!hasAdsScope) {
      console.error("[accessible-accounts] ❌ REQUIRED ADS SCOPE MISSING", {
        businessId,
        integrationId: integration.id,
        scopes: integration.scopes ?? null,
      });
      return NextResponse.json(
        {
          error: "google_ads_scope_missing",
          message:
            "This Google connection is missing the Google Ads scope. Reconnect Google Ads and approve Google Ads access.",
        },
        { status: 400 }
      );
    }

    console.log("[accessible-accounts] 🔄 Resolving Google Ads account snapshot...");
    const loadLiveAccounts = async () => {
      const result = await fetchGoogleAdsAccounts(accessToken, {
        scopePresent: hasAdsScope,
      });

      console.log("[accessible-accounts] Response from fetchGoogleAdsAccounts", {
        ok: result.ok,
        error: result.error || null,
        customerCount: result.customers?.length || 0,
        hasDeveloperToken,
        hasAdsScope,
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
    };

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

    const snapshot = refreshRequested
      ? await requestProviderAccountSnapshotRefresh({
          businessId,
          provider: "google",
          freshnessMs: GOOGLE_ACCOUNT_SNAPSHOT_FRESHNESS_MS,
          failureCooldownMs: GOOGLE_ACCOUNT_REFRESH_COOLDOWN_MS,
          liveLoader: loadLiveAccounts,
        })
      : await readProviderAccountSnapshot({
          businessId,
          provider: "google",
          freshnessMs: GOOGLE_ACCOUNT_SNAPSHOT_FRESHNESS_MS,
          failureCooldownMs: GOOGLE_ACCOUNT_REFRESH_COOLDOWN_MS,
        });

    if (!snapshot) {
      if (assignedSet.size > 0) {
        return NextResponse.json({
          data: buildAssignedFallbackRows(Array.from(assignedSet)),
          count: assignedSet.size,
          meta: {
            source: "snapshot",
            fetchedAt: null,
            stale: true,
            refreshFailed: false,
            lastError: null,
            lastKnownGoodAvailable: true,
          },
          notice:
            "Showing your currently assigned Google Ads accounts while the full account list is being refreshed.",
        });
      }

      if (!refreshRequested) {
        void requestProviderAccountSnapshotRefresh({
          businessId,
          provider: "google",
          freshnessMs: GOOGLE_ACCOUNT_SNAPSHOT_FRESHNESS_MS,
          failureCooldownMs: GOOGLE_ACCOUNT_REFRESH_COOLDOWN_MS,
          liveLoader: loadLiveAccounts,
        }).catch(() => undefined);
        return NextResponse.json(
          {
            error: "provider_snapshot_missing",
            message: "Loading accounts...",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          error: "google_ads_discovery_unavailable",
          message: getGoogleDiscoveryFailureMessage(false),
        },
        { status: 503 }
      );
    }

    console.log("[accessible-accounts] ✓ Account snapshot resolved", {
      accessibleAccountCount: snapshot.accounts.length,
      source: snapshot.meta.source,
      stale: snapshot.meta.stale,
      refreshFailed: snapshot.meta.refreshFailed,
      hasLastKnownGood: snapshot.meta.lastKnownGoodAvailable,
    });

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
      notice:
        snapshot.meta.lastKnownGoodAvailable && snapshot.meta.refreshFailed
          ? getGoogleDiscoveryFailureMessage(true)
          : null,
    });
  } catch (error) {
    if (error instanceof ProviderAccountSnapshotRefreshError) {
      console.error("[accessible-accounts] ❌ SNAPSHOT REFRESH FAILED", {
        businessId,
        message: error.message,
        retryAfterMs: error.retryAfterMs,
        dueToRecentFailure: error.dueToRecentFailure,
      });

      try {
        const assignmentRow = await getProviderAccountAssignments(
          businessId,
          "google"
        );
        const assignedIds = assignmentRow?.account_ids ?? [];
        if (assignedIds.length > 0) {
          return NextResponse.json({
            data: buildAssignedFallbackRows(assignedIds),
            count: assignedIds.length,
            meta: {
              source: "snapshot",
              fetchedAt: null,
              stale: true,
              refreshFailed: true,
              lastError: error.message,
              lastKnownGoodAvailable: true,
            },
            notice:
              "Showing your currently assigned Google Ads accounts while the full account list could not be refreshed.",
          });
        }
      } catch {
        // fall through
      }

      return NextResponse.json(
        {
          error: "google_ads_discovery_unavailable",
          message: getGoogleDiscoveryFailureMessage(false),
        },
        { status: 503 }
      );
    }

    console.error("[accessible-accounts] ❌ UNEXPECTED ERROR", {
      businessId,
      integrationId: integration.id,
      hasAccessToken: Boolean(accessToken),
      hasRefreshToken: Boolean(refreshToken),
      hasDeveloperToken: (() => {
        try {
          return Boolean(GOOGLE_CONFIG.developerToken);
        } catch {
          return false;
        }
      })(),
      scopes: integration.scopes ?? null,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        error: "google_ads_discovery_error",
        message:
          error instanceof Error && error.message
            ? error.message
            : "We couldn't load your Google Ads accounts right now. Please wait a bit and try again.",
      },
      { status: 500 }
    );
  }
}
