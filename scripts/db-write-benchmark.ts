import { getDbWithTimeout } from "@/lib/db";
import {
  parseCliArgs,
  getOptionalCliValue,
  summarizeDurations,
  writeJsonFile,
  normalizeDate,
  normalizeTimestamp,
} from "./db-normalization-support";
import { configureOperationalScriptRuntime, withOperationalStartupLogsSilenced } from "./_operational-runtime";
import { createBusinessWithAdminMembership, createUser } from "@/lib/account-store";
import { upsertIntegration } from "@/lib/integrations";
import { upsertProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { upsertMetaAccountDailyRows } from "@/lib/meta/warehouse";
import { upsertGoogleAdsDailyRows } from "@/lib/google-ads/warehouse";
import {
  upsertShopifyOrderLines,
  upsertShopifyOrders,
  upsertShopifyOrderTransactions,
  upsertShopifyRefunds,
} from "@/lib/shopify/warehouse";
import { materializeOverviewSummaryRange, materializeOverviewSummaryRows } from "@/lib/overview-summary-materializer";
import { writeCachedReportSnapshot } from "@/lib/reporting-cache-writer";
import { persistShopifyOverviewServingState } from "@/lib/shopify/overview-materializer";

type BenchmarkScenarioResult = {
  name: string;
  iterations: number;
  averageMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  sampleCardinality: number | null;
  validityNote: string;
};

type ExplainPlanSummary = {
  name: string;
  planningTimeMs: number | null;
  executionTimeMs: number | null;
  sharedHitBlocks: number | null;
  sharedReadBlocks: number | null;
  planRows: number | null;
  totalCost: number | null;
  error?: string | null;
};

type BenchmarkPayload = {
  measuredAt: string;
  iterations: number;
  scenarios: BenchmarkScenarioResult[];
  explainPlans: ExplainPlanSummary[];
};

type ScenarioObservation = {
  sampleCardinality: number | null;
  validityNote: string;
};

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function describeScenarioError(error: unknown) {
  if (error instanceof Error) {
    return error.message.replace(/\s+/g, " ").trim();
  }
  return String(error).replace(/\s+/g, " ").trim();
}

async function measureScenario(
  name: string,
  iterations: number,
  operation: (iteration: number) => Promise<ScenarioObservation>,
) {
  const durations: number[] = [];
  const sampleCardinalities: Array<number | null> = [];
  const validityNotes: string[] = [];

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const startedAt = performance.now();
    try {
      const result = await operation(iteration);
      durations.push(performance.now() - startedAt);
      sampleCardinalities.push(result.sampleCardinality);
      validityNotes.push(result.validityNote);
    } catch (error) {
      durations.push(performance.now() - startedAt);
      sampleCardinalities.push(null);
      validityNotes.push(`error:${describeScenarioError(error)}`);
    }
  }

  const summary = summarizeDurations(durations);
  const sampleCardinality = sampleCardinalities[0] ?? null;
  const cardinalityStable = sampleCardinalities.every((value) => value === sampleCardinality);

  return {
    name,
    iterations,
    ...summary,
    sampleCardinality,
    validityNote: [...new Set(validityNotes), ...(cardinalityStable ? [] : ["sample_cardinality_changed"])].join("|"),
  } satisfies BenchmarkScenarioResult;
}

