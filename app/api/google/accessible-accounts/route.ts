import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDemoProviderDiscoveryPayload } from "@/lib/demo-business";
import { fetchGoogleAdsAccounts, refreshGoogleAccessToken } from "@/lib/google-ads-accounts";
import { getIntegration, upsertIntegration } from "@/lib/integrations";
import { resolveProviderDiscoveryPayload } from "@/lib/provider-account-discovery";
import { GOOGLE_CONFIG } from "@/lib/oauth/google-config";
import { ProviderAccountSnapshotRefreshError } from "@/lib/provider-account-snapshots";

const GOOGLE_ACCOUNT_SNAPSHOT_FRESHNESS_MS = 6 * 60 * 60_000;

function getGoogleDiscoveryFailureMessage(hasSnapshot: boolean) {
  if (hasSnapshot) {
    return "Your accounts list could not be refreshed right now. Showing the last available list.";
  }
  return "We couldn't load your Google Ads accounts right now. A background sync has been scheduled.";
}

function formatRetryAfter(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function getGoogleQuotaCooldownNotice(retryAfterAt: string | null) {
  const formatted = formatRetryAfter(retryAfterAt);
  if (!formatted) {
    return "Google Ads account refresh is temporarily rate-limited. Using cached accounts for now.";
  }
  return `Google Ads account refresh is temporarily rate-limited. Using cached accounts until ${formatted}.`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");
  const refreshRequested = searchParams.get("refresh") === "1";

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
  if ("error" in access) return access.error;

  if (await isDemoBusiness(businessId)) {
    const payload = getDemoProviderDiscoveryPayload("google");
    return NextResponse.json({
      data: payload.data,
      count: payload.data.length,
      meta: payload.meta,
      notice: payload.notice,
    });
  }

  const integration = await getIntegration(businessId, "google");
  if (!integration) {
    return NextResponse.json(
      {
        error: "google_integration_missing",
        message: "No connected Google integration found for this business.",
      },
      { status: 404 }
    );
  }

  const discoveryInput = {
      businessId,
      provider: "google",
      refreshRequested,
      freshnessMs: GOOGLE_ACCOUNT_SNAPSHOT_FRESHNESS_MS,
      missingSnapshotNotice:
        "Showing your saved Google Ads assignments while the full account list is prepared.",
      degradedNotice: getGoogleDiscoveryFailureMessage(true),
      quotaNotice: getGoogleQuotaCooldownNotice,
      unavailableNotice:
        "Google Ads accounts are being prepared in the background. You can keep using the page without waiting.",
      liveLoader: async () => {
        const hasAdsScope = Boolean(
          integration.scopes?.split(/\s+/).includes("https://www.googleapis.com/auth/adwords")
        );
        if (!hasAdsScope) {
          throw new Error(
            "This Google connection is missing the Google Ads scope. Reconnect Google Ads and approve Google Ads access."
          );
        }

        let accessToken = integration.access_token;
        const refreshToken = integration.refresh_token;

        if (!accessToken) {
          throw new Error("Google integration has no valid access token.");
        }

        if (integration.token_expires_at) {
          const isExpired = new Date(integration.token_expires_at).getTime() <= Date.now();
          if (isExpired && refreshToken) {
            const refreshed = await refreshGoogleAccessToken(refreshToken);
            accessToken = refreshed.accessToken;
            await upsertIntegration({
              businessId,
              provider: "google",
              status: "connected",
              accessToken: refreshed.accessToken,
              tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
            });
          } else if (isExpired) {
            throw new Error(
              "Google access token has expired and no refresh token is available. Please reconnect."
            );
          }
        }

        let hasDeveloperToken = false;
        try {
          hasDeveloperToken = Boolean(GOOGLE_CONFIG.developerToken);
        } catch {
          hasDeveloperToken = false;
        }

        const result = await fetchGoogleAdsAccounts(accessToken, {
          scopePresent: hasAdsScope,
        });

        if (!result.ok) {
          throw new Error(
            result.error ??
              (hasDeveloperToken
                ? "Could not discover accessible Google Ads accounts."
                : "Google Ads developer token is missing.")
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
    } as const;

  try {
    const payload = await resolveProviderDiscoveryPayload(discoveryInput);

    return NextResponse.json({
      data: payload.data,
      count: payload.data.length,
      meta: payload.meta,
      notice: payload.notice,
    });
  } catch (error) {
    if (error instanceof ProviderAccountSnapshotRefreshError) {
      if (refreshRequested) {
        const fallbackPayload = await resolveProviderDiscoveryPayload({
          ...discoveryInput,
          refreshRequested: false,
        }).catch(() => null);
        if (fallbackPayload?.meta.lastKnownGoodAvailable) {
          return NextResponse.json({
            data: fallbackPayload.data,
            count: fallbackPayload.data.length,
            meta: fallbackPayload.meta,
            notice: fallbackPayload.notice,
          });
        }
      }
      return NextResponse.json(
        {
          error: "google_ads_discovery_unavailable",
          message: getGoogleDiscoveryFailureMessage(false),
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: "google_ads_discovery_error",
        message:
          error instanceof Error && error.message
            ? error.message
            : getGoogleDiscoveryFailureMessage(false),
      },
      { status: 500 }
    );
  }
}
