import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import {
  buildShopifyOverviewCanaryKey,
  buildShopifyOverviewOverrideKey,
  SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
} from "@/lib/shopify/serving";
import { getShopifyStatus } from "@/lib/shopify/status";
import {
  getShopifyServingOverride,
  getShopifyServingState,
  listShopifyWebhookDeliveries,
  listShopifyReconciliationRuns,
  listShopifyServingStateHistory,
  upsertShopifyServingOverride,
} from "@/lib/shopify/warehouse";
import { getShopifyRevenueLedgerAggregate } from "@/lib/shopify/revenue-ledger";
import { compareShopifyWarehouseAndLedger } from "@/lib/shopify/divergence";
import { getShopifyCustomerEventsAggregate } from "@/lib/shopify/customer-events-analytics";
import { getShopifyWarehouseOverviewAggregate } from "@/lib/shopify/warehouse-overview";

function buildRolloutSummary(input: {
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
  webhookDeliveries: Array<{ processingState: string; errorMessage?: string | null }>;
}) {
  const blockers = [...input.status.issues];
  const hasRecentWebhookFailures = input.webhookDeliveries.some(
    (delivery) => delivery.processingState === "failed"
  );
  if (input.ledgerConsistency && input.ledgerConsistency.withinThreshold !== true) {
    blockers.push("Shopify ledger semantic consistency is above serving threshold.");
  }
  if (hasRecentWebhookFailures) {
    blockers.push("Recent Shopify webhook deliveries include failed refresh attempts.");
  }
  if (input.override?.mode === "force_live") {
    blockers.push("Serving is currently forced to live by override.");
  }

  const defaultCutoverReady = input.status.reconciliation?.defaultCutoverEligible === true;
  const previewCanaryReady =
    input.status.state === "ready" &&
    (input.ledgerConsistency === null || input.ledgerConsistency.withinThreshold === true);
  const broaderLocalServingReady =
    previewCanaryReady || input.override?.mode === "force_warehouse";
  const latestTrustedRecordedAt =
    input.reconciliationHistory.find((row) => {
      const divergenceWithin = row.divergence?.withinThreshold === true;
      const ledgerWithin =
        row.divergence?.ledgerConsistency == null ||
        (
          typeof row.divergence.ledgerConsistency === "object" &&
          (row.divergence.ledgerConsistency as Record<string, unknown>).withinThreshold === true
        );
      return row.canServeWarehouse === true && divergenceWithin && ledgerWithin;
    })?.recordedAt ?? null;
  const lastDecisionReasons =
    input.serving?.decisionReasons ??
    input.history[0]?.decisionReasons ??
    [];

  return {
    broaderLocalServingReady,
    previewCanaryReady,
    defaultCutoverReady,
    recommendedSource:
      input.override?.mode === "force_live"
        ? "live"
        : input.override?.mode === "force_warehouse"
          ? "warehouse"
          : input.ledgerConsistency?.withinThreshold === true
            ? "ledger_candidate"
            : "live",
    blockers: [...new Set(blockers)],
    lastDecisionReasons,
    stableWarehouseRunCount: input.status.reconciliation?.stableWarehouseRunCount ?? 0,
    stableLedgerRunCount: input.status.reconciliation?.stableLedgerRunCount ?? 0,
    latestTrustedRecordedAt,
    hasRecentWebhookFailures,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const businessId = request.nextUrl.searchParams.get("businessId")?.trim();
    const startDate = request.nextUrl.searchParams.get("startDate")?.trim();
    const endDate = request.nextUrl.searchParams.get("endDate")?.trim();

    if (!businessId) {
      return NextResponse.json(
        { error: "businessId is required." },
        { status: 400 }
      );
    }

    const status = await getShopifyStatus({
      businessId,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });

    const serving =
      status.shopId && startDate && endDate
        ? await getShopifyServingState({
            businessId,
            providerAccountId: status.shopId,
            canaryKey: buildShopifyOverviewCanaryKey({
              startDate,
              endDate,
              timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
            }),
          }).catch(() => null)
        : null;
    const override =
      status.shopId && startDate && endDate
        ? await getShopifyServingOverride({
            businessId,
            providerAccountId: status.shopId,
            overrideKey: buildShopifyOverviewOverrideKey({
              startDate,
              endDate,
              timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
            }),
          }).catch(() => null)
        : null;
    const history =
      status.shopId && startDate && endDate
        ? await listShopifyServingStateHistory({
            businessId,
            providerAccountId: status.shopId,
            canaryKey: buildShopifyOverviewCanaryKey({
              startDate,
              endDate,
              timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
            }),
            startDate,
            endDate,
            limit: 5,
          }).catch(() => [])
        : [];
    const reconciliationHistory =
      status.shopId && startDate && endDate
        ? await listShopifyReconciliationRuns({
            businessId,
            providerAccountId: status.shopId,
            reconciliationKey: buildShopifyOverviewCanaryKey({
              startDate,
              endDate,
              timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
            }),
            startDate,
            endDate,
            limit: 10,
          }).catch(() => [])
        : [];
    const [warehouseAggregate, ledgerAggregate, customerEventsAggregate, webhookDeliveries] =
      status.shopId && startDate && endDate
        ? await Promise.all([
            getShopifyWarehouseOverviewAggregate({
              businessId,
              providerAccountId: status.shopId,
              startDate,
              endDate,
            }).catch(() => null),
            getShopifyRevenueLedgerAggregate({
              businessId,
              providerAccountId: status.shopId,
              startDate,
              endDate,
            }).catch(() => null),
            getShopifyCustomerEventsAggregate({
              businessId,
              providerAccountId: status.shopId,
              startDate,
              endDate,
            }).catch(() => null),
            listShopifyWebhookDeliveries({
              businessId,
              providerAccountId: status.shopId,
              limit: 10,
            }).catch(() => []),
          ])
        : [null, null, null, []];
    const ledgerConsistency =
      warehouseAggregate && ledgerAggregate
        ? compareShopifyWarehouseAndLedger({
            warehouse: warehouseAggregate,
            ledger: ledgerAggregate,
          })
        : null;
    const rollout = buildRolloutSummary({
      status,
      ledgerConsistency,
      override,
      serving,
      history,
      reconciliationHistory,
      webhookDeliveries,
    });

    return NextResponse.json({
      businessId,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      canaryKey:
        startDate && endDate
          ? buildShopifyOverviewCanaryKey({
              startDate,
              endDate,
              timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
            })
          : null,
      status,
      serving,
      override,
      history,
      reconciliationHistory,
      warehouseAggregate,
      ledgerAggregate,
      ledgerConsistency,
      customerEventsAggregate,
      webhookDeliveries,
      rollout,
    });
  } catch (err) {
    console.error("[admin/integrations/health/shopify GET]", err);
    return NextResponse.json(
      { error: "internal_error", message: String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = await request.json().catch(() => ({}));
    const businessId = typeof body?.businessId === "string" ? body.businessId.trim() : "";
    const providerAccountId =
      typeof body?.providerAccountId === "string" ? body.providerAccountId.trim() : "";
    const startDate = typeof body?.startDate === "string" ? body.startDate.trim() : "";
    const endDate = typeof body?.endDate === "string" ? body.endDate.trim() : "";
    const mode = typeof body?.mode === "string" ? body.mode.trim() : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : null;

    if (!businessId || !providerAccountId || !startDate || !endDate) {
      return NextResponse.json({ error: "businessId, providerAccountId, startDate, endDate are required." }, { status: 400 });
    }
    if (!["auto", "force_live", "force_warehouse"].includes(mode)) {
      return NextResponse.json({ error: "mode must be one of auto, force_live, force_warehouse." }, { status: 400 });
    }

    await upsertShopifyServingOverride({
      businessId,
      providerAccountId,
      overrideKey: buildShopifyOverviewOverrideKey({
        startDate,
        endDate,
        timeZoneBasis: SHOPIFY_OVERVIEW_CANARY_TIMEZONE_BASIS,
      }),
      startDate,
      endDate,
      mode: mode as "auto" | "force_live" | "force_warehouse",
      reason,
      updatedBy: auth.session?.user?.id ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/integrations/health/shopify PATCH]", err);
    return NextResponse.json(
      { error: "internal_error", message: String(err) },
      { status: 500 }
    );
  }
}