async function cleanupBenchmarkRows(input: {
  businessId?: string | null;
  businessIds?: string[];
  userEmail?: string | null;
  provider?: string | null;
  providerAccounts?: Array<{
    provider: string;
    externalAccountId: string;
  }>;
}) {
  const sql = getDbWithTimeout(60_000);
  const businessIds = [...new Set((input.businessIds ?? []).concat(input.businessId ? [input.businessId] : []))];
  for (const businessId of businessIds) {
    await sql.query("DELETE FROM provider_account_snapshot_items WHERE snapshot_run_id IN (SELECT id FROM provider_account_snapshot_runs WHERE business_id = $1)", [businessId]).catch(() => null);
    await sql.query("DELETE FROM provider_account_snapshot_runs WHERE business_id = $1", [businessId]).catch(() => null);
    await sql.query("DELETE FROM business_provider_accounts WHERE business_id = $1", [businessId]).catch(() => null);
    await sql.query("DELETE FROM integration_credentials WHERE provider_connection_id IN (SELECT id FROM provider_connections WHERE business_id = $1)", [businessId]).catch(() => null);
    await sql.query("DELETE FROM provider_connections WHERE business_id = $1", [businessId]).catch(() => null);
    await sql.query("DELETE FROM meta_account_daily WHERE business_id = $1", [businessId]).catch(() => null);
    await sql.query("DELETE FROM google_ads_campaign_daily WHERE business_id = $1", [businessId]).catch(() => null);
    await sql.query("DELETE FROM shopify_order_lines WHERE business_id = $1", [businessId]).catch(() => null);
    await sql.query("DELETE FROM shopify_order_transactions WHERE business_id = $1", [businessId]).catch(() => null);
    await sql.query("DELETE FROM shopify_refunds WHERE business_id = $1", [businessId]).catch(() => null);
    await sql.query("DELETE FROM shopify_orders WHERE business_id = $1", [businessId]).catch(() => null);
    await sql.query("DELETE FROM provider_reporting_snapshots WHERE business_id = $1", [businessId]).catch(() => null);
    await sql.query("DELETE FROM platform_overview_daily_summary WHERE business_id = $1", [businessId]).catch(() => null);
    await sql.query("DELETE FROM platform_overview_summary_ranges WHERE business_id = $1", [businessId]).catch(() => null);
    await sql.query("DELETE FROM shopify_serving_state_history WHERE business_id = $1", [businessId]).catch(() => null);
    await sql.query("DELETE FROM shopify_serving_state WHERE business_id = $1", [businessId]).catch(() => null);
    await sql.query("DELETE FROM memberships WHERE business_id::text = $1", [businessId]).catch(() => null);
    await sql.query("DELETE FROM invites WHERE business_id::text = $1", [businessId]).catch(() => null);
    await sql.query("DELETE FROM businesses WHERE id::text = $1", [businessId]).catch(() => null);
  }

  for (const account of input.providerAccounts ?? []) {
    await sql.query(
      "DELETE FROM provider_accounts WHERE provider = $1 AND external_account_id = $2",
      [account.provider, account.externalAccountId],
    ).catch(() => null);
  }

  if (input.userEmail) {
    const rows = await sql.query<{ id: string }>(
      "SELECT id FROM users WHERE lower(email) = lower($1)",
      [input.userEmail],
    ).catch(() => []);
    for (const row of rows) {
      await sql.query("DELETE FROM sessions WHERE user_id = $1", [row.id]).catch(() => null);
      await sql.query("DELETE FROM memberships WHERE user_id = $1", [row.id]).catch(() => null);
      await sql.query("DELETE FROM invites WHERE invited_by_user_id = $1", [row.id]).catch(() => null);
    }
    await sql.query("DELETE FROM users WHERE lower(email) = lower($1)", [input.userEmail]).catch(() => null);
  }
}

