import { getCachedReport, getReportingDateRangeKey } from "@/lib/reporting-cache";
import {
  resolveGa4AnalyticsContext,
  runGA4Report,
} from "@/lib/google-analytics-reporting";

const GA4_FALLBACK_CACHE_TTL_MINUTES = 15;
const GA4_FALLBACK_ERROR_COOLDOWN_MS = 10 * 60 * 1000;
const ga4FallbackFailureUntilByBusiness = new Map<string, number>();

export interface Ga4EcommerceFallback {
  purchases: number;
  revenue: number;
  averageOrderValue: number | null;
}

export async function getGa4EcommerceFallbackData(
  businessId: string,
  startDate: string,
  endDate: string,
): Promise<Ga4EcommerceFallback | null> {
  const failureUntil = ga4FallbackFailureUntilByBusiness.get(businessId) ?? 0;
  if (failureUntil > Date.now()) return null;

  const dateRangeKey = getReportingDateRangeKey(startDate, endDate);
  const cached = await getCachedReport<Ga4EcommerceFallback>({
    businessId,
    provider: "ga4",
    reportType: "ecommerce_fallback",
    dateRangeKey,
    maxAgeMinutes: GA4_FALLBACK_CACHE_TTL_MINUTES,
  });
  if (cached) return cached;

  try {
    const context = await resolveGa4AnalyticsContext(businessId, {
      requireProperty: true,
    });
    if (!context.propertyId) return null;

    const report = await runGA4Report({
      propertyId: context.propertyId,
      accessToken: context.accessToken,
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: "ecommercePurchases" },
        { name: "purchaseRevenue" },
        { name: "averagePurchaseRevenuePerPayingUser" },
      ],
    });

    const totalsRow = report.totals?.[0] ?? report.rows[0];
    if (!totalsRow) return null;

    const purchases = parseFloat(totalsRow.metrics[0] ?? "0") || 0;
    const revenue = parseFloat(totalsRow.metrics[1] ?? "0") || 0;
    const averageOrderValueMetric = parseFloat(totalsRow.metrics[2] ?? "0") || 0;

    ga4FallbackFailureUntilByBusiness.delete(businessId);

    return {
      purchases,
      revenue,
      averageOrderValue:
        averageOrderValueMetric > 0
          ? averageOrderValueMetric
          : purchases > 0
            ? revenue / purchases
            : null,
    };
  } catch (error) {
    ga4FallbackFailureUntilByBusiness.set(
      businessId,
      Date.now() + GA4_FALLBACK_ERROR_COOLDOWN_MS,
    );
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[overview] ga4 ecommerce fallback unavailable", { businessId, message });
    return null;
  }
}

