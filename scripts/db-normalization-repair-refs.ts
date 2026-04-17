import path from "node:path";
import { getDbWithTimeout } from "@/lib/db";
import {
  buildNormalizationRunDir,
  getOptionalCliValue,
  parseCliArgs,
  writeJsonFile,
  writeTextFile,
} from "./db-normalization-support";
import {
  configureOperationalScriptRuntime,
  withOperationalStartupLogsSilenced,
} from "./_operational-runtime";

type Provider = "meta" | "google" | "shopify";

type ProviderSeedSource = {
  tableName: string;
  columnName: string;
};

type RepairCount = {
  name: string;
  affectedRows: number;
};

const tableColumnCache = new Map<string, Set<string>>();

const BUSINESS_REF_REPAIR_TABLES = [
  "business_cost_models",
  "business_country_economics",
  "business_operating_constraints",
  "business_promo_calendar_events",
  "business_provider_accounts",
  "business_target_packs",
  "provider_account_assignments",
  "provider_connections",
] as const;

const META_PROVIDER_SEED_SOURCES: ProviderSeedSource[] = [
  { tableName: "meta_account_daily", columnName: "provider_account_id" },
  { tableName: "meta_campaign_daily", columnName: "provider_account_id" },
  { tableName: "meta_adset_daily", columnName: "provider_account_id" },
  { tableName: "meta_breakdown_daily", columnName: "provider_account_id" },
  { tableName: "meta_ad_daily", columnName: "provider_account_id" },
  { tableName: "meta_config_snapshots", columnName: "account_id" },
  { tableName: "meta_sync_partitions", columnName: "provider_account_id" },
  { tableName: "meta_sync_runs", columnName: "provider_account_id" },
  { tableName: "meta_sync_checkpoints", columnName: "provider_account_id" },
  { tableName: "meta_sync_state", columnName: "provider_account_id" },
  { tableName: "meta_raw_snapshots", columnName: "provider_account_id" },
  { tableName: "meta_authoritative_day_state", columnName: "provider_account_id" },
];

const GOOGLE_PROVIDER_SEED_SOURCES: ProviderSeedSource[] = [
  { tableName: "google_ads_account_daily", columnName: "provider_account_id" },
  { tableName: "google_ads_campaign_daily", columnName: "provider_account_id" },
  { tableName: "google_ads_ad_group_daily", columnName: "provider_account_id" },
  { tableName: "google_ads_ad_daily", columnName: "provider_account_id" },
  { tableName: "google_ads_keyword_daily", columnName: "provider_account_id" },
  { tableName: "google_ads_search_term_daily", columnName: "provider_account_id" },
  { tableName: "google_ads_search_query_hot_daily", columnName: "provider_account_id" },
  { tableName: "google_ads_search_cluster_daily", columnName: "provider_account_id" },
  { tableName: "google_ads_top_query_weekly", columnName: "provider_account_id" },
  { tableName: "google_ads_sync_jobs", columnName: "provider_account_id" },
  { tableName: "google_ads_sync_partitions", columnName: "provider_account_id" },
  { tableName: "google_ads_sync_runs", columnName: "provider_account_id" },
  { tableName: "google_ads_sync_checkpoints", columnName: "provider_account_id" },
  { tableName: "google_ads_sync_state", columnName: "provider_account_id" },
  { tableName: "google_ads_raw_snapshots", columnName: "provider_account_id" },
  { tableName: "google_ads_advisor_memory", columnName: "account_id" },
  { tableName: "google_ads_advisor_execution_logs", columnName: "account_id" },
  { tableName: "google_ads_advisor_snapshots", columnName: "account_id" },
];

const SHOPIFY_PROVIDER_SEED_SOURCES: ProviderSeedSource[] = [
  { tableName: "shopify_raw_snapshots", columnName: "provider_account_id" },
  { tableName: "shopify_orders", columnName: "provider_account_id" },
  { tableName: "shopify_order_lines", columnName: "provider_account_id" },
  { tableName: "shopify_refunds", columnName: "provider_account_id" },
  { tableName: "shopify_order_transactions", columnName: "provider_account_id" },
  { tableName: "shopify_returns", columnName: "provider_account_id" },
  { tableName: "shopify_customer_events", columnName: "provider_account_id" },
  { tableName: "shopify_sales_events", columnName: "provider_account_id" },
  { tableName: "shopify_reconciliation_runs", columnName: "provider_account_id" },
  { tableName: "shopify_serving_state", columnName: "provider_account_id" },
  { tableName: "shopify_serving_state_history", columnName: "provider_account_id" },
  { tableName: "shopify_sync_state", columnName: "provider_account_id" },
];

