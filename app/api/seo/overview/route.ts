import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDemoSearchConsoleAnalytics } from "@/lib/demo-business";
import {
  buildDemoPreviousRows,
  buildSeoOverviewPayload,
  fetchSearchConsoleAnalyticsRows,
  SearchConsoleApiError,
} from "@/lib/seo/intelligence";
import {
  resolveSearchConsoleContext,
  SearchConsoleAuthError,
} from "@/lib/search-console";
import { computePreviousPeriod } from "@/lib/geo-momentum";
import { getSeoResultsCache } from "@/lib/seo/results-cache";
import { ProviderRequestCooldownError } from "@/lib/provider-request-governance";
import { runWithGoogleRequestAuditContext } from "@/lib/google-request-audit";

const SEO_STALE_FALLBACK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  const startDate =
    request.nextUrl.searchParams.get("startDate") ??
    new Date(Date.now() - 1000 * 60 * 60 * 24 * 29).toISOString().slice(0, 10);
  const endDate =
    request.nextUrl.searchParams.get("endDate") ??
    new Date().toISOString().slice(0, 10);
  const rowLimit = Math.min(
    500,
    Math.max(50, Number.parseInt(request.nextUrl.searchParams.get("rowLimit") ?? "300", 10)),
  );

  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: "businessId query parameter is required." },
      { status: 400 },
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  if (await isDemoBusiness(businessId)) {
    const currentRows = getDemoSearchConsoleAnalytics().rows;
    const previousRows = buildDemoPreviousRows(currentRows);
    const payload = await buildSeoOverviewPayload({
      siteUrl: "sc-domain:urbantrail.co",
      startDate,
      endDate,
      currentRows,
      previousRows,
      businessId,
      preferRuleBasedBrief: true,
    });
    return NextResponse.json(payload);
  }

  try {
    const context = await resolveSearchConsoleContext({
      businessId,
      requireSite: true,
    });

    const siteUrl = context.siteUrl ?? "";
    const { prevStart, prevEnd } = computePreviousPeriod(startDate, endDate);

    const cached = await getSeoResultsCache({
      businessId,
      cacheType: "overview",
      startDate,
      endDate,
    });
    if (cached) return NextResponse.json(cached);

    const payload = await runWithGoogleRequestAuditContext(
      {
        provider: "search_console",
        businessId,
        requestSource: "live_report",
        requestPath: "/api/seo/overview",
        requestType: "seo_overview",
      },
      async () => {
        const [currentRows, previousRows] = await Promise.all([
          fetchSearchConsoleAnalyticsRows({
            accessToken: context.accessToken,
            siteUrl,
            startDate,
            endDate,
            rowLimit,
          }),
          fetchSearchConsoleAnalyticsRows({
            accessToken: context.accessToken,
            siteUrl,
            startDate: prevStart,
            endDate: prevEnd,
            rowLimit,
          }),
        ]);

        return buildSeoOverviewPayload({
          siteUrl,
          startDate,
          endDate,
          currentRows,
          previousRows,
          businessId,
        });
      },
    );

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof SearchConsoleAuthError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }
    if (
      error instanceof ProviderRequestCooldownError ||
      (error instanceof SearchConsoleApiError && [401, 403, 429].includes(error.status))
    ) {
      const stalePayload = await getSeoResultsCache({
        businessId,
        cacheType: "overview",
        startDate,
        endDate,
        maxAgeMs: SEO_STALE_FALLBACK_MAX_AGE_MS,
      });
      if (stalePayload) {
        return NextResponse.json(stalePayload);
      }
      return NextResponse.json(
        {
          error: "seo_overview_cooldown",
          message:
            "Search Console refresh is temporarily suppressed after repeated Google failures. Try again after cooldown or rely on the next background refresh.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      {
        error: "seo_overview_failed",
        message: error instanceof Error ? error.message : "Could not load SEO overview.",
      },
      { status: 500 },
    );
  }
}