async function captureExplainPlan(name: string, queryText: string, params: unknown[]) {
  const sql = getDbWithTimeout(60_000);
  await sql.query("BEGIN");
  try {
    const rows = await sql.query<{ "QUERY PLAN": unknown }>(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${queryText}`,
      params,
    );
    const planEnvelope = rows[0]?.["QUERY PLAN"] as Array<Record<string, unknown>> | undefined;
    const root = planEnvelope?.[0] ?? {};
    const plan = (root.Plan ?? {}) as Record<string, unknown>;
    return {
      name,
      planningTimeMs: typeof root["Planning Time"] === "number" ? Number(root["Planning Time"].toFixed(2)) : null,
      executionTimeMs: typeof root["Execution Time"] === "number" ? Number(root["Execution Time"].toFixed(2)) : null,
      sharedHitBlocks: toNumber(plan["Shared Hit Blocks"] ?? root["Shared Hit Blocks"]) || null,
      sharedReadBlocks: toNumber(plan["Shared Read Blocks"] ?? root["Shared Read Blocks"]) || null,
      planRows: toNumber(plan["Plan Rows"]) || null,
      totalCost: toNumber(plan["Total Cost"]) || null,
    } satisfies ExplainPlanSummary;
  } catch (error) {
    return {
      name,
      planningTimeMs: null,
      executionTimeMs: null,
      sharedHitBlocks: null,
      sharedReadBlocks: null,
      planRows: null,
      totalCost: null,
      error: describeScenarioError(error),
    } satisfies ExplainPlanSummary;
  } finally {
    await sql.query("ROLLBACK").catch(() => null);
  }
}

async function main() {
  configureOperationalScriptRuntime();
  const parsed = parseCliArgs(process.argv.slice(2));
  const iterations = Math.max(1, Number(getOptionalCliValue(parsed, "iterations", "3") ?? "3"));
  const outPath = getOptionalCliValue(parsed, "out");
  const marker = `db-normalization-benchmark-${Date.now()}`;

  const payload = await withOperationalStartupLogsSilenced(async () => {
    const scenarios = [
      await measureScenario("core_write_cycle", iterations, async (iteration) => {
        const suffix = `${marker}-core-${iteration}`;
        const email = `${suffix}@example.com`;
        const user = await createUser({
          name: `Benchmark ${suffix}`,
          email,
          passwordHash: "benchmark-hash",
        });
        let businessId: string | null = null;
        try {
          const business = await createBusinessWithAdminMembership({
            name: `Benchmark ${suffix}`,
            ownerId: user.id,
            currency: "USD",
          });
          businessId = business.id;
          await upsertIntegration({
            businessId: business.id,
            provider: "google",
            status: "connected",
            providerAccountId: `acct-${suffix}`,
            providerAccountName: `Google ${suffix}`,
            accessToken: `access-${suffix}`,
            refreshToken: `refresh-${suffix}`,
            scopes: "scope:a scope:b",
          });
          await upsertProviderAccountAssignments({
            businessId: business.id,
            provider: "google",
            accountIds: [`acct-${suffix}`, `acct-${suffix}-2`],
          });
          return {
            sampleCardinality: 2,
            validityNote: "valid",
          } satisfies ScenarioObservation;
        } finally {
          await cleanupBenchmarkRows({
            businessId,
            userEmail: email,
            providerAccounts: [
              { provider: "google", externalAccountId: `acct-${suffix}` },
              { provider: "google", externalAccountId: `acct-${suffix}-2` },
            ],
          });
        }
      }),
      await measureScenario("warehouse_write_cycle_meta", iterations, async (iteration) => {
        const businessId = `${marker}-meta`;
        const providerAccountId = `meta-act-${iteration}`;
        try {
          await upsertMetaAccountDailyRows([
            {
              businessId,
              providerAccountId,
              date: normalizeDate(new Date()) ?? new Date().toISOString().slice(0, 10),
              accountName: `Meta ${iteration}`,
              accountTimezone: "UTC",
              accountCurrency: "USD",
              spend: 12.34,
              impressions: 120,
              clicks: 12,
              reach: 100,
              frequency: 1.2,
              conversions: 4,
              revenue: 56.78,
              roas: 4.6,
              cpa: 3.08,
              ctr: 0.1,
              cpc: 1.03,
              sourceSnapshotId: null,
            },
          ]);
          return {
            sampleCardinality: 1,
            validityNote: "valid",
          } satisfies ScenarioObservation;
        } finally {
          await cleanupBenchmarkRows({
            businessId,
            providerAccounts: [{ provider: "meta", externalAccountId: providerAccountId }],
          });
        }
      }),
      await measureScenario("warehouse_write_cycle_google", iterations, async (iteration) => {
        const businessId = `${marker}-google`;
        const providerAccountId = `google-act-${iteration}`;
        try {
          await upsertGoogleAdsDailyRows("campaign_daily", [
            {
              businessId,
              providerAccountId,
              date: normalizeDate(new Date()) ?? new Date().toISOString().slice(0, 10),
              accountTimezone: "UTC",
              accountCurrency: "USD",
              entityKey: `campaign-${iteration}`,
              entityLabel: `Campaign ${iteration}`,
              campaignId: `campaign-${iteration}`,
              campaignName: `Campaign ${iteration}`,
              adGroupId: null,
              adGroupName: null,
              status: "ENABLED",
              channel: "SEARCH",
              classification: "search",
              payloadJson: { benchmark: true, iteration },
              spend: 34.56,
              revenue: 123.45,
              conversions: 7,
              impressions: 456,
              clicks: 45,
              ctr: 0.0987,
              cpc: 0.77,
              cpa: 4.93,
              roas: 3.57,
              conversionRate: 0.15,
              interactionRate: 0.15,
              sourceSnapshotId: null,
            },
          ]);
          return {
            sampleCardinality: 1,
            validityNote: "valid",
          } satisfies ScenarioObservation;
        } finally {
          await cleanupBenchmarkRows({
            businessId,
            providerAccounts: [{ provider: "google", externalAccountId: providerAccountId }],
          });
        }
      }),
      await measureScenario("warehouse_write_cycle_shopify", iterations, async (iteration) => {
        const businessId = `${marker}-shopify`;
        const providerAccountId = `shopify-act-${iteration}`;
        const shopId = `shop-${iteration}`;
        const orderId = `order-${iteration}`;
        try {
          await upsertShopifyOrders([
            {
              businessId,
              providerAccountId,
              shopId,
              orderId,
              orderName: `Order ${iteration}`,
              orderCreatedAt: normalizeTimestamp(new Date()) ?? new Date().toISOString(),
              orderCreatedDateLocal: normalizeDate(new Date()),
              financialStatus: "paid",
              fulfillmentStatus: "fulfilled",
              subtotalPrice: 100,
              totalDiscounts: 5,
              totalShipping: 10,
              totalTax: 8,
              totalRefunded: 0,
              totalPrice: 113,
              originalTotalPrice: 113,
              currentTotalPrice: 113,
              payloadJson: { benchmark: true, iteration },
            },
          ]);
          await upsertShopifyOrderLines([
            {
              businessId,
              providerAccountId,
              shopId,
              orderId,
              lineItemId: `line-${iteration}`,
              productId: `product-${iteration}`,
              variantId: `variant-${iteration}`,
              sku: `sku-${iteration}`,
              title: "Benchmark product",
              quantity: 1,
              discountedTotal: 95,
              originalTotal: 100,
              taxTotal: 8,
              payloadJson: { benchmark: true },
            },
          ]);
          await upsertShopifyRefunds([
            {
              businessId,
              providerAccountId,
              shopId,
              orderId,
              refundId: `refund-${iteration}`,
              refundedAt: normalizeTimestamp(new Date()) ?? new Date().toISOString(),
              refundedDateLocal: normalizeDate(new Date()),
              refundedSales: 5,
              refundedShipping: 0,
              refundedTaxes: 0,
              totalRefunded: 5,
              payloadJson: { benchmark: true },
            },
          ]);
          await upsertShopifyOrderTransactions([
            {
              businessId,
              providerAccountId,
              shopId,
              orderId,
              transactionId: `transaction-${iteration}`,
              kind: "sale",
              status: "success",
              gateway: "benchmark",
              processedAt: normalizeTimestamp(new Date()) ?? new Date().toISOString(),
              amount: 113,
              currencyCode: "USD",
              payloadJson: { benchmark: true },
            },
          ]);
          return {
            sampleCardinality: 4,
            validityNote: "valid",
          } satisfies ScenarioObservation;
        } finally {
          await cleanupBenchmarkRows({
            businessId,
            providerAccounts: [{ provider: "shopify", externalAccountId: providerAccountId }],
          });
        }
      }),
      await measureScenario("serving_write_cycle", iterations, async (iteration) => {
        const businessId = `${marker}-serving`;
        const providerAccountId = `serving-act-${iteration}`;
        const date = normalizeDate(new Date()) ?? new Date().toISOString().slice(0, 10);
        try {
          await materializeOverviewSummaryRows([
            {
              businessId,
              provider: "google",
              providerAccountId,
              date,
              spend: 10,
              revenue: 40,
              purchases: 3,
              impressions: 100,
              clicks: 11,
              sourceUpdatedAt: normalizeTimestamp(new Date()),
              updatedAt: null,
            },
          ]);
          await materializeOverviewSummaryRange({
            businessId,
            provider: "google",
            providerAccountIds: [providerAccountId],
            startDate: date,
            endDate: date,
            rowCount: 1,
            expectedRowCount: 1,
            coverageComplete: true,
            maxSourceUpdatedAt: normalizeTimestamp(new Date()),
            truthState: "finalized",
          });
          await writeCachedReportSnapshot({
            businessId,
            provider: "google",
            reportType: "benchmark_report",
            dateRangeKey: date,
            payload: { iteration, ok: true },
          });
          await persistShopifyOverviewServingState({
            businessId,
            providerAccountId,
            canaryKey: "benchmark",
            startDate: date,
            endDate: date,
            assessedAt: normalizeTimestamp(new Date()),
            statusState: "ready",
            preferredSource: "warehouse",
            canServeWarehouse: true,
            canaryEnabled: true,
            decisionReasons: ["benchmark"],
            divergence: { delta: 0 },
          });
          return {
            sampleCardinality: 4,
            validityNote: "valid",
          } satisfies ScenarioObservation;
        } finally {
          await cleanupBenchmarkRows({
            businessId,
            providerAccounts: [{ provider: "google", externalAccountId: providerAccountId }],
          });
        }
      }),
    ];

    const explainPlans = [
      await captureExplainPlan(
        "provider_connection_credentials_upsert",
        `
          WITH connection AS (
            INSERT INTO provider_connections (
              business_id,
              provider,
              status,
              provider_account_ref_id,
              provider_account_id,
              provider_account_name,
              updated_at
            )
            VALUES ($1,$2,$3,NULL,$4,$5,now())
            ON CONFLICT (business_id, provider) DO UPDATE SET
              status = EXCLUDED.status,
              provider_account_id = EXCLUDED.provider_account_id,
              provider_account_name = EXCLUDED.provider_account_name,
              updated_at = EXCLUDED.updated_at
            RETURNING id
          )
          INSERT INTO integration_credentials (
            provider_connection_id,
            access_token,
            refresh_token,
            scopes,
            error_message,
            metadata,
            updated_at
          )
          SELECT
            id,
            $6,
            $7,
            $8,
            $9,
            $10::jsonb,
            now()
          FROM connection
          ON CONFLICT (provider_connection_id) DO UPDATE SET
            access_token = COALESCE(EXCLUDED.access_token, integration_credentials.access_token),
            refresh_token = COALESCE(EXCLUDED.refresh_token, integration_credentials.refresh_token),
            scopes = COALESCE(EXCLUDED.scopes, integration_credentials.scopes),
            error_message = COALESCE(EXCLUDED.error_message, integration_credentials.error_message),
            metadata = COALESCE(integration_credentials.metadata, '{}'::jsonb) || EXCLUDED.metadata,
            updated_at = EXCLUDED.updated_at
        `,
        [
          `${marker}-explain`,
          "google",
          "connected",
          "acc-explain",
          "Explain",
          "token-a",
          "token-b",
          "scope",
          null,
          JSON.stringify({ explain: true }),
        ],
      ),
      await captureExplainPlan(
        "meta_account_daily_upsert",
        `
          INSERT INTO meta_account_daily (
            business_id, provider_account_id, date, account_name, account_timezone, account_currency,
            spend, impressions, clicks, reach, frequency, conversions, revenue, roas, cpa, ctr, cpc,
            source_snapshot_id, metric_schema_version, updated_at
          )
          VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now())
          ON CONFLICT (business_id, provider_account_id, date) DO UPDATE SET
            spend = EXCLUDED.spend,
            revenue = EXCLUDED.revenue,
            updated_at = now()
        `,
        [`${marker}-meta-explain`, "meta-act-explain", normalizeDate(new Date()), "Explain Meta", "UTC", "USD", 1, 10, 2, 9, 1.1, 1, 5, 5, 1, 0.2, 0.5, null, 1],
      ),
      await captureExplainPlan(
        "google_ads_campaign_daily_upsert",
        `
          INSERT INTO google_ads_campaign_daily (
            business_id, provider_account_id, date, account_timezone, account_currency, entity_key, entity_label,
            campaign_id, campaign_name, ad_group_id, ad_group_name, status, channel, classification, payload_json,
            spend, revenue, conversions, impressions, clicks, ctr, cpc, cpa, roas, conversion_rate, interaction_rate,
            source_snapshot_id, updated_at
          )
          VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,now())
          ON CONFLICT (business_id, provider_account_id, date, entity_key) DO UPDATE SET
            spend = EXCLUDED.spend,
            revenue = EXCLUDED.revenue,
            updated_at = now()
        `,
        [`${marker}-google-explain`, "google-act-explain", normalizeDate(new Date()), "UTC", "USD", "campaign-explain", "Campaign", "campaign-explain", "Campaign", null, null, "ENABLED", "SEARCH", "search", JSON.stringify({ explain: true }), 1, 2, 1, 10, 2, 0.2, 0.5, 1, 2, 0.1, 0.1, null],
      ),
      await captureExplainPlan(
        "shopify_orders_upsert",
        `
          INSERT INTO shopify_orders (
            business_id, provider_account_id, shop_id, order_id, order_name, order_created_at, order_created_date_local,
            subtotal_price, total_discounts, total_shipping, total_tax, total_refunded, total_price, original_total_price,
            current_total_price, updated_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8,$9,$10,$11,$12,$13,$14,$15,now())
          ON CONFLICT (business_id, provider_account_id, shop_id, order_id) DO UPDATE SET
            total_price = EXCLUDED.total_price,
            updated_at = now()
        `,
        [`${marker}-shopify-explain`, "shopify-act-explain", "shop-explain", "order-explain", "Order", normalizeTimestamp(new Date()), normalizeDate(new Date()), 10, 0, 1, 1, 0, 12, 12, 12],
      ),
      await captureExplainPlan(
        "platform_overview_daily_summary_upsert",
        `
          INSERT INTO platform_overview_daily_summary (
            business_id, provider, provider_account_id, date, spend, revenue, purchases, impressions, clicks, source_updated_at, updated_at
          )
          VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,now())
          ON CONFLICT (business_id, provider, provider_account_id, date) DO UPDATE SET
            spend = EXCLUDED.spend,
            revenue = EXCLUDED.revenue,
            updated_at = now()
        `,
        [`${marker}-serving-explain`, "google", "serving-act-explain", normalizeDate(new Date()), 10, 20, 2, 100, 5, normalizeTimestamp(new Date())],
      ),
    ];

    return {
      measuredAt: new Date().toISOString(),
      iterations,
      scenarios,
      explainPlans,
    } satisfies BenchmarkPayload;
  });

  if (outPath) {
    await writeJsonFile(outPath, payload);
  }

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
