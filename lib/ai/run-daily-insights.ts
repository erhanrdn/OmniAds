import { getDb } from "@/lib/db";
import {
  generateDailyInsights,
  type BusinessMetricsSummary,
} from "@/lib/ai/generate-daily-insights";
import { saveInsight, saveInsightFailure } from "@/lib/ai/save-insight";
import type { AppLanguage } from "@/lib/i18n";
import { getOverviewData } from "@/lib/overview-service";
import { logRuntimeInfo } from "@/lib/runtime-logging";

interface BusinessRow {
  id: string;
  name: string;
  currency: string;
  is_demo_business: boolean;
}

export interface SingleBusinessInsightResult {
  businessId: string;
  insightDate: string;
  status: "success" | "failed" | "skipped";
  error?: string;
}

function sanitizeAiErrorMessage(input: string): string {
  const normalized = input.toLowerCase();
  if (normalized.includes("incorrect api key") || normalized.includes("invalid_api_key")) {
    return "AI service is not configured correctly (invalid API key).";
  }
  if (normalized.includes("api key") && normalized.includes("not set")) {
    return "AI service is not configured (missing API key).";
  }
  if (normalized.includes("rate limit") || normalized.includes("quota")) {
    return "AI service is temporarily rate limited. Please try again shortly.";
  }
  return "AI generation failed. Please try again.";
}

/**
 * Fetch all real (non-demo) businesses from the database.
 */
async function fetchAllBusinesses(): Promise<BusinessRow[]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT id, name, currency, is_demo_business
    FROM businesses
    WHERE is_demo_business = FALSE
    ORDER BY created_at
  `) as BusinessRow[];
  return rows;
}

async function fetchBusinessById(businessId: string): Promise<BusinessRow | null> {
  const sql = getDb();
  const rows = (await sql`
    SELECT id, name, currency, is_demo_business
    FROM businesses
    WHERE id = ${businessId}
    LIMIT 1
  `) as BusinessRow[];
  return rows[0] ?? null;
}

/**
 * Build a summarized metrics payload for a business.
 * Gathers data from overview aggregates and creatives snapshots
 * to keep payload small for AI while staying metric-accurate.
 */
async function buildBusinessSummary(
  business: BusinessRow,
  insightDate: string,
): Promise<BusinessMetricsSummary> {
  const sql = getDb();

  const endDate = insightDate;
  const start = new Date(`${insightDate}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 6);
  const startDate = start.toISOString().slice(0, 10);

  const overview = await getOverviewData({
    businessId: business.id,
    startDate,
    endDate,
    includeTrends: false,
  });

  const channels: BusinessMetricsSummary["channels"] = {};

  for (const row of overview.platformEfficiency ?? []) {
    channels[row.platform] = {
      spend: row.spend ?? 0,
      revenue: row.revenue ?? 0,
      roas: row.roas ?? 0,
      purchases: row.purchases ?? 0,
      cpa: row.cpa ?? 0,
    };
  }

  const totalSpend = overview.kpis?.spend ?? 0;
  const totalRevenue = overview.kpis?.revenue ?? 0;
  const totalPurchases = overview.kpis?.purchases ?? 0;
  const overallRoas = overview.kpis?.roas ?? 0;
  const overallCpa = overview.kpis?.cpa ?? 0;
  const overallCtr = overview.totals?.ctr ?? 0;

  // Pull latest creative snapshot for top winners/losers
  const creativeSnapshot = (await sql`
    SELECT payload FROM meta_creatives_snapshots
    WHERE business_id = ${business.id}
      AND snapshot_level = 'full'
    ORDER BY last_synced_at DESC
    LIMIT 1
  `) as Array<{ payload: unknown }>;

  const topWinners: BusinessMetricsSummary["topWinners"] = [];
  const topLosers: BusinessMetricsSummary["topLosers"] = [];

  if (creativeSnapshot[0]?.payload) {
    const rawPayload = creativeSnapshot[0].payload;
    const creatives = (Array.isArray(rawPayload)
      ? rawPayload
      : rawPayload &&
          typeof rawPayload === "object" &&
          Array.isArray((rawPayload as { rows?: unknown }).rows)
        ? (rawPayload as { rows: unknown[] }).rows
        : []) as Array<{
      name?: string;
      roas?: number;
      spend?: number;
    }>;

    if (Array.isArray(creatives)) {
      const withSpend = creatives.filter((c) => (c.spend ?? 0) > 0 && c.name);
      const sorted = [...withSpend].sort(
        (a, b) => (b.roas ?? 0) - (a.roas ?? 0),
      );

      for (const c of sorted.slice(0, 5)) {
        topWinners.push({
          name: c.name!,
          roas: c.roas ?? 0,
          spend: c.spend ?? 0,
        });
      }
      for (const c of sorted.slice(-5).reverse()) {
        topLosers.push({
          name: c.name!,
          roas: c.roas ?? 0,
          spend: c.spend ?? 0,
        });
      }
    }
  }

  return {
    businessId: business.id,
    businessName: business.name,
    date: insightDate,
    currency: business.currency,
    channels,
    metrics: {
      totalSpend,
      totalRevenue,
      roas: overallRoas,
      totalPurchases,
      cpa: overallCpa,
      ctr: overallCtr,
    },
    trends7d: [], // Populated from overview endpoint if available
    topWinners,
    topLosers,
  };
}

