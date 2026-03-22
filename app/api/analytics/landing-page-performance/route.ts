import { NextRequest, NextResponse } from "next/server";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { requireBusinessAccess } from "@/lib/access";
import {
  GA4AuthError,
  getGA4TokenAndProperty,
  isGa4InvalidArgumentError,
  runGA4Report,
} from "@/lib/google-analytics-reporting";
import {
  buildDemoLandingPagePerformanceResponse,
  buildLandingPageRow,
  LANDING_PAGE_EVENT_NAMES,
  normalizeLandingPagePath,
  summarizeLandingPageRows,
} from "@/lib/landing-pages/performance";
import {
  getCachedRouteReport,
  setCachedRouteReport,
} from "@/lib/route-report-cache";
import type { LandingPagePerformanceResponse } from "@/src/types/landing-pages";

const REPORT_TYPE = "ga4_landing_page_performance_v1";
const LANDING_PAGE_DIMENSION = { name: "landingPage" };
const TOP_PAGES_LIMIT = 250;
const EVENT_ROWS_LIMIT = 5000;

function buildEventNameFilter() {
  return {
    filter: {
      fieldName: "eventName",
      inListFilter: {
        values: [...LANDING_PAGE_EVENT_NAMES],
      },
    },
  };
}

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  const startDate = request.nextUrl.searchParams.get("startDate") ?? "30daysAgo";
  const endDate = request.nextUrl.searchParams.get("endDate") ?? "yesterday";

  if (!businessId) {
    return NextResponse.json({ error: "missing_business_id" }, { status: 400 });
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "collaborator",
  });
  if ("error" in access) return access.error;

  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(buildDemoLandingPagePerformanceResponse());
  }

  const cached = await getCachedRouteReport<LandingPagePerformanceResponse>({
    businessId,
    provider: "ga4",
    reportType: REPORT_TYPE,
    searchParams: request.nextUrl.searchParams,
  });
  if (cached) {
    return NextResponse.json(cached);
  }

  let accessToken: string;
  let propertyId: string;
  let propertyName = "";
  try {
    ({ accessToken, propertyId, propertyName } = await getGA4TokenAndProperty(businessId));
  } catch (error) {
    if (error instanceof GA4AuthError) {
      return NextResponse.json(
        {
          error: error.code,
          message: error.message,
          action: error.action,
          reconnectRequired: error.action === "reconnect_ga4",
        },
        { status: error.status }
      );
    }
    throw error;
  }

  try {
    const [baseReport, eventReport] = await Promise.all([
      runGA4Report({
        propertyId,
        accessToken,
        businessId,
        dateRanges: [{ startDate, endDate }],
        dimensions: [LANDING_PAGE_DIMENSION],
        metrics: [
          { name: "sessions" },
          { name: "engagementRate" },
          { name: "purchaseRevenue" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: TOP_PAGES_LIMIT,
      }),
      runGA4Report({
        propertyId,
        accessToken,
        businessId,
        dateRanges: [{ startDate, endDate }],
        dimensions: [LANDING_PAGE_DIMENSION, { name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: buildEventNameFilter(),
        orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
        limit: EVENT_ROWS_LIMIT,
      }),
    ]);

    const baseRows = new Map<
      string,
      {
        sessions: number;
        engagementRate: number;
        totalRevenue: number;
      }
    >();

    for (const row of baseReport.rows) {
      const path = normalizeLandingPagePath(row.dimensions[0]);
      baseRows.set(path, {
        sessions: Number.parseFloat(row.metrics[0] ?? "0") || 0,
        engagementRate: Number.parseFloat(row.metrics[1] ?? "0") || 0,
        totalRevenue: Number.parseFloat(row.metrics[2] ?? "0") || 0,
      });
    }

    const eventCountsByPath = new Map<string, Record<string, number>>();
    for (const row of eventReport.rows) {
      const path = normalizeLandingPagePath(row.dimensions[0]);
      const eventName = row.dimensions[1] ?? "";
      const eventCount = Number.parseFloat(row.metrics[0] ?? "0") || 0;
      if (!eventName) continue;

      const current = eventCountsByPath.get(path) ?? {};
      current[eventName] = (current[eventName] ?? 0) + eventCount;
      eventCountsByPath.set(path, current);
    }

    const allPaths = new Set<string>([...baseRows.keys(), ...eventCountsByPath.keys()]);
    const rows = [...allPaths]
      .map((path) => {
        const base = baseRows.get(path);
        const events = eventCountsByPath.get(path) ?? {};
        return buildLandingPageRow({
          path,
          sessions: base?.sessions ?? 0,
          engagementRate: base?.engagementRate ?? 0,
          scrollEvents: events.scroll ?? 0,
          viewItem: events.view_item ?? 0,
          addToCarts: events.add_to_cart ?? 0,
          checkouts: events.begin_checkout ?? 0,
          addShippingInfo: events.add_shipping_info ?? 0,
          addPaymentInfo: events.add_payment_info ?? 0,
          purchases: events.purchase ?? 0,
          totalRevenue: base?.totalRevenue ?? 0,
        });
      })
      .filter((row) => row.sessions > 0 || row.viewItem > 0 || row.purchases > 0 || row.totalRevenue > 0)
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, TOP_PAGES_LIMIT);

    const payload: LandingPagePerformanceResponse = {
      rows,
      summary: summarizeLandingPageRows(rows),
      meta: {
        empty: rows.length === 0,
        hasEcommerceData: rows.some((row) => row.viewItem > 0 || row.purchases > 0 || row.totalRevenue > 0),
        unavailableMetrics: [],
        propertyName,
      },
    };

    await setCachedRouteReport({
      businessId,
      provider: "ga4",
      reportType: REPORT_TYPE,
      searchParams: request.nextUrl.searchParams,
      payload,
    });

    return NextResponse.json(payload);
  } catch (error) {
    const reason =
      isGa4InvalidArgumentError(error)
        ? "One or more GA4 metrics or dimensions are unavailable for this property."
        : error instanceof Error
          ? error.message
          : "Failed to load landing page performance.";

    return NextResponse.json(
      {
        error: "landing_page_performance_failed",
        message: reason,
        action: "retry_later",
      },
      { status: 502 }
    );
  }
}
