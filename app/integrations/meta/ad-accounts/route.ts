import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getIntegration } from "@/lib/integrations";
import { fetchMetaAdAccounts, getMetaApiErrorMessage } from "@/lib/meta-ad-accounts";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import {
  ProviderAccountSnapshotRefreshError,
  readProviderAccountSnapshot,
  requestProviderAccountSnapshotRefresh,
} from "@/lib/provider-account-snapshots";

const META_ACCOUNT_SNAPSHOT_FRESHNESS_MS = 60 * 60_000;
const META_ACCOUNT_REFRESH_COOLDOWN_MS = 10 * 60_000;

function getRefreshNotice(hasSnapshot: boolean) {
  if (hasSnapshot) {
    return "Your accounts list could not be refreshed right now. Showing the last available list.";
  }
  return "We couldn't load your accounts right now. Please try again in a moment.";
}

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  const refreshRequested = request.nextUrl.searchParams.get("refresh") === "1";

  console.log("[meta-ad-accounts] request", { businessId });

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
    console.log("[meta-ad-accounts] business access failed", {
      businessId,
      error: access.error,
    });
    return access.error;
  }

  const integration = await getIntegration(businessId, "meta");
  console.log("[meta-ad-accounts] integration lookup", {
    businessId,
    found: Boolean(integration),
  });

  if (!integration) {
    return NextResponse.json(
      {
        error: "integration_not_found",
        message: "Meta integration not found for this business.",
      },
      { status: 404 }
    );
  }

  const accessToken = integration.access_token;
  console.log("[meta-ad-accounts] token check", {
    businessId,
    hasToken: Boolean(accessToken),
  });

  if (!accessToken) {
    return NextResponse.json(
      {
        error: "missing_access_token",
        message: "Meta access token is missing for this business integration.",
      },
      { status: 401 }
    );
  }

  if (integration.token_expires_at) {
    const isExpired = new Date(integration.token_expires_at).getTime() <= Date.now();
    if (isExpired) {
      return NextResponse.json(
        {
          error: "token_expired",
          message: "Meta access token has expired. Please reconnect Meta integration.",
        },
        { status: 401 }
      );
    }
  }

  try {
    const loadLiveAccounts = async () => {
      const metaResult = await fetchMetaAdAccounts(accessToken);

      console.log("[meta-ad-accounts] meta response", {
        businessId,
        status: metaResult.status,
        rawBody: metaResult.rawBody,
      });

      if (!metaResult.ok || metaResult.body?.error) {
        throw new Error(getMetaApiErrorMessage(metaResult));
      }

      return metaResult.normalized.map((account) => ({
        id: account.id,
        name: account.name,
        currency: account.currency ?? undefined,
        timezone: account.timezone ?? undefined,
        isManager: false,
      }));
    };

    const snapshot = refreshRequested
      ? await requestProviderAccountSnapshotRefresh({
          businessId,
          provider: "meta",
          freshnessMs: META_ACCOUNT_SNAPSHOT_FRESHNESS_MS,
          failureCooldownMs: META_ACCOUNT_REFRESH_COOLDOWN_MS,
          liveLoader: loadLiveAccounts,
        })
      : await readProviderAccountSnapshot({
          businessId,
          provider: "meta",
          freshnessMs: META_ACCOUNT_SNAPSHOT_FRESHNESS_MS,
          failureCooldownMs: META_ACCOUNT_REFRESH_COOLDOWN_MS,
        });

    if (!snapshot) {
      if (!refreshRequested) {
        void requestProviderAccountSnapshotRefresh({
          businessId,
          provider: "meta",
          freshnessMs: META_ACCOUNT_SNAPSHOT_FRESHNESS_MS,
          failureCooldownMs: META_ACCOUNT_REFRESH_COOLDOWN_MS,
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
          error: "meta_accounts_unavailable",
          message: getRefreshNotice(false),
        },
        { status: 503 }
      );
    }

    let assignedSet = new Set<string>();
    try {
      const assignmentRow = await getProviderAccountAssignments(businessId, "meta");
      assignedSet = new Set(assignmentRow?.account_ids ?? []);
    } catch (assignmentError: unknown) {
      const msg =
        assignmentError instanceof Error ? assignmentError.message : String(assignmentError);
      console.warn("[meta-ad-accounts] assignment_read_failed (non-fatal)", {
        businessId,
        message: msg,
      });
    }

    const accounts = snapshot.accounts.map((account) => ({
      ...account,
      assigned: assignedSet.has(account.id),
    }));

    console.log("[meta-ad-accounts] normalized", {
      businessId,
      count: accounts.length,
      assignedCount: assignedSet.size,
      source: snapshot.meta.source,
      stale: snapshot.meta.stale,
      refreshFailed: snapshot.meta.refreshFailed,
    });

    return NextResponse.json({
      data: accounts,
      meta: snapshot.meta,
      notice:
        snapshot.meta.lastKnownGoodAvailable && snapshot.meta.refreshFailed
          ? getRefreshNotice(true)
          : null,
    });
  } catch (error: unknown) {
    if (error instanceof ProviderAccountSnapshotRefreshError) {
      console.error("[meta-ad-accounts] snapshot_refresh_failed", {
        businessId,
        message: error.message,
        retryAfterMs: error.retryAfterMs,
        dueToRecentFailure: error.dueToRecentFailure,
      });

      return NextResponse.json(
        {
          error: "meta_accounts_unavailable",
          message: getRefreshNotice(false),
        },
        { status: 503 }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";

    console.error("[meta-ad-accounts] unexpected_error", {
      businessId,
      message,
    });

    return NextResponse.json(
      {
        error: "meta_api_error",
        message: getRefreshNotice(false),
      },
      { status: 500 }
    );
  }
}
