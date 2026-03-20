import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { computePreviousPeriod } from "@/lib/geo-momentum";
import {
  buildDemoPreviousRows,
  buildSeoOverviewPayload,
  fetchSearchConsoleAnalyticsRows,
} from "@/lib/seo/intelligence";
import {
  generateSeoMonthlyAiAnalysis,
  getSeoMonthlyAiAnalysisForPeriod,
  getSeoMonthlyLabel,
} from "@/lib/seo/run-monthly-ai-analysis";
import {
  resolveSearchConsoleContext,
  SearchConsoleAuthError,
} from "@/lib/search-console";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDemoSearchConsoleAnalytics } from "@/lib/demo-business";

function resolvePeriod(request: NextRequest) {
  const startDate =
    request.nextUrl.searchParams.get("startDate") ??
    new Date(Date.now() - 1000 * 60 * 60 * 24 * 29).toISOString().slice(0, 10);
  const endDate =
    request.nextUrl.searchParams.get("endDate") ?? new Date().toISOString().slice(0, 10);
  return { startDate, endDate };
}

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: "businessId query parameter is required." },
      { status: 400 },
    );
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "guest" });
  if ("error" in access) return access.error;

  const { startDate, endDate } = resolvePeriod(request);

  try {
    const monthly = await getSeoMonthlyAiAnalysisForPeriod({
      businessId,
      startDate,
      endDate,
    });

    let overviewData = monthly.overviewData;
    if (!overviewData) {
      if (await isDemoBusiness(businessId)) {
        const currentRows = getDemoSearchConsoleAnalytics().rows;
        const previousRows = buildDemoPreviousRows(currentRows);
        const overview = await buildSeoOverviewPayload({
          siteUrl: "sc-domain:urbantrail.co",
          startDate,
          endDate,
          currentRows,
          previousRows,
        });
        overviewData = overview.aiWorkspace;
      } else {
        const context = await resolveSearchConsoleContext({ businessId, requireSite: true });
        const { prevStart, prevEnd } = computePreviousPeriod(startDate, endDate);
        const [currentRows, previousRows] = await Promise.all([
          fetchSearchConsoleAnalyticsRows({
            accessToken: context.accessToken,
            siteUrl: context.siteUrl ?? "",
            startDate,
            endDate,
            rowLimit: 500,
          }),
          fetchSearchConsoleAnalyticsRows({
            accessToken: context.accessToken,
            siteUrl: context.siteUrl ?? "",
            startDate: prevStart,
            endDate: prevEnd,
            rowLimit: 500,
          }),
        ]);
        const overview = await buildSeoOverviewPayload({
          siteUrl: context.siteUrl ?? "",
          startDate,
          endDate,
          currentRows,
          previousRows,
        });
        overviewData = overview.aiWorkspace;
      }
    }

    return NextResponse.json({
      ...monthly,
      overviewData,
      monthLabel: getSeoMonthlyLabel(monthly.monthKey),
    });
  } catch (error) {
    if (error instanceof SearchConsoleAuthError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        error: "seo_ai_analysis_lookup_failed",
        message: error instanceof Error ? error.message : "Could not load SEO AI analysis.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as
    | { businessId?: string; startDate?: string; endDate?: string }
    | null;

  const businessId = payload?.businessId ?? null;
  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: "businessId is required." },
      { status: 400 },
    );
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "collaborator" });
  if ("error" in access) return access.error;

  const startDate =
    payload?.startDate ?? new Date(Date.now() - 1000 * 60 * 60 * 24 * 29).toISOString().slice(0, 10);
  const endDate = payload?.endDate ?? new Date().toISOString().slice(0, 10);

  try {
    const result = await generateSeoMonthlyAiAnalysis({
      businessId,
      startDate,
      endDate,
    });

    return NextResponse.json(
      {
        ...result.payload,
        message:
          result.payload.status === "failed"
            ? result.payload.unavailableReason ?? "Could not generate SEO AI analysis."
            : undefined,
        monthLabel: getSeoMonthlyLabel(result.payload.monthKey),
        generatedNow: !result.alreadyGenerated && result.payload.status === "available",
        alreadyGenerated: result.alreadyGenerated,
      },
      { status: result.alreadyGenerated ? 200 : result.payload.status === "failed" ? 500 : 200 },
    );
  } catch (error) {
    if (error instanceof SearchConsoleAuthError) {
      return NextResponse.json(
        { error: error.code, message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        error: "seo_ai_analysis_generate_failed",
        message: error instanceof Error ? error.message : "Could not generate SEO AI analysis.",
      },
      { status: 500 },
    );
  }
}
