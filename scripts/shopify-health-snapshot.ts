import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getIntegration } from "@/lib/integrations";
import {
  getShopifyStatus,
  isShopifyDefaultCutoverEvidenceReady,
} from "@/lib/shopify/status";
import {
  getShopifyServingOverride,
  getShopifyServingState,
  listShopifyRepairIntents,
  listShopifyReconciliationRuns,
  listShopifyServingStateHistory,
  listShopifyWebhookDeliveries,
} from "@/lib/shopify/warehouse";
import { getShopifyRevenueLedgerAggregate } from "@/lib/shopify/revenue-ledger";
import { getShopifyCustomerEventsAggregate } from "@/lib/shopify/customer-events-analytics";
import { getShopifyWarehouseOverviewAggregate } from "@/lib/shopify/warehouse-overview";
import { compareShopifyWarehouseAndLedger } from "@/lib/shopify/divergence";
import {
  buildShopifyOverviewCanaryKey,
  buildShopifyOverviewOverrideKey,
  SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
} from "@/lib/shopify/serving";
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

function parseArgs(argv: string[]): Map<string, string> {
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

export function parseShopifyHealthSnapshotArgs(argv: string[]): ParsedCliArgs {
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

export function buildShopifyRolloutSummary(input: {
  status: Awaited<ReturnType<typeof getShopifyStatus>>;
  ledgerConsistency: ReturnType<typeof compareShopifyWarehouseAndLedger> | null;
  override: Awaited<ReturnType<typeof getShopifyServingOverride>> | null;
  serving: Awaited<ReturnType<typeof getShopifyServingState>> | null;
  history: Array<{ decisionReasons?: string[] | null }>;
  reconciliationHistory: Array<{
    recordedAt?: string | null;
    canServeWarehouse?: boolean;
    preferredSource?: string | null;
    divergence?: Record<string, unknown> | null;
  }>;
  webhookDeliveries: Array<{
    processingState: string;
    topic?: string | null;
    processedAt?: string | null;
    errorMessage?: string | null;
  }>;
}) {
  const blockers = [...input.status.issues];
  const hasRecentWebhookFailures = input.webhookDeliveries.some(
    (delivery) => delivery.processingState === "failed",
  );
  if (input.ledgerConsistency && input.ledgerConsistency.withinThreshold !== true) {
    blockers.push("Shopify ledger semantic consistency is above serving threshold.");
    for (const reason of input.ledgerConsistency.failureReasons ?? []) {
      blockers.push(`Ledger semantic blocker: ${reason}.`);
    }
  }
  if (hasRecentWebhookFailures) {
    blockers.push("Recent Shopify webhook deliveries include failed refresh attempts.");
  }
  if (input.override?.mode === "force_live") {
    blockers.push("Serving is currently forced to live by override.");
  }

  const latestTrustedRecordedAt =
    input.reconciliationHistory.find((row) => {
      const divergenceWithin = row.divergence?.withinThreshold === true;
      const ledgerWithin =
        row.divergence?.ledgerConsistency == null ||
        (
          typeof row.divergence.ledgerConsistency === "object" &&
          (row.divergence.ledgerConsistency as Record<string, unknown>).withinThreshold ===
            true
        );
      return row.canServeWarehouse === true && divergenceWithin && ledgerWithin;
    })?.recordedAt ?? null;

  return {
    broaderLocalServingReady:
      input.status.state === "ready" &&
      (input.ledgerConsistency === null || input.ledgerConsistency.withinThreshold === true),
    defaultCutoverReady: isShopifyDefaultCutoverEvidenceReady(input.status.reconciliation),
    recommendedSource:
      input.override?.mode === "force_live"
        ? "live"
        : input.override?.mode === "force_warehouse"
          ? "warehouse"
          : input.ledgerConsistency?.withinThreshold === true
            ? "ledger_candidate"
            : "live",
    blockers: [...new Set(blockers)],
    lastDecisionReasons:
      input.serving?.decisionReasons ?? input.history[0]?.decisionReasons ?? [],
    stableWarehouseRunCount: input.status.reconciliation?.stableWarehouseRunCount ?? 0,
    stableLedgerRunCount: input.status.reconciliation?.stableLedgerRunCount ?? 0,
    latestTrustedRecordedAt,
    hasRecentWebhookFailures,
    recentWebhookFailures: input.webhookDeliveries
      .filter((delivery) => delivery.processingState === "failed")
      .slice(0, 3)
      .map((delivery) => ({
        topic: delivery.topic ?? null,
        errorMessage: delivery.errorMessage ?? null,
        processedAt: delivery.processedAt ?? null,
      })),
  };
}

export function projectShopifyRepairIntentsForSnapshot(
  rows: Awaited<ReturnType<typeof listShopifyRepairIntents>>,
) {
  return rows.map((row) => ({
    id: row.id ?? null,
    entityType: row.entityType,
    entityId: row.entityId,
    topic: row.topic,
    payloadHash: row.payloadHash,
    status: row.status,
    attemptCount: row.attemptCount ?? 0,
    lastError: row.lastError ?? null,
    hasLastSyncResult:
      row.lastSyncResult != null && Object.keys(row.lastSyncResult).length > 0,
    updatedAt: row.updatedAt ?? null,
  }));
}

async function main() {
  const runtime = configureOperationalScriptRuntime();
  const parsed = parseShopifyHealthSnapshotArgs(process.argv.slice(2));
  await runOperationalMigrationsIfEnabled(runtime);

  const integration = await getIntegration(parsed.businessId, "shopify").catch(() => null);
  const status = await getShopifyStatus({
    businessId: parsed.businessId,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
  });

  const canaryKey =
    status.shopId && parsed.startDate && parsed.endDate
      ? buildShopifyOverviewCanaryKey({
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
        })
      : null;
  const overrideKey =
    status.shopId && parsed.startDate && parsed.endDate
      ? buildShopifyOverviewOverrideKey({
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
        })
      : null;

  const [serving, override, history, reconciliationHistory, warehouseAggregate, ledgerAggregate, customerEventsAggregate, webhookDeliveries, repairIntents] =
    status.shopId && canaryKey && overrideKey
      ? await Promise.all([
          getShopifyServingState({
            businessId: parsed.businessId,
            providerAccountId: status.shopId,
            canaryKey,
          }).catch(() => null),
          getShopifyServingOverride({
            businessId: parsed.businessId,
            providerAccountId: status.shopId,
            overrideKey,
          }).catch(() => null),
          listShopifyServingStateHistory({
            businessId: parsed.businessId,
            providerAccountId: status.shopId,
            canaryKey,
            startDate: parsed.startDate,
            endDate: parsed.endDate,
            limit: 5,
          }).catch(() => []),
          listShopifyReconciliationRuns({
            businessId: parsed.businessId,
            providerAccountId: status.shopId,
            reconciliationKey: canaryKey,
            startDate: parsed.startDate,
            endDate: parsed.endDate,
            limit: 10,
          }).catch(() => []),
          getShopifyWarehouseOverviewAggregate({
            businessId: parsed.businessId,
            providerAccountId: status.shopId,
            startDate: parsed.startDate,
            endDate: parsed.endDate,
          }).catch(() => null),
          getShopifyRevenueLedgerAggregate({
            businessId: parsed.businessId,
            providerAccountId: status.shopId,
            startDate: parsed.startDate,
            endDate: parsed.endDate,
          }).catch(() => null),
          getShopifyCustomerEventsAggregate({
            businessId: parsed.businessId,
            providerAccountId: status.shopId,
            startDate: parsed.startDate,
            endDate: parsed.endDate,
          }).catch(() => null),
          listShopifyWebhookDeliveries({
            businessId: parsed.businessId,
            providerAccountId: status.shopId,
            limit: 10,
          }).catch(() => []),
          listShopifyRepairIntents({
            businessId: parsed.businessId,
            providerAccountId: status.shopId,
            limit: 10,
          }).catch(() => []),
        ])
      : [null, null, [], [], null, null, null, [], []];

  const ledgerConsistency =
    warehouseAggregate && ledgerAggregate
      ? compareShopifyWarehouseAndLedger({
          warehouse: warehouseAggregate,
          ledger: ledgerAggregate,
        })
      : null;

  const artifact = {
    businessId: parsed.businessId,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    capturedAt: new Date().toISOString(),
    integration:
      integration == null
        ? null
        : {
            status: integration.status,
            providerAccountId: integration.provider_account_id ?? null,
            scopes: integration.scopes ?? null,
            shopifyProductionServingMode:
              integration.metadata?.shopifyProductionServingMode ?? null,
            shopifyProviderReadiness:
              integration.metadata?.shopifyProviderReadiness ?? null,
          },
    status,
    serving,
    override,
    history,
    reconciliationHistory,
    warehouseAggregate,
    ledgerAggregate,
    ledgerConsistency,
    customerEventsAggregate,
    webhookDeliveries: webhookDeliveries.map((delivery) => ({
      processingState: delivery.processingState,
      topic: delivery.topic ?? null,
      processedAt: delivery.processedAt ?? null,
      errorMessage: delivery.errorMessage ?? null,
    })),
    repairIntents: projectShopifyRepairIntentsForSnapshot(repairIntents),
    rollout: buildShopifyRolloutSummary({
      status,
      ledgerConsistency,
      override,
      serving,
      history,
      reconciliationHistory,
      webhookDeliveries,
    }),
  };

  if (parsed.jsonOut) {
    writeFileSync(resolve(parsed.jsonOut), JSON.stringify(artifact, null, 2));
  }
  console.log(JSON.stringify(artifact, null, 2));
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