const META_PROVIDER_REF_REPAIR_TABLES = [
  "meta_raw_snapshots",
  "meta_sync_checkpoints",
  "meta_sync_partitions",
  "meta_sync_runs",
  "meta_sync_state",
] as const;

const GOOGLE_PROVIDER_REF_REPAIR_TABLES = [
  "google_ads_raw_snapshots",
  "google_ads_sync_checkpoints",
  "google_ads_sync_jobs",
  "google_ads_sync_partitions",
  "google_ads_sync_runs",
  "google_ads_sync_state",
] as const;

const DYNAMIC_PROVIDER_REF_REPAIR_TABLES = [
  "provider_connections",
] as const;

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

function buildProviderSeedUnion(sources: ProviderSeedSource[]) {
  return sources
    .map(
      (source) => `
        SELECT NULLIF(TRIM(${quoteIdentifier(source.columnName)}), '') AS external_account_id
        FROM ${quoteIdentifier(source.tableName)}
        WHERE ${quoteIdentifier(source.columnName)} IS NOT NULL
      `,
    )
    .join("\nUNION\n");
}

async function runCountQuery(queryText: string, params: unknown[] = []) {
  const sql = getDbWithTimeout(600_000);
  const rows = (await sql.query<{ affected_rows: number | string | null }>(
    queryText,
    params,
  )) as Array<{ affected_rows: number | string | null }>;
  const value = Number(rows[0]?.affected_rows ?? 0);
  return Number.isFinite(value) ? value : 0;
}

async function getTableColumns(tableName: string) {
  const cached = tableColumnCache.get(tableName);
  if (cached) return cached;

  const sql = getDbWithTimeout(60_000);
  const rows = (await sql.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
    `,
    [tableName],
  )) as Array<{ column_name: string }>;

  const columns = new Set(rows.map((row) => row.column_name));
  tableColumnCache.set(tableName, columns);
  return columns;
}

async function seedProviderAccounts(provider: Provider, sources: ProviderSeedSource[]) {
  return runCountQuery(
    `
      WITH seed AS (
        ${buildProviderSeedUnion(sources)}
      ),
      upserted AS (
        INSERT INTO provider_accounts (
          provider,
          external_account_id,
          created_at,
          updated_at
        )
        SELECT
          $1::text,
          seed.external_account_id,
          now(),
          now()
        FROM seed
        WHERE seed.external_account_id IS NOT NULL
        ON CONFLICT (provider, external_account_id) DO UPDATE SET
          updated_at = EXCLUDED.updated_at
        RETURNING 1
      )
      SELECT COUNT(*)::int AS affected_rows
      FROM upserted
    `,
    [provider],
  );
}

async function repairBusinessRefs(tableName: string) {
  const columns = await getTableColumns(tableName);
  if (!columns.has("business_ref_id") || !columns.has("business_id")) {
    return 0;
  }

  return runCountQuery(
    `
      WITH updated AS (
        UPDATE ${quoteIdentifier(tableName)} AS target
        SET business_ref_id = business.id
        FROM businesses AS business
        WHERE target.business_ref_id IS NULL
          AND business.id::text = target.business_id::text
        RETURNING 1
      )
      SELECT COUNT(*)::int AS affected_rows
      FROM updated
    `,
  );
}

async function repairProviderRefs(input: {
  tableName: string;
  provider: Provider;
}) {
  const columns = await getTableColumns(input.tableName);
  if (!columns.has("provider_account_ref_id") || !columns.has("provider_account_id")) {
    return 0;
  }

  return runCountQuery(
    `
      WITH updated AS (
        UPDATE ${quoteIdentifier(input.tableName)} AS target
        SET provider_account_ref_id = provider_account.id
        FROM provider_accounts AS provider_account
        WHERE target.provider_account_ref_id IS NULL
          AND provider_account.provider = $1::text
          AND provider_account.external_account_id = target.provider_account_id
        RETURNING 1
      )
      SELECT COUNT(*)::int AS affected_rows
      FROM updated
    `,
    [input.provider],
  );
}

async function repairDynamicProviderRefs(tableName: string) {
  const columns = await getTableColumns(tableName);
  if (
    !columns.has("provider_account_ref_id") ||
    !columns.has("provider_account_id") ||
    !columns.has("provider")
  ) {
    return 0;
  }

  return runCountQuery(
    `
      WITH updated AS (
        UPDATE ${quoteIdentifier(tableName)} AS target
        SET provider_account_ref_id = provider_account.id
        FROM provider_accounts AS provider_account
        WHERE target.provider_account_ref_id IS NULL
          AND NULLIF(TRIM(target.provider_account_id), '') IS NOT NULL
          AND provider_account.provider = target.provider
          AND provider_account.external_account_id = target.provider_account_id
        RETURNING 1
      )
      SELECT COUNT(*)::int AS affected_rows
      FROM updated
    `,
  );
}

function buildMarkdown(input: {
  capturedAt: string;
  runDir: string;
  counts: RepairCount[];
}) {
  const lines = [
    "# DB Normalization Ref Repair",
    "",
    `- Captured at: \`${input.capturedAt}\``,
    `- Run dir: \`${input.runDir}\``,
    "",
    "## Counts",
    ...input.counts.map((count) => `- ${count.name}: ${count.affectedRows}`),
  ];
  return lines.join("\n");
}

