import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { getDbWithTimeout } from "@/lib/db";
import {
  configureOperationalScriptRuntime,
  runOperationalMigrationsIfEnabled,
} from "./_operational-runtime";

interface ParsedCliArgs {
  businessId: string;
  startDate: string;
  endDate: string;
  jsonOut: string | null;
}

interface ArchiveCoverageEntry {
  key: string;
  label: string;
  scopedRows: number;
  archivedRows: number;
  missingArchiveRows: number;
  ready: boolean;
}

interface DimensionCoverageEntry {
  key: string;
  label: string;
  referencedRows: number;
  dimensionRows: number;
  missingDimensionRows: number;
  ready: boolean;
}

interface InlineLegacyDetailCoverageEntry {
  key: string;
  label: string;
  legacyColumnsPresent: boolean;
  scopedLegacyRows: number;
  archivedRows: number;
  missingArchiveRows: number;
  ready: boolean;
}

function parseArgs(argv: string[]) {
  const parsed = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value =
      argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : "true";
    parsed.set(key, value);
    if (value !== "true") index += 1;
  }
  return parsed;
}

export function parseShopifyCleanupAuditArgs(argv: string[]): ParsedCliArgs {
  const args = parseArgs(argv);
  const businessId = args.get("business-id") ?? args.get("businessId");
  const startDate = args.get("start-date") ?? args.get("startDate");
  const endDate = args.get("end-date") ?? args.get("endDate");
  if (!businessId || !startDate || !endDate) {
    throw new Error(
      "Missing required args. Required: --business-id --start-date --end-date",
    );
  }
  return {
    businessId,
    startDate,
    endDate,
    jsonOut: args.get("json-out") ?? args.get("jsonOut") ?? null,
  };
}

function toCount(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asMap<T extends { key: string }>(entries: T[]) {
  return Object.fromEntries(entries.map((entry) => [entry.key, entry]));
}

export function buildShopifyCleanupAuditArtifact(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  archiveCoverage: ArchiveCoverageEntry[];
  dimensionCoverage: DimensionCoverageEntry[];
  inlineLegacyDetailCoverage: InlineLegacyDetailCoverageEntry[];
}) {
  const blockingIssues: string[] = [];

  for (const entry of input.archiveCoverage) {
    if (entry.missingArchiveRows > 0) {
      blockingIssues.push(
        `${entry.label} is missing ${entry.missingArchiveRows} archived rows in the scoped window.`,
      );
    }
  }

  for (const entry of input.dimensionCoverage) {
    if (entry.missingDimensionRows > 0) {
      blockingIssues.push(
        `${entry.label} is missing ${entry.missingDimensionRows} canonical dimension rows in the scoped window.`,
      );
    }
  }

  for (const entry of input.inlineLegacyDetailCoverage) {
    if (entry.missingArchiveRows > 0) {
      blockingIssues.push(
        `${entry.label} still has ${entry.missingArchiveRows} inline legacy detail rows without archive coverage.`,
      );
    }
  }

  return {
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    ready: blockingIssues.length === 0,
    archiveCoverage: asMap(input.archiveCoverage),
    dimensionCoverage: asMap(input.dimensionCoverage),
    inlineLegacyDetailCoverage: asMap(input.inlineLegacyDetailCoverage),
    blockingIssues,
  };
}