export interface DailyInsightRunResult {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: Array<{ businessId: string; error: string }>;
}

export async function runDailyInsightForBusiness(params: {
  businessId: string;
  insightDate?: string;
  locale?: AppLanguage;
}): Promise<SingleBusinessInsightResult> {
  const insightDate = params.insightDate ?? new Date().toISOString().split("T")[0];
  const locale = params.locale ?? "en";
  const business = await fetchBusinessById(params.businessId);

  if (!business || business.is_demo_business) {
    return {
      businessId: params.businessId,
      insightDate,
      status: "skipped",
      error: "Business not found or is demo.",
    };
  }

  try {
    const summary = await buildBusinessSummary(business, insightDate);

    if (
      summary.metrics.totalSpend === 0 &&
      Object.keys(summary.channels).length === 0
    ) {
      return {
        businessId: business.id,
        insightDate,
        status: "skipped",
        error: "No metrics data.",
      };
    }

    const { insight, raw } = await generateDailyInsights(summary, locale);
    await saveInsight({
      businessId: business.id,
      insightDate,
      locale,
      insight,
      rawResponse: raw,
    });

    return {
      businessId: business.id,
      insightDate,
      status: "success",
    };
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "Unknown error";
    const message = sanitizeAiErrorMessage(rawMessage);
    await saveInsightFailure({
      businessId: params.businessId,
      insightDate,
      locale,
      errorMessage: message,
    }).catch(() => undefined);

    return {
      businessId: params.businessId,
      insightDate,
      status: "failed",
      error: message,
    };
  }
}

/**
 * Run daily AI insight generation for all businesses.
 *
 * Flow:
 *  1. Fetch all real businesses
 *  2. For each: build summarized metrics → call AI → save result
 *  3. Never crashes — logs errors and continues
 */
export async function runDailyInsights(): Promise<DailyInsightRunResult> {
  const today = new Date().toISOString().split("T")[0];
  const businesses = await fetchAllBusinesses();

  const result: DailyInsightRunResult = {
    total: businesses.length,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  for (const business of businesses) {
    const single = await runDailyInsightForBusiness({
      businessId: business.id,
      insightDate: today,
    });

    if (single.status === "success") {
      result.succeeded++;
      logRuntimeInfo("ai-daily", "generated_insight", {
        businessId: business.id,
        businessName: business.name,
      });
      continue;
    }

    if (single.status === "skipped") {
      result.skipped++;
      logRuntimeInfo("ai-daily", "skipped", {
        businessId: business.id,
        businessName: business.name,
        reason: single.error ?? "no metrics data",
      });
      continue;
    }

    result.failed++;
    result.errors.push({
      businessId: business.id,
      error: single.error ?? "Unknown error",
    });
    console.error(
      `[ai-daily] Failed for ${business.name} (${business.id}):`,
      single.error ?? "Unknown error",
    );
  }

  logRuntimeInfo("ai-daily", "run_complete", {
    succeeded: result.succeeded,
    failed: result.failed,
    skipped: result.skipped,
    total: result.total,
  });

  return result;
}
