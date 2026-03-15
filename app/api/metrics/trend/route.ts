import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";

interface OverviewPayload {
  kpis?: {
    spend?: number;
    revenue?: number;
    purchases?: number;
    aov?: number;
    roas?: number;
    cpa?: number;
  };
  platformEfficiency?: Array<{
    platform?: string;
    spend?: number;
    revenue?: number;
    roas?: number;
    purchases?: number;
    cpa?: number;
  }>;
}

interface GoogleOverviewPayload {
  kpis?: {
    spend?: number;
    revenue?: number;
    conversions?: number;
    roas?: number;
    cpa?: number;
    clicks?: number;
    impressions?: number;
    ctr?: number;
  };
}

interface AnalyticsOverviewPayload {
  kpis?: {
    purchaseCvr?: number;
  };
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function enumerateDays(startDate: string, endDate: string) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function fetchInternal<T>(
  request: NextRequest,
  pathname: string,
  params: Record<string, string>
): Promise<T | null> {
  const url = new URL(pathname, request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json().catch(() => null)) as T | null;
}

function getMetricValue(metric: string, input: {
  overview: OverviewPayload | null;
  google: GoogleOverviewPayload | null;
  analytics: AnalyticsOverviewPayload | null;
}) {
  const overview = input.overview?.kpis ?? {};
  const platformEfficiency = input.overview?.platformEfficiency ?? [];
  const metaRow =
    platformEfficiency.find((row) => row.platform?.toLowerCase() === "meta") ?? null;
  const googleRow =
    platformEfficiency.find((row) => row.platform?.toLowerCase() === "google") ?? null;
  const google = input.google?.kpis ?? {};
  const analytics = input.analytics?.kpis ?? {};
  const totalSpend = Number(overview.spend ?? 0);
  const revenue = Number(overview.revenue ?? 0);
  const purchases = Number(overview.purchases ?? 0);

  if (metric === "revenue") return revenue;
  if (metric === "spend") return totalSpend;
  if (metric === "mer" || metric === "blended_roas") return totalSpend > 0 ? revenue / totalSpend : 0;
  if (metric === "orders" || metric === "purchases") return purchases;
  if (metric === "conversion_rate") return Number(analytics.purchaseCvr ?? 0) * 100;
  if (metric === "aov") return purchases > 0 ? revenue / purchases : 0;
  if (metric === "cpa" || metric === "cost_per_purchase") return purchases > 0 ? totalSpend / purchases : 0;
  if (metric === "clicks") return Number(google.clicks ?? 0);
  if (metric === "impressions") return Number(google.impressions ?? 0);
  if (metric === "ctr") return Number(google.ctr ?? 0);

  if (metric.startsWith("meta-")) {
    const key = metric.replace("meta-", "");
    if (key === "spend") return Number(metaRow?.spend ?? 0);
    if (key === "revenue") return Number(metaRow?.revenue ?? 0);
    if (key === "purchases") return Number(metaRow?.purchases ?? 0);
    if (key === "roas") return Number(metaRow?.roas ?? 0);
    if (key === "cpa") return Number(metaRow?.cpa ?? 0);
  }

  if (metric.startsWith("google-")) {
    const key = metric.replace("google-", "");
    if (key === "spend") return Number(googleRow?.spend ?? google.spend ?? 0);
    if (key === "revenue") return Number(googleRow?.revenue ?? google.revenue ?? 0);
    if (key === "purchases") return Number(googleRow?.purchases ?? google.conversions ?? 0);
    if (key === "roas") return Number(googleRow?.roas ?? google.roas ?? 0);
    if (key === "cpa") return Number(googleRow?.cpa ?? google.cpa ?? 0);
    if (key === "clicks") return Number(google.clicks ?? 0);
    if (key === "impressions") return Number(google.impressions ?? 0);
    if (key === "ctr") return Number(google.ctr ?? 0);
  }

  return null;
}

function metricNeedsAnalytics(metric: string) {
  return metric === "conversion_rate";
}

function metricNeedsGoogle(metric: string) {
  return metric === "clicks" || metric === "impressions" || metric === "ctr";
}

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  const metric = request.nextUrl.searchParams.get("metric");
  const startDate = request.nextUrl.searchParams.get("startDate");
  const endDate = request.nextUrl.searchParams.get("endDate");

  if (!businessId || !metric || !startDate || !endDate) {
    return NextResponse.json(
      { error: "missing_params", message: "businessId, metric, startDate, and endDate are required." },
      { status: 400 }
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  const dates = enumerateDays(startDate, endDate);
  const includeAnalytics = metricNeedsAnalytics(metric);
  const includeGoogle = metricNeedsGoogle(metric) || metric.startsWith("google-");

  const data = await Promise.all(
    dates.map(async (date) => {
      const [overview, google, analytics] = await Promise.all([
        fetchInternal<OverviewPayload>(request, "/api/overview", {
          businessId,
          startDate: date,
          endDate: date,
        }),
        includeGoogle
          ? fetchInternal<GoogleOverviewPayload>(request, "/api/google-ads/overview", {
              businessId,
              dateRange: "custom",
              customStart: date,
              customEnd: date,
              compareMode: "none",
            })
          : Promise.resolve(null),
        includeAnalytics
          ? fetchInternal<AnalyticsOverviewPayload>(request, "/api/analytics/overview", {
              businessId,
              startDate: date,
              endDate: date,
            })
          : Promise.resolve(null),
      ]);

      return {
        date,
        value: Number(getMetricValue(metric, { overview, google, analytics }) ?? 0),
      };
    })
  );

  return NextResponse.json({
    metric,
    data,
  });
}