async function columnExists(tableName: string, columnName: string) {
  const sql = getDbWithTimeout(30_000);
  const rows = (await sql.query<{ exists: boolean | null }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
      ) AS exists
    `,
    [tableName, columnName],
  )) as Array<{ exists: boolean | null }>;
  return rows[0]?.exists === true;
}

async function collectArchiveCoverage(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const sql = getDbWithTimeout(30_000);
  const queries = [
    {
      key: "shopify_orders",
      label: "Shopify orders archive coverage",
      query: `
        SELECT
          COUNT(*)::int AS scoped_rows,
          COUNT(archive.id)::int AS archived_rows
        FROM shopify_orders AS fact
        LEFT JOIN shopify_entity_payload_archives AS archive
          ON archive.business_id = fact.business_id
         AND archive.provider_account_id = fact.provider_account_id
         AND archive.shop_id = fact.shop_id
         AND archive.entity_type = 'order'
         AND archive.entity_id = fact.order_id
        WHERE fact.business_id = $1
          AND COALESCE(fact.order_created_date_local, fact.order_created_at::date) BETWEEN $2::date AND $3::date
      `,
    },
    {
      key: "shopify_order_lines",
      label: "Shopify order lines archive coverage",
      query: `
        SELECT
          COUNT(*)::int AS scoped_rows,
          COUNT(archive.id)::int AS archived_rows
        FROM shopify_order_lines AS fact
        JOIN shopify_orders AS orders
          ON orders.business_id = fact.business_id
         AND orders.provider_account_id = fact.provider_account_id
         AND orders.shop_id = fact.shop_id
         AND orders.order_id = fact.order_id
        LEFT JOIN shopify_entity_payload_archives AS archive
          ON archive.business_id = fact.business_id
         AND archive.provider_account_id = fact.provider_account_id
         AND archive.shop_id = fact.shop_id
         AND archive.entity_type = 'order_line'
         AND archive.entity_id = fact.line_item_id
        WHERE fact.business_id = $1
          AND COALESCE(orders.order_created_date_local, orders.order_created_at::date) BETWEEN $2::date AND $3::date
      `,
    },
    {
      key: "shopify_refunds",
      label: "Shopify refunds archive coverage",
      query: `
        SELECT
          COUNT(*)::int AS scoped_rows,
          COUNT(archive.id)::int AS archived_rows
        FROM shopify_refunds AS fact
        LEFT JOIN shopify_entity_payload_archives AS archive
          ON archive.business_id = fact.business_id
         AND archive.provider_account_id = fact.provider_account_id
         AND archive.shop_id = fact.shop_id
         AND archive.entity_type = 'refund'
         AND archive.entity_id = fact.refund_id
        WHERE fact.business_id = $1
          AND COALESCE(fact.refunded_date_local, fact.refunded_at::date) BETWEEN $2::date AND $3::date
      `,
    },
    {
      key: "shopify_order_transactions",
      label: "Shopify order transactions archive coverage",
      query: `
        SELECT
          COUNT(*)::int AS scoped_rows,
          COUNT(archive.id)::int AS archived_rows
        FROM shopify_order_transactions AS fact
        LEFT JOIN shopify_orders AS orders
          ON orders.business_id = fact.business_id
         AND orders.provider_account_id = fact.provider_account_id
         AND orders.shop_id = fact.shop_id
         AND orders.order_id = fact.order_id
        LEFT JOIN shopify_entity_payload_archives AS archive
          ON archive.business_id = fact.business_id
         AND archive.provider_account_id = fact.provider_account_id
         AND archive.shop_id = fact.shop_id
         AND archive.entity_type = 'transaction'
         AND archive.entity_id = fact.transaction_id
        WHERE fact.business_id = $1
          AND COALESCE(fact.processed_at::date, orders.order_created_date_local, orders.order_created_at::date) BETWEEN $2::date AND $3::date
      `,
    },
    {
      key: "shopify_returns",
      label: "Shopify returns archive coverage",
      query: `
        SELECT
          COUNT(*)::int AS scoped_rows,
          COUNT(archive.id)::int AS archived_rows
        FROM shopify_returns AS fact
        LEFT JOIN shopify_entity_payload_archives AS archive
          ON archive.business_id = fact.business_id
         AND archive.provider_account_id = fact.provider_account_id
         AND archive.shop_id = fact.shop_id
         AND archive.entity_type = 'return'
         AND archive.entity_id = fact.return_id
        WHERE fact.business_id = $1
          AND COALESCE(fact.created_date_local, fact.created_at_provider::date) BETWEEN $2::date AND $3::date
      `,
    },
    {
      key: "shopify_sales_events",
      label: "Shopify sales events archive coverage",
      query: `
        SELECT
          COUNT(*)::int AS scoped_rows,
          COUNT(archive.id)::int AS archived_rows
        FROM shopify_sales_events AS fact
        LEFT JOIN shopify_entity_payload_archives AS archive
          ON archive.business_id = fact.business_id
         AND archive.provider_account_id = fact.provider_account_id
         AND archive.shop_id = fact.shop_id
         AND archive.entity_type = 'sales_event'
         AND archive.entity_id = fact.event_id
        WHERE fact.business_id = $1
          AND COALESCE(fact.occurred_date_local, fact.occurred_at::date) BETWEEN $2::date AND $3::date
      `,
    },
    {
      key: "shopify_customer_events",
      label: "Shopify customer events archive coverage",
      query: `
        SELECT
          COUNT(*)::int AS scoped_rows,
          COUNT(archive.id)::int AS archived_rows
        FROM shopify_customer_events AS fact
        LEFT JOIN shopify_entity_payload_archives AS archive
          ON archive.business_id = fact.business_id
         AND archive.provider_account_id = fact.provider_account_id
         AND archive.shop_id = fact.shop_id
         AND archive.entity_type = 'customer_event'
         AND archive.entity_id = fact.event_id
        WHERE fact.business_id = $1
          AND fact.occurred_at::date BETWEEN $2::date AND $3::date
      `,
    },
    {
      key: "shopify_webhook_deliveries",
      label: "Shopify webhook delivery archive coverage",
      query: `
        SELECT
          COUNT(*)::int AS scoped_rows,
          COUNT(archive.id)::int AS archived_rows
        FROM shopify_webhook_deliveries AS fact
        LEFT JOIN shopify_entity_payload_archives AS archive
          ON archive.business_id = fact.business_id
         AND archive.provider_account_id = fact.provider_account_id
         AND archive.shop_id = fact.provider_account_id
         AND archive.entity_type = 'webhook_delivery'
         AND archive.entity_id = fact.shop_domain || '::' || fact.topic || '::' || fact.payload_hash
        WHERE fact.business_id = $1
          AND COALESCE(fact.processed_at::date, fact.received_at::date) BETWEEN $2::date AND $3::date
      `,
    },
  ] as const;

  const results: ArchiveCoverageEntry[] = [];
  for (const item of queries) {
    const rows = (await sql.query<{ scoped_rows: number | string | null; archived_rows: number | string | null }>(
      item.query,
      [input.businessId, input.startDate, input.endDate],
    )) as Array<{ scoped_rows: number | string | null; archived_rows: number | string | null }>;
    const scopedRows = toCount(rows[0]?.scoped_rows);
    const archivedRows = toCount(rows[0]?.archived_rows);
    results.push({
      key: item.key,
      label: item.label,
      scopedRows,
      archivedRows,
      missingArchiveRows: Math.max(0, scopedRows - archivedRows),
      ready: scopedRows <= archivedRows,
    });
  }
  return results;
}

async function collectDimensionCoverage(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const sql = getDbWithTimeout(30_000);
  const queries = [
    {
      key: "shopify_shop_dimensions",
      label: "Shopify shop dimension coverage",
      query: `
        WITH referenced AS (
          SELECT DISTINCT business_id, provider_account_id, shop_id
          FROM shopify_orders
          WHERE business_id = $1
            AND COALESCE(order_created_date_local, order_created_at::date) BETWEEN $2::date AND $3::date
          UNION
          SELECT DISTINCT business_id, provider_account_id, shop_id
          FROM shopify_refunds
          WHERE business_id = $1
            AND COALESCE(refunded_date_local, refunded_at::date) BETWEEN $2::date AND $3::date
          UNION
          SELECT DISTINCT business_id, provider_account_id, shop_id
          FROM shopify_returns
          WHERE business_id = $1
            AND COALESCE(created_date_local, created_at_provider::date) BETWEEN $2::date AND $3::date
          UNION
          SELECT DISTINCT business_id, provider_account_id, shop_id
          FROM shopify_sales_events
          WHERE business_id = $1
            AND COALESCE(occurred_date_local, occurred_at::date) BETWEEN $2::date AND $3::date
        )
        SELECT
          COUNT(*)::int AS referenced_rows,
          COUNT(dim.id)::int AS dimension_rows
        FROM referenced
        LEFT JOIN shopify_shop_dimensions AS dim
          ON dim.business_id = referenced.business_id
         AND dim.provider_account_id = referenced.provider_account_id
         AND dim.shop_id = referenced.shop_id
      `,
    },
    {
      key: "shopify_customer_dimensions",
      label: "Shopify customer dimension coverage",
      query: `
        WITH referenced AS (
          SELECT DISTINCT business_id, provider_account_id, shop_id, customer_id
          FROM shopify_orders
          WHERE business_id = $1
            AND customer_id IS NOT NULL
            AND COALESCE(order_created_date_local, order_created_at::date) BETWEEN $2::date AND $3::date
        )
        SELECT
          COUNT(*)::int AS referenced_rows,
          COUNT(dim.id)::int AS dimension_rows
        FROM referenced
        LEFT JOIN shopify_customer_dimensions AS dim
          ON dim.business_id = referenced.business_id
         AND dim.provider_account_id = referenced.provider_account_id
         AND dim.shop_id = referenced.shop_id
         AND dim.customer_id = referenced.customer_id
      `,
    },
    {
      key: "shopify_product_dimensions",
      label: "Shopify product dimension coverage",
      query: `
        WITH referenced AS (
          SELECT DISTINCT lines.business_id, lines.provider_account_id, lines.shop_id, lines.product_id
          FROM shopify_order_lines AS lines
          JOIN shopify_orders AS orders
            ON orders.business_id = lines.business_id
           AND orders.provider_account_id = lines.provider_account_id
           AND orders.shop_id = lines.shop_id
           AND orders.order_id = lines.order_id
          WHERE lines.business_id = $1
            AND lines.product_id IS NOT NULL
            AND COALESCE(orders.order_created_date_local, orders.order_created_at::date) BETWEEN $2::date AND $3::date
        )
        SELECT
          COUNT(*)::int AS referenced_rows,
          COUNT(dim.id)::int AS dimension_rows
        FROM referenced
        LEFT JOIN shopify_product_dimensions AS dim
          ON dim.business_id = referenced.business_id
         AND dim.provider_account_id = referenced.provider_account_id
         AND dim.shop_id = referenced.shop_id
         AND dim.product_id = referenced.product_id
      `,
    },
    {
      key: "shopify_variant_dimensions",
      label: "Shopify variant dimension coverage",
      query: `
        WITH referenced AS (
          SELECT DISTINCT lines.business_id, lines.provider_account_id, lines.shop_id, lines.variant_id
          FROM shopify_order_lines AS lines
          JOIN shopify_orders AS orders
            ON orders.business_id = lines.business_id
           AND orders.provider_account_id = lines.provider_account_id
           AND orders.shop_id = lines.shop_id
           AND orders.order_id = lines.order_id
          WHERE lines.business_id = $1
            AND lines.variant_id IS NOT NULL
            AND COALESCE(orders.order_created_date_local, orders.order_created_at::date) BETWEEN $2::date AND $3::date
        )
        SELECT
          COUNT(*)::int AS referenced_rows,
          COUNT(dim.id)::int AS dimension_rows
        FROM referenced
        LEFT JOIN shopify_variant_dimensions AS dim
          ON dim.business_id = referenced.business_id
         AND dim.provider_account_id = referenced.provider_account_id
         AND dim.shop_id = referenced.shop_id
         AND dim.variant_id = referenced.variant_id
      `,
    },
  ] as const;

  const results: DimensionCoverageEntry[] = [];
  for (const item of queries) {
    const rows = (await sql.query<{ referenced_rows: number | string | null; dimension_rows: number | string | null }>(
      item.query,
      [input.businessId, input.startDate, input.endDate],
    )) as Array<{ referenced_rows: number | string | null; dimension_rows: number | string | null }>;
    const referencedRows = toCount(rows[0]?.referenced_rows);
    const dimensionRows = toCount(rows[0]?.dimension_rows);
    results.push({
      key: item.key,
      label: item.label,
      referencedRows,
      dimensionRows,
      missingDimensionRows: Math.max(0, referencedRows - dimensionRows),
      ready: referencedRows <= dimensionRows,
    });
  }
  return results;
}

async function collectInlineLegacyDetailCoverage(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const sql = getDbWithTimeout(30_000);
  const webhookHasPayloadJson = await columnExists("shopify_webhook_deliveries", "payload_json");
  const webhookHasResultSummary = await columnExists("shopify_webhook_deliveries", "result_summary");
  const repairHasLastSyncResult = await columnExists("shopify_repair_intents", "last_sync_result");
  const syncStateHasLastResultSummary = await columnExists("shopify_sync_state", "last_result_summary");

  const results: InlineLegacyDetailCoverageEntry[] = [];

  if (webhookHasPayloadJson || webhookHasResultSummary) {
    const legacyPredicates: string[] = [];
    if (webhookHasPayloadJson) {
      legacyPredicates.push("fact.payload_json <> '{}'::jsonb");
    }
    if (webhookHasResultSummary) {
      legacyPredicates.push("fact.result_summary IS NOT NULL");
    }
    const rows = (await sql.query<{ scoped_rows: number | string | null; archived_rows: number | string | null }>(
      `
        SELECT
          COUNT(*)::int AS scoped_rows,
          COUNT(archive.id)::int AS archived_rows
        FROM shopify_webhook_deliveries AS fact
        LEFT JOIN shopify_entity_payload_archives AS archive
          ON archive.business_id = fact.business_id
         AND archive.provider_account_id = fact.provider_account_id
         AND archive.shop_id = fact.provider_account_id
         AND archive.entity_type = 'webhook_delivery'
         AND archive.entity_id = fact.shop_domain || '::' || fact.topic || '::' || fact.payload_hash
        WHERE fact.business_id = $1
          AND COALESCE(fact.processed_at::date, fact.received_at::date) BETWEEN $2::date AND $3::date
          AND (${legacyPredicates.join(" OR ")})
      `,
      [input.businessId, input.startDate, input.endDate],
    )) as Array<{ scoped_rows: number | string | null; archived_rows: number | string | null }>;
    const scopedRows = toCount(rows[0]?.scoped_rows);
    const archivedRows = toCount(rows[0]?.archived_rows);
    results.push({
      key: "shopify_webhook_deliveries",
      label: "Shopify webhook inline legacy detail coverage",
      legacyColumnsPresent: true,
      scopedLegacyRows: scopedRows,
      archivedRows,
      missingArchiveRows: Math.max(0, scopedRows - archivedRows),
      ready: scopedRows <= archivedRows,
    });
  } else {
    results.push({
      key: "shopify_webhook_deliveries",
      label: "Shopify webhook inline legacy detail coverage",
      legacyColumnsPresent: false,
      scopedLegacyRows: 0,
      archivedRows: 0,
      missingArchiveRows: 0,
      ready: true,
    });
  }

  if (repairHasLastSyncResult) {
    const rows = (await sql.query<{ scoped_rows: number | string | null; archived_rows: number | string | null }>(
      `
        SELECT
          COUNT(*)::int AS scoped_rows,
          COUNT(archive.id)::int AS archived_rows
        FROM shopify_repair_intents AS fact
        LEFT JOIN shopify_entity_payload_archives AS archive
          ON archive.business_id = fact.business_id
         AND archive.provider_account_id = fact.provider_account_id
         AND archive.shop_id = fact.provider_account_id
         AND archive.entity_type = 'repair_intent_state'
         AND archive.entity_id = fact.id::text
        WHERE fact.business_id = $1
          AND fact.updated_at::date BETWEEN $2::date AND $3::date
          AND fact.last_sync_result IS NOT NULL
      `,
      [input.businessId, input.startDate, input.endDate],
    )) as Array<{ scoped_rows: number | string | null; archived_rows: number | string | null }>;
    const scopedRows = toCount(rows[0]?.scoped_rows);
    const archivedRows = toCount(rows[0]?.archived_rows);
    results.push({
      key: "shopify_repair_intents",
      label: "Shopify repair intent inline legacy detail coverage",
      legacyColumnsPresent: true,
      scopedLegacyRows: scopedRows,
      archivedRows,
      missingArchiveRows: Math.max(0, scopedRows - archivedRows),
      ready: scopedRows <= archivedRows,
    });
  } else {
    results.push({
      key: "shopify_repair_intents",
      label: "Shopify repair intent inline legacy detail coverage",
      legacyColumnsPresent: false,
      scopedLegacyRows: 0,
      archivedRows: 0,
      missingArchiveRows: 0,
      ready: true,
    });
  }

  if (syncStateHasLastResultSummary) {
    const rows = (await sql.query<{ scoped_rows: number | string | null; archived_rows: number | string | null }>(
      `
        SELECT
          COUNT(*)::int AS scoped_rows,
          COUNT(archive.id)::int AS archived_rows
        FROM shopify_sync_state AS fact
        LEFT JOIN shopify_entity_payload_archives AS archive
          ON archive.business_id = fact.business_id
         AND archive.provider_account_id = fact.provider_account_id
         AND archive.shop_id = fact.provider_account_id
         AND archive.entity_type = 'sync_state_detail'
         AND archive.entity_id = fact.sync_target
        WHERE fact.business_id = $1
          AND fact.updated_at::date BETWEEN $2::date AND $3::date
          AND fact.last_result_summary IS NOT NULL
      `,
      [input.businessId, input.startDate, input.endDate],
    )) as Array<{ scoped_rows: number | string | null; archived_rows: number | string | null }>;
    const scopedRows = toCount(rows[0]?.scoped_rows);
    const archivedRows = toCount(rows[0]?.archived_rows);
    results.push({
      key: "shopify_sync_state",
      label: "Shopify sync-state inline legacy detail coverage",
      legacyColumnsPresent: true,
      scopedLegacyRows: scopedRows,
      archivedRows,
      missingArchiveRows: Math.max(0, scopedRows - archivedRows),
      ready: scopedRows <= archivedRows,
    });
  } else {
    results.push({
      key: "shopify_sync_state",
      label: "Shopify sync-state inline legacy detail coverage",
      legacyColumnsPresent: false,
      scopedLegacyRows: 0,
      archivedRows: 0,
      missingArchiveRows: 0,
      ready: true,
    });
  }

  return results;
}

async function main() {
  const runtime = configureOperationalScriptRuntime();
  const parsed = parseShopifyCleanupAuditArgs(process.argv.slice(2));
  await runOperationalMigrationsIfEnabled(runtime);

  const [archiveCoverage, dimensionCoverage, inlineLegacyDetailCoverage] = await Promise.all([
    collectArchiveCoverage(parsed),
    collectDimensionCoverage(parsed),
    collectInlineLegacyDetailCoverage(parsed),
  ]);
  const artifact = buildShopifyCleanupAuditArtifact({
    businessId: parsed.businessId,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    archiveCoverage,
    dimensionCoverage,
    inlineLegacyDetailCoverage,
  });

  if (parsed.jsonOut) {
    writeFileSync(resolve(parsed.jsonOut), JSON.stringify(artifact, null, 2));
  }
  console.log(JSON.stringify(artifact, null, 2));

  if (!artifact.ready) {
    process.exitCode = 1;
  }
}

if (process.argv[1]) {
  const entryHref = pathToFileURL(resolve(process.argv[1])).href;
  if (import.meta.url === entryHref) {
    main().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  }
}
