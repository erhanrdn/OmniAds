import { getDb } from "@/lib/db";
import {
  generateDailyInsights,
  type BusinessMetricsSummary,
} from "@/lib/ai/generate-daily-insights";
import { saveInsight, saveInsightFailure } from "@/lib/ai/save-insight";

interface BusinessRow {
  id: string;
  name: string;
  currency: string;
  is_demo_business: boolean;
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

/**
 * Build a summarized metrics payload for a business.
 * Gathers data from integrations, provider_account_snapshots,
 * and meta_creatives_snapshots — keeps payload small for AI.
 */
async function buildBusinessSummary(
  business: BusinessRow,
  insightDate: string,
): Promise<BusinessMetricsSummary> {
  const sql = getDb();

  // Get connected integrations for this business
  const integrations = (await sql`
    SELECT provider, status FROM integrations
    WHERE business_id = ${business.id} AND status = 'connected'
  `) as Array<{ provider: string; status: string }>;

  const connectedProviders = new Set(
    integrations.map((i) => i.provider),
  );

  const channels: BusinessMetricsSummary["channels"] = {};
  let totalSpend = 0;
  let totalRevenue = 0;
  let totalPurchases = 0;

  // Pull latest provider account snapshots (contains aggregated metrics)
  const snapshots = (await sql`
    SELECT provider, accounts_payload
    FROM provider_account_snapshots
    WHERE business_id = ${business.id}
      AND refresh_failed = FALSE
    ORDER BY fetched_at DESC
  `) as Array<{ provider: string; accounts_payload: unknown }>;

  for (const snapshot of snapshots) {
    if (!connectedProviders.has(snapshot.provider)) continue;
    const accounts = snapshot.accounts_payload as Array<{
      name?: string;
      spend?: number;
      revenue?: number;
      roas?: number;
      purchases?: number;
      cpa?: number;
    }>;

    if (!Array.isArray(accounts)) continue;

    let chSpend = 0;
    let chRevenue = 0;
    let chPurchases = 0;

    for (const account of accounts) {
      chSpend += account.spend ?? 0;
      chRevenue += account.revenue ?? 0;
      chPurchases += account.purchases ?? 0;
    }

    const chRoas = chSpend > 0 ? chRevenue / chSpend : 0;
    const chCpa = chPurchases > 0 ? chSpend / chPurchases : 0;

    channels[snapshot.provider] = {
      spend: chSpend,
      revenue: chRevenue,
      roas: chRoas,
      purchases: chPurchases,
      cpa: chCpa,
    };

    totalSpend += chSpend;
    totalRevenue += chRevenue;
    totalPurchases += chPurchases;
  }

  const overallRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const overallCpa = totalPurchases > 0 ? totalSpend / totalPurchases : 0;

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
    const creatives = creativeSnapshot[0].payload as Array<{
      name?: string;
      roas?: number;
      spend?: number;
    }>;

    if (Array.isArray(creatives)) {
      const withSpend = creatives.filter(
        (c) => (c.spend ?? 0) > 0 && c.name,
      );
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
      ctr: 0, // CTR requires impression-level data, omit if unavailable
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
    try {
      const summary = await buildBusinessSummary(business, today);

      // Skip businesses with no data (no spend at all)
      if (summary.metrics.totalSpend === 0 && Object.keys(summary.channels).length === 0) {
        result.skipped++;
        console.log(
          `[ai-daily] Skipping ${business.name} (${business.id}) — no metrics data`,
        );
        continue;
      }

      const { insight, raw } = await generateDailyInsights(summary);

      await saveInsight({
        businessId: business.id,
        insightDate: today,
        insight,
        rawResponse: raw,
      });

      result.succeeded++;
      console.log(
        `[ai-daily] Generated insight for ${business.name} (${business.id})`,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error";
      result.failed++;
      result.errors.push({ businessId: business.id, error: message });

      console.error(
        `[ai-daily] Failed for ${business.name} (${business.id}):`,
        message,
      );

      // Save failure record for audit trail
      try {
        await saveInsightFailure({
          businessId: business.id,
          insightDate: today,
          errorMessage: message,
        });
      } catch {
        // Don't let failure logging crash the loop
      }
    }
  }

  console.log(
    `[ai-daily] Run complete: ${result.succeeded} succeeded, ${result.failed} failed, ${result.skipped} skipped out of ${result.total}`,
  );

  return result;
}
