import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getIntegration, upsertIntegration } from "@/lib/integrations";
import {
  fetchGoogleAdsAccounts,
  refreshGoogleAccessToken,
} from "@/lib/google-ads-accounts";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import {
  ProviderAccountSnapshotRefreshError,
  readProviderAccountSnapshot,
  requestProviderAccountSnapshotRefresh,
} from "@/lib/provider-account-snapshots";

const GOOGLE_ACCOUNT_SNAPSHOT_FRESHNESS_MS = 60 * 60_000;
const GOOGLE_ACCOUNT_REFRESH_COOLDOWN_MS = 10 * 60_000;

/**
 * GET /integrations/google/ad-accounts?businessId=...
 *
 * Returns accessible Google Ads customer accounts for the connected Google integration.
 * Uses a persisted provider-account snapshot so assignment flows can open from the
 * last known good list instead of depending on a fresh provider round-trip every time.
 */
export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  const refreshRequested = request.nextUrl.searchParams.get("refresh") === "1";

  console.log("[google-ad-accounts] request", { businessId });

  if (!businessId) {
    return NextResponse.json(
      {
        error: "missing_business_id",
        message: "businessId query parameter is required.",
      },
      { status: 400 }
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });

  if ("error" in access) {
    return access.error;
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
      { status: 404 }
    );
  }

  let accessToken = integration.access_token;
  const refreshToken = integration.refresh_token;

  if (integration.token_expires_at) {
    const isExpired = new Date(integration.token_expires_at).getTime() <= Date.now();
    if (isExpired && refreshToken) {
      console.log("[google-ad-accounts] access token expired, refreshing...");
      try {
        const refreshed = await refreshGoogleAccessToken(refreshToken);
        accessToken = refreshed.accessToken;

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
    const loadLiveAccounts = async () => {
      const result = await fetchGoogleAdsAccounts(accessToken);

      if (!result.ok) {
        throw new Error(
          result.error ?? "Could not load accessible Google Ads accounts."
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
          error: "google_ads_fetch_unavailable",
          message:
            "We couldn't load your Google Ads accounts right now. Please wait a bit and try again.",
        },
        { status: 503 }
      );
    }

    let assignedSet = new Set<string>();
    try {
      const assignmentRow = await getProviderAccountAssignments(
        businessId,
        "google"
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
      count: snapshot.accounts.length,
      assignedCount: assignedSet.size,
      source: snapshot.meta.source,
      stale: snapshot.meta.stale,
      refreshFailed: snapshot.meta.refreshFailed,
    });

    return NextResponse.json({
      data: snapshot.accounts.map((account) => ({
        ...account,
        assigned: assignedSet.has(account.id),
      })),
      meta: snapshot.meta,
      notice:
        snapshot.meta.lastKnownGoodAvailable && snapshot.meta.refreshFailed
          ? "Your accounts list could not be refreshed right now. Showing the last available list."
          : null,
    });
  } catch (error: unknown) {
    if (error instanceof ProviderAccountSnapshotRefreshError) {
      console.error("[google-ad-accounts] snapshot refresh failed", {
        businessId,
        message: error.message,
        retryAfterMs: error.retryAfterMs,
        dueToRecentFailure: error.dueToRecentFailure,
      });

      return NextResponse.json(
        {
          error: "google_ads_fetch_unavailable",
          message:
            "We couldn't load your Google Ads accounts right now. Please wait a bit and try again.",
        },
        { status: 503 }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[google-ad-accounts] unexpected_error", {
      businessId,
      message,
    });

    return NextResponse.json(
      {
        error: "google_ads_fetch_failed",
        message: "We couldn't load your Google Ads accounts right now. Please wait a bit and try again.",
      },
      { status: 500 }
    );
  }
}