async function main() {
  configureOperationalScriptRuntime();
  const parsed = parseCliArgs(process.argv.slice(2));
  const runDir = buildNormalizationRunDir({
    runDir: getOptionalCliValue(parsed, "run-dir", null) ?? undefined,
  });
  const outDir = getOptionalCliValue(parsed, "out-dir", path.join(runDir, "repair-refs"))!;

  const payload = await withOperationalStartupLogsSilenced(async () => {
    const counts: RepairCount[] = [];

    counts.push({
      name: "seed_provider_accounts.meta",
      affectedRows: await seedProviderAccounts("meta", META_PROVIDER_SEED_SOURCES),
    });
    counts.push({
      name: "seed_provider_accounts.google",
      affectedRows: await seedProviderAccounts("google", GOOGLE_PROVIDER_SEED_SOURCES),
    });
    counts.push({
      name: "seed_provider_accounts.shopify",
      affectedRows: await seedProviderAccounts("shopify", SHOPIFY_PROVIDER_SEED_SOURCES),
    });

    for (const tableName of BUSINESS_REF_REPAIR_TABLES) {
      counts.push({
        name: `repair_business_ref.${tableName}`,
        affectedRows: await repairBusinessRefs(tableName),
      });
    }

    for (const tableName of META_PROVIDER_REF_REPAIR_TABLES) {
      counts.push({
        name: `repair_provider_ref.meta.${tableName}`,
        affectedRows: await repairProviderRefs({ tableName, provider: "meta" }),
      });
    }

    for (const tableName of GOOGLE_PROVIDER_REF_REPAIR_TABLES) {
      counts.push({
        name: `repair_provider_ref.google.${tableName}`,
        affectedRows: await repairProviderRefs({ tableName, provider: "google" }),
      });
    }

    for (const tableName of DYNAMIC_PROVIDER_REF_REPAIR_TABLES) {
      counts.push({
        name: `repair_provider_ref.dynamic.${tableName}`,
        affectedRows: await repairDynamicProviderRefs(tableName),
      });
    }

    return {
      capturedAt: new Date().toISOString(),
      runDir,
      outDir,
      counts,
    };
  });

  await writeJsonFile(path.join(outDir, "repair.json"), payload);
  await writeTextFile(
    path.join(outDir, "repair.md"),
    buildMarkdown({
      capturedAt: payload.capturedAt,
      runDir: payload.runDir,
      counts: payload.counts,
    }),
  );

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
