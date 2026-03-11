import { getIntegration, upsertIntegration } from "@/lib/integrations";
import { refreshGA4AccessToken } from "@/lib/google-analytics-accounts";

const REPORTING_API_BASE = "https://analyticsdata.googleapis.com/v1beta";

// ── Types ──────────────────────────────────────────────────────────

export interface GA4DateRange {
  startDate: string; // "YYYY-MM-DD"
  endDate: string;
}

interface RunReportParams {
  propertyId: string;
  accessToken: string;
  dateRanges: GA4DateRange[];
  dimensions?: Array<{ name: string }>;
  metrics: Array<{ name: string }>;
  dimensionFilter?: object;
  orderBys?: object[];
  limit?: number;
  keepEmptyRows?: boolean;
}

export interface GA4ReportRow {
  dimensions: string[];
  metrics: string[];
}

export interface GA4ReportResult {
  dimensionHeaders: string[];
  metricHeaders: string[];
  rows: GA4ReportRow[];
  rowCount: number;
  totals?: GA4ReportRow[];
}

// ── Core Report Runner ─────────────────────────────────────────────

export async function runGA4Report(
  params: RunReportParams
): Promise<GA4ReportResult> {
  // Strip "properties/" prefix if present to get numeric ID
  const numericId = params.propertyId.replace(/^properties\//, "");
  const url = `${REPORTING_API_BASE}/properties/${numericId}:runReport`;

  const body: Record<string, unknown> = {
    dateRanges: params.dateRanges,
    metrics: params.metrics,
  };
  if (params.dimensions) body.dimensions = params.dimensions;
  if (params.dimensionFilter) body.dimensionFilter = params.dimensionFilter;
  if (params.orderBys) body.orderBys = params.orderBys;
  if (params.limit) body.limit = params.limit;
  if (params.keepEmptyRows !== undefined)
    body.keepEmptyRows = params.keepEmptyRows;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`GA4 Reporting API error ${res.status}: ${errorText}`);
  }

  const data = await res.json();

  const dimensionHeaders: string[] =
    (data.dimensionHeaders ?? []).map((h: { name: string }) => h.name);
  const metricHeaders: string[] =
    (data.metricHeaders ?? []).map((h: { name: string }) => h.name);

  const rows: GA4ReportRow[] = (data.rows ?? []).map(
    (row: {
      dimensionValues?: Array<{ value: string }>;
      metricValues?: Array<{ value: string }>;
    }) => ({
      dimensions: (row.dimensionValues ?? []).map((d) => d.value ?? ""),
      metrics: (row.metricValues ?? []).map((m) => m.value ?? "0"),
    })
  );

  const totals: GA4ReportRow[] | undefined = data.totals
    ? (data.totals as Array<{
        dimensionValues?: Array<{ value: string }>;
        metricValues?: Array<{ value: string }>;
      }>).map((row) => ({
        dimensions: (row.dimensionValues ?? []).map((d) => d.value ?? ""),
        metrics: (row.metricValues ?? []).map((m) => m.value ?? "0"),
      }))
    : undefined;

  return {
    dimensionHeaders,
    metricHeaders,
    rows,
    rowCount: data.rowCount ?? rows.length,
    totals,
  };
}

// ── Token Helper ───────────────────────────────────────────────────

/**
 * Gets a valid GA4 access token for a business, refreshing if needed.
 * Returns { accessToken, propertyId } or throws with a structured error.
 */
export async function getGA4TokenAndProperty(
  businessId: string
): Promise<{ accessToken: string; propertyId: string; propertyName: string }> {
  const integration = await getIntegration(businessId, "ga4");

  if (!integration || integration.status !== "connected") {
    throw new GA4AuthError("integration_not_found", "GA4 not connected.");
  }

  const metadata = (integration.metadata ?? {}) as Record<string, unknown>;
  const propertyId =
    typeof metadata.ga4PropertyId === "string" ? metadata.ga4PropertyId : null;
  const propertyName =
    typeof metadata.ga4PropertyName === "string"
      ? metadata.ga4PropertyName
      : "";

  if (!propertyId) {
    throw new GA4AuthError(
      "no_property_selected",
      "No GA4 property selected for this business."
    );
  }

  let accessToken = integration.access_token;
  const refreshToken = integration.refresh_token;

  if (integration.token_expires_at) {
    const isExpired =
      new Date(integration.token_expires_at).getTime() <= Date.now();
    if (isExpired && refreshToken) {
      const refreshed = await refreshGA4AccessToken(refreshToken);
      accessToken = refreshed.accessToken;
      await upsertIntegration({
        businessId,
        provider: "ga4",
        status: "connected",
        accessToken: refreshed.accessToken,
        tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
      });
    } else if (isExpired && !refreshToken) {
      throw new GA4AuthError(
        "token_expired",
        "GA4 access token expired. Please reconnect."
      );
    }
  }

  if (!accessToken) {
    throw new GA4AuthError(
      "missing_token",
      "GA4 access token is missing. Please reconnect."
    );
  }

  return { accessToken, propertyId, propertyName };
}

export class GA4AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "GA4AuthError";
  }
}

// ── Insight Generator ──────────────────────────────────────────────

export interface AnalyticsInsight {
  type: "positive" | "warning" | "neutral";
  text: string;
}

export function generateInsights(data: {
  overview?: { sessions: number; engagedSessions: number; purchases: number; revenue: number };
  products?: Array<{ name: string; views: number; atcRate: number; purchaseRate: number }>;
  landingPages?: Array<{ path: string; sessions: number; engagementRate: number; purchaseCvr: number }>;
  audience?: { newSessions: number; newPurchases: number; returningSessions: number; returningPurchases: number };
  demographics?: { dimension: string; topValue: string; topValuePurchaseCvr: number; avgPurchaseCvr: number };
}): AnalyticsInsight[] {
  const insights: AnalyticsInsight[] = [];

  // Returning vs new users
  if (data.audience) {
    const { newSessions, newPurchases, returningSessions, returningPurchases } =
      data.audience;
    const newCvr = newSessions > 0 ? newPurchases / newSessions : 0;
    const returningCvr =
      returningSessions > 0 ? returningPurchases / returningSessions : 0;
    if (returningCvr > 0 && newCvr > 0) {
      const multiplier = returningCvr / newCvr;
      if (multiplier >= 1.5) {
        insights.push({
          type: "positive",
          text: `Returning users convert ${multiplier.toFixed(1)}× better than new visitors.`,
        });
      }
    }
  }

  // Top converting product
  if (data.products && data.products.length > 0) {
    const sorted = [...data.products].sort((a, b) => b.atcRate - a.atcRate);
    const best = sorted[0];
    if (best.atcRate > 0.1) {
      insights.push({
        type: "positive",
        text: `"${best.name}" has the highest add-to-cart rate at ${(best.atcRate * 100).toFixed(1)}%.`,
      });
    }
    // Worst performer with decent traffic
    const highTrafficLowConvert = data.products
      .filter((p) => p.views > 50 && p.purchaseRate < 0.01)
      .sort((a, b) => b.views - a.views)[0];
    if (highTrafficLowConvert) {
      insights.push({
        type: "warning",
        text: `"${highTrafficLowConvert.name}" gets traffic but has a very low purchase rate — check the product page.`,
      });
    }
  }

  // Landing page with high traffic but low engagement
  if (data.landingPages && data.landingPages.length > 0) {
    const highTrafficLowEngage = data.landingPages
      .filter(
        (p) => p.sessions > 100 && p.engagementRate < 0.3
      )
      .sort((a, b) => b.sessions - a.sessions)[0];
    if (highTrafficLowEngage) {
      insights.push({
        type: "warning",
        text: `${highTrafficLowEngage.path} gets high traffic but low engagement (${(highTrafficLowEngage.engagementRate * 100).toFixed(0)}%) — review content relevance.`,
      });
    }

    // Best converting landing page
    const bestPage = [...data.landingPages]
      .filter((p) => p.sessions > 30)
      .sort((a, b) => b.purchaseCvr - a.purchaseCvr)[0];
    if (bestPage && bestPage.purchaseCvr > 0.02) {
      insights.push({
        type: "positive",
        text: `${bestPage.path} is your top-converting landing page at ${(bestPage.purchaseCvr * 100).toFixed(1)}% purchase CVR.`,
      });
    }
  }

  // Overall engagement health
  if (data.overview) {
    const engagementRate =
      data.overview.sessions > 0
        ? data.overview.engagedSessions / data.overview.sessions
        : 0;
    if (engagementRate < 0.4 && data.overview.sessions > 200) {
      insights.push({
        type: "warning",
        text: `Overall engagement rate is low at ${(engagementRate * 100).toFixed(0)}% — check traffic quality and landing page relevance.`,
      });
    }
  }

  // Top demographic
  if (data.demographics && data.demographics.topValuePurchaseCvr > 0) {
    const lift =
      data.demographics.avgPurchaseCvr > 0
        ? data.demographics.topValuePurchaseCvr /
          data.demographics.avgPurchaseCvr
        : 0;
    if (lift >= 1.5) {
      insights.push({
        type: "positive",
        text: `${data.demographics.dimension} "${data.demographics.topValue}" converts ${lift.toFixed(1)}× above average.`,
      });
    }
  }

  return insights.slice(0, 5);
}
