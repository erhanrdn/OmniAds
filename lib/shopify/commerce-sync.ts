import {
  hasShopifyScope,
  resolveShopifyAdminCredentials,
  shopifyAdminGraphql,
} from "@/lib/shopify/admin";
import {
  buildShopifyRawSnapshotHash,
  insertShopifyRawSnapshot,
  upsertShopifyOrderLines,
  upsertShopifyOrders,
  upsertShopifyOrderTransactions,
  upsertShopifyRefunds,
  upsertShopifyReturns,
  upsertShopifySalesEvents,
} from "@/lib/shopify/warehouse";
import type {
  ShopifyOrderLineWarehouseRow,
  ShopifyOrderTransactionWarehouseRow,
  ShopifyOrderWarehouseRow,
  ShopifyRefundWarehouseRow,
  ShopifyReturnWarehouseRow,
  ShopifySalesEventWarehouseRow,
} from "@/lib/shopify/warehouse-types";

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

type MoneyBag = {
  shopMoney?: {
    amount?: string | null;
    currencyCode?: string | null;
  } | null;
} | null;

interface ShopifyGraphqlOrderNode {
  id?: string | null;
  name?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  processedAt?: string | null;
  cancelledAt?: string | null;
  closedAt?: string | null;
  displayFinancialStatus?: string | null;
  displayFulfillmentStatus?: string | null;
  customer?: {
    id?: string | null;
  } | null;
  customerJourneySummary?: unknown;
  subtotalPriceSet?: MoneyBag;
  totalDiscountsSet?: MoneyBag;
  totalShippingPriceSet?: MoneyBag;
  totalTaxSet?: MoneyBag;
  totalRefundedSet?: MoneyBag;
  totalPriceSet?: MoneyBag;
  originalTotalPriceSet?: MoneyBag;
  currentTotalPriceSet?: MoneyBag;
  lineItems?: {
    nodes?: Array<{
      id?: string | null;
      sku?: string | null;
      title?: string | null;
      variantTitle?: string | null;
      quantity?: number | null;
      discountedTotalSet?: MoneyBag;
      originalTotalSet?: MoneyBag;
      totalTaxSet?: MoneyBag;
      product?: { id?: string | null } | null;
      variant?: { id?: string | null } | null;
    } | null> | null;
  } | null;
  refunds?:
    | Array<{
        id?: string | null;
        createdAt?: string | null;
        updatedAt?: string | null;
        totalRefundedSet?: MoneyBag;
        refundShippingLines?: {
          edges?: Array<{
            node?: {
              amountSet?: MoneyBag;
              subtotalAmountSet?: MoneyBag;
              taxAmountSet?: MoneyBag;
            } | null;
          } | null> | null;
        } | null;
        refundLineItems?: {
          nodes?: Array<{
            subtotalSet?: MoneyBag;
            totalTaxSet?: MoneyBag;
          } | null> | null;
        } | null;
      } | null>
    | {
        nodes?: Array<{
          id?: string | null;
          createdAt?: string | null;
          updatedAt?: string | null;
          totalRefundedSet?: MoneyBag;
          refundShippingLines?: {
            edges?: Array<{
              node?: {
                amountSet?: MoneyBag;
                subtotalAmountSet?: MoneyBag;
                taxAmountSet?: MoneyBag;
              } | null;
            } | null> | null;
          } | null;
          refundLineItems?: {
            nodes?: Array<{
              subtotalSet?: MoneyBag;
              totalTaxSet?: MoneyBag;
            } | null> | null;
          } | null;
        } | null> | null;
      }
    | null;
  transactions?:
    | Array<{
        id?: string | null;
        kind?: string | null;
        status?: string | null;
        gateway?: string | null;
        processedAt?: string | null;
        amountSet?: MoneyBag;
      } | null>
    | {
        nodes?: Array<{
          id?: string | null;
          kind?: string | null;
          status?: string | null;
          gateway?: string | null;
          processedAt?: string | null;
          amountSet?: MoneyBag;
        } | null> | null;
      }
    | null;
}

interface ShopifyOrdersPagePayload {
  orders?: {
    pageInfo?: {
      hasNextPage?: boolean | null;
      endCursor?: string | null;
    } | null;
    edges?: Array<{ node?: ShopifyGraphqlOrderNode | null } | null> | null;
  } | null;
}

interface ShopifyGraphqlReturnNode {
  id?: string | null;
  status?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  order?: {
    id?: string | null;
  } | null;
}

interface ShopifyReturnsPagePayload {
  returns?: {
    pageInfo?: {
      hasNextPage?: boolean | null;
      endCursor?: string | null;
    } | null;
    edges?: Array<{ node?: ShopifyGraphqlReturnNode | null } | null> | null;
  } | null;
}

const ORDERS_QUERY = `
  query ShopifyCommerceOrders($query: String!, $cursor: String) {
    orders(first: 100, after: $cursor, sortKey: UPDATED_AT, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
          createdAt
          updatedAt
          processedAt
          cancelledAt
          closedAt
          displayFinancialStatus
          displayFulfillmentStatus
          customer {
            id
          }
          customerJourneySummary {
            customerOrderIndex
          }
          subtotalPriceSet { shopMoney { amount currencyCode } }
          totalDiscountsSet { shopMoney { amount currencyCode } }
          totalShippingPriceSet { shopMoney { amount currencyCode } }
          totalTaxSet { shopMoney { amount currencyCode } }
          totalRefundedSet { shopMoney { amount currencyCode } }
          totalPriceSet { shopMoney { amount currencyCode } }
          originalTotalPriceSet { shopMoney { amount currencyCode } }
          currentTotalPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 100) {
            nodes {
              id
              sku
              title
              variantTitle
              quantity
              discountedTotalSet { shopMoney { amount currencyCode } }
              originalTotalSet { shopMoney { amount currencyCode } }
              product { id }
              variant { id }
            }
          }
          refunds {
            id
            createdAt
            updatedAt
            totalRefundedSet { shopMoney { amount currencyCode } }
                refundShippingLines(first: 20) {
                  edges {
                    node {
                      subtotalAmountSet { shopMoney { amount currencyCode } }
                      taxAmountSet { shopMoney { amount currencyCode } }
                    }
                  }
                }
            refundLineItems(first: 100) {
              nodes {
                subtotalSet { shopMoney { amount currencyCode } }
                totalTaxSet { shopMoney { amount currencyCode } }
              }
            }
          }
          transactions {
            id
            kind
            status
            gateway
            processedAt
            amountSet { shopMoney { amount currencyCode } }
          }
        }
      }
    }
  }
`;

const RETURNS_QUERY = `
  query ShopifyCommerceReturns($query: String!, $cursor: String) {
    returns(first: 100, after: $cursor, sortKey: UPDATED_AT, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          status
          createdAt
          updatedAt
          order {
            id
          }
        }
      }
    }
  }
`;

function moneyAmount(value: MoneyBag | undefined) {
  return toNumber(value?.shopMoney?.amount);
}

function moneyCurrency(value: MoneyBag | undefined) {
  return value?.shopMoney?.currencyCode ?? null;
}

function trimGid(value: string | null | undefined) {
  return value ? value.split("/").pop() ?? value : null;
}

function normalizeNodes<T>(
  value: Array<T | null> | { nodes?: Array<T | null> | null } | null | undefined
) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.nodes) ? value.nodes : [];
}

function toTimeZoneIsoDate(value: string | null | undefined, timeZone?: string | null) {
  if (!value) return null;
  if (!timeZone) return value.slice(0, 10);
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return value.slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function mapShopifyOrderNodeToWarehouseRows(input: {
  businessId: string;
  providerAccountId: string;
  shopId: string;
  node: ShopifyGraphqlOrderNode;
  sourceSnapshotId?: string | null;
  timeZone?: string | null;
}) {
  const currencyCode =
    moneyCurrency(input.node.totalPriceSet) ??
    moneyCurrency(input.node.originalTotalPriceSet) ??
    moneyCurrency(input.node.currentTotalPriceSet) ??
    null;
  const orderId = trimGid(input.node.id);
  if (!orderId || !input.node.createdAt) {
    throw new Error("shopify_order_missing_required_fields");
  }

  const order: ShopifyOrderWarehouseRow = {
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    shopId: input.shopId,
    orderId,
    orderName: input.node.name ?? null,
    customerId: trimGid(input.node.customer?.id),
    currencyCode,
    shopCurrencyCode: currencyCode,
    orderCreatedAt: input.node.createdAt,
    orderCreatedDateLocal: toTimeZoneIsoDate(input.node.createdAt, input.timeZone),
    orderUpdatedAt: input.node.updatedAt ?? null,
    orderUpdatedDateLocal: toTimeZoneIsoDate(input.node.updatedAt ?? input.node.createdAt, input.timeZone),
    orderProcessedAt: input.node.processedAt ?? null,
    orderCancelledAt: input.node.cancelledAt ?? null,
    orderClosedAt: input.node.closedAt ?? null,
    financialStatus: input.node.displayFinancialStatus ?? null,
    fulfillmentStatus: input.node.displayFulfillmentStatus ?? null,
    customerJourneySummary: input.node.customerJourneySummary ?? null,
    subtotalPrice: moneyAmount(input.node.subtotalPriceSet),
    totalDiscounts: moneyAmount(input.node.totalDiscountsSet),
    totalShipping: moneyAmount(input.node.totalShippingPriceSet),
    totalTax: moneyAmount(input.node.totalTaxSet),
    totalRefunded: moneyAmount(input.node.totalRefundedSet),
    totalPrice: moneyAmount(input.node.totalPriceSet),
    originalTotalPrice: moneyAmount(input.node.originalTotalPriceSet),
    currentTotalPrice: moneyAmount(input.node.currentTotalPriceSet),
    payloadJson: input.node,
    sourceSnapshotId: input.sourceSnapshotId ?? null,
  };

  const orderLines: ShopifyOrderLineWarehouseRow[] = (input.node.lineItems?.nodes ?? [])
    .filter((row): row is NonNullable<typeof row> => Boolean(row?.id))
    .map((row) => ({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      shopId: input.shopId,
      orderId,
      lineItemId: trimGid(row.id)!,
      productId: trimGid(row.product?.id),
      variantId: trimGid(row.variant?.id),
      sku: row.sku ?? null,
      title: row.title ?? null,
      variantTitle: row.variantTitle ?? null,
      quantity: row.quantity ?? 0,
      discountedTotal: moneyAmount(row.discountedTotalSet),
      originalTotal: moneyAmount(row.originalTotalSet),
      taxTotal: 0,
      observedAt: input.node.updatedAt ?? input.node.createdAt,
      payloadJson: row,
      sourceSnapshotId: input.sourceSnapshotId ?? null,
    }));

  const refunds: ShopifyRefundWarehouseRow[] = normalizeNodes(input.node.refunds)
    .filter((row): row is NonNullable<typeof row> => Boolean(row?.id && (row.updatedAt ?? row.createdAt)))
    .map((row) => ({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      shopId: input.shopId,
      orderId,
      refundId: trimGid(row.id)!,
      refundedAt: row.updatedAt ?? row.createdAt!,
      refundedDateLocal: toTimeZoneIsoDate(row.updatedAt ?? row.createdAt, input.timeZone),
      refundedSales: round2(
        (row.refundLineItems?.nodes ?? []).reduce(
          (sum, line) => sum + moneyAmount(line?.subtotalSet),
          0
        )
      ),
      refundedShipping: round2(
        (row.refundShippingLines?.edges ?? []).reduce(
          (sum, edge) =>
            sum +
            moneyAmount(edge?.node?.subtotalAmountSet ?? edge?.node?.amountSet),
          0
        )
      ),
      refundedTaxes: round2(
        (row.refundLineItems?.nodes ?? []).reduce(
          (sum, line) => sum + moneyAmount(line?.totalTaxSet),
          0
        ) +
          (row.refundShippingLines?.edges ?? []).reduce(
            (sum, edge) => sum + moneyAmount(edge?.node?.taxAmountSet),
            0
          )
      ),
      totalRefunded: moneyAmount(row.totalRefundedSet),
      payloadJson: row,
      sourceSnapshotId: input.sourceSnapshotId ?? null,
    }));

  const transactions: ShopifyOrderTransactionWarehouseRow[] = normalizeNodes(input.node.transactions)
    .filter((row): row is NonNullable<typeof row> => Boolean(row?.id))
    .map((row) => ({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      shopId: input.shopId,
      orderId,
      transactionId: trimGid(row.id)!,
      kind: row.kind ?? null,
      status: row.status ?? null,
      gateway: row.gateway ?? null,
      processedAt: row.processedAt ?? null,
      amount: moneyAmount(row.amountSet),
      currencyCode: moneyCurrency(row.amountSet),
      payloadJson: row,
      sourceSnapshotId: input.sourceSnapshotId ?? null,
    }));

  return { order, orderLines, refunds, transactions };
}

export function mapShopifySalesEventsFromOrderWarehouseRows(input: {
  order: ShopifyOrderWarehouseRow;
  refunds: ShopifyRefundWarehouseRow[];
}) {
  const baseGrossRevenue =
    input.order.originalTotalPrice ?? input.order.totalPrice ?? input.order.currentTotalPrice ?? 0;
  const currentGrossRevenue =
    input.order.currentTotalPrice ?? input.order.totalPrice ?? input.order.originalTotalPrice ?? 0;
  const adjustmentDelta = round2(currentGrossRevenue - baseGrossRevenue);
  const orderEvent: ShopifySalesEventWarehouseRow = {
    businessId: input.order.businessId,
    providerAccountId: input.order.providerAccountId,
    shopId: input.order.shopId,
    eventId: `order:${input.order.orderId}`,
    sourceKind: "order",
    sourceId: input.order.orderId,
    orderId: input.order.orderId,
    occurredAt: input.order.orderProcessedAt ?? input.order.orderCreatedAt,
    occurredDateLocal: input.order.orderCreatedDateLocal ?? null,
    grossSales: baseGrossRevenue,
    refundedSales: 0,
    refundedShipping: 0,
    refundedTaxes: 0,
    netRevenue: baseGrossRevenue,
    currencyCode: input.order.currencyCode ?? null,
    payloadJson: input.order.payloadJson ?? null,
    sourceSnapshotId: input.order.sourceSnapshotId ?? null,
  };
  const adjustmentEvent =
    adjustmentDelta === 0
      ? null
      : ({
          businessId: input.order.businessId,
          providerAccountId: input.order.providerAccountId,
          shopId: input.order.shopId,
          eventId: `adjustment:${input.order.orderId}`,
          sourceKind: "adjustment",
          sourceId: input.order.orderId,
          orderId: input.order.orderId,
          occurredAt:
            input.order.orderUpdatedAt ??
            input.order.orderProcessedAt ??
            input.order.orderCreatedAt,
          occurredDateLocal:
            input.order.orderUpdatedDateLocal ??
            input.order.orderCreatedDateLocal ??
            null,
          grossSales: adjustmentDelta > 0 ? adjustmentDelta : 0,
          refundedSales: adjustmentDelta < 0 ? Math.abs(adjustmentDelta) : 0,
          refundedShipping: 0,
          refundedTaxes: 0,
          netRevenue: adjustmentDelta,
          currencyCode: input.order.currencyCode ?? null,
          payloadJson: {
            orderId: input.order.orderId,
            originalTotalPrice: input.order.originalTotalPrice ?? null,
            currentTotalPrice: input.order.currentTotalPrice ?? null,
            totalPrice: input.order.totalPrice ?? null,
            adjustmentDelta,
          },
          sourceSnapshotId: input.order.sourceSnapshotId ?? null,
        } satisfies ShopifySalesEventWarehouseRow);
  const refundEvents: ShopifySalesEventWarehouseRow[] = input.refunds.map((refund) => {
    const refundedSales = refund.refundedSales ?? 0;
    const refundedShipping = refund.refundedShipping ?? 0;
    const refundedTaxes = refund.refundedTaxes ?? 0;
    const totalRefunded = refundedSales + refundedShipping + refundedTaxes;
    return {
      businessId: refund.businessId,
      providerAccountId: refund.providerAccountId,
      shopId: refund.shopId,
      eventId: `refund:${refund.refundId}`,
      sourceKind: "refund",
      sourceId: refund.refundId,
      orderId: refund.orderId,
      occurredAt: refund.refundedAt,
      occurredDateLocal: refund.refundedDateLocal ?? null,
      grossSales: 0,
      refundedSales,
      refundedShipping,
      refundedTaxes,
      netRevenue: -round2(totalRefunded),
      currencyCode: input.order.currencyCode ?? null,
      payloadJson: refund.payloadJson ?? null,
        sourceSnapshotId: refund.sourceSnapshotId ?? null,
      } satisfies ShopifySalesEventWarehouseRow;
  });
  return adjustmentEvent ? [orderEvent, adjustmentEvent, ...refundEvents] : [orderEvent, ...refundEvents];
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function mapShopifyReturnNodeToWarehouseRow(input: {
  businessId: string;
  providerAccountId: string;
  shopId: string;
  node: ShopifyGraphqlReturnNode;
  sourceSnapshotId?: string | null;
  timeZone?: string | null;
}) {
  const returnId = trimGid(input.node.id);
  const createdAt = input.node.createdAt ?? input.node.updatedAt;
  if (!returnId || !createdAt) {
    throw new Error("shopify_return_missing_required_fields");
  }

  return {
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    shopId: input.shopId,
    orderId: trimGid(input.node.order?.id),
    returnId,
    status: input.node.status ?? null,
    createdAt,
    createdDateLocal: toTimeZoneIsoDate(createdAt, input.timeZone),
    updatedAt: input.node.updatedAt ?? null,
    updatedDateLocal: toTimeZoneIsoDate(input.node.updatedAt ?? createdAt, input.timeZone),
    payloadJson: input.node,
    sourceSnapshotId: input.sourceSnapshotId ?? null,
  } satisfies ShopifyReturnWarehouseRow;
}

export function mapShopifySalesEventFromReturnWarehouseRow(input: {
  row: ShopifyReturnWarehouseRow;
}) {
  return {
    businessId: input.row.businessId,
    providerAccountId: input.row.providerAccountId,
    shopId: input.row.shopId,
    eventId: `return:${input.row.returnId}`,
    sourceKind: "return",
    sourceId: input.row.returnId,
    orderId: input.row.orderId ?? null,
    occurredAt: input.row.updatedAt ?? input.row.createdAt,
    occurredDateLocal: input.row.updatedDateLocal ?? input.row.createdDateLocal ?? null,
    grossSales: 0,
    refundedSales: 0,
    refundedShipping: 0,
    refundedTaxes: 0,
    netRevenue: 0,
    currencyCode: null,
    payloadJson: input.row.payloadJson ?? null,
    sourceSnapshotId: input.row.sourceSnapshotId ?? null,
  } satisfies ShopifySalesEventWarehouseRow;
}

export async function syncShopifyOrdersWindow(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  queryField?: "created_at" | "updated_at";
  runtimeValidationLog?: (phase: string, summary?: Record<string, unknown>) => void;
  runtimeValidationRunId?: string;
}) {
  const logRuntimeValidation = input.runtimeValidationLog ?? (() => {});
  const credentials = await resolveShopifyAdminCredentials(input.businessId);
  if (!credentials) {
    return {
      success: false,
      reason: "not_connected" as const,
      orders: 0,
      orderLines: 0,
      refunds: 0,
      transactions: 0,
      pages: 0,
    };
  }

  const canReadOrders =
    hasShopifyScope(credentials.scopes, "read_orders") ||
    hasShopifyScope(credentials.scopes, "read_all_orders");
  if (!canReadOrders) {
    return {
      success: false,
      reason: "missing_read_orders_scope" as const,
      orders: 0,
      orderLines: 0,
      refunds: 0,
      transactions: 0,
      pages: 0,
    };
  }

  let cursor: string | null = null;
  let pageCount = 0;
  let ordersWritten = 0;
  let orderLinesWritten = 0;
  let refundsWritten = 0;
  let transactionsWritten = 0;
  let maxUpdatedAt: string | null = null;
  const timeZone =
    typeof credentials.metadata?.iana_timezone === "string"
      ? credentials.metadata.iana_timezone
      : null;
  const queryField = input.queryField ?? "created_at";
  const query = `${queryField}:>=${input.startDate}T00:00:00Z ${queryField}:<=${input.endDate}T23:59:59Z status:any test:false`;

  while (pageCount < 20) {
    pageCount += 1;
    logRuntimeValidation("recent_orders_page_loop_started", {
      pageCount,
      cursorPresent: cursor !== null,
      queryField,
      startDate: input.startDate,
      endDate: input.endDate,
    });
    logRuntimeValidation("recent_orders_source_fetch_started", {
      pageCount,
      cursorPresent: cursor !== null,
    });
    let payload: ShopifyOrdersPagePayload;
    try {
      payload = await shopifyAdminGraphql<ShopifyOrdersPagePayload>({
        shopId: credentials.shopId,
        accessToken: credentials.accessToken,
        query: ORDERS_QUERY,
        variables: {
          query,
          cursor,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logRuntimeValidation("recent_orders_source_fetch_failed", {
        pageCount,
        cursorPresent: cursor !== null,
        message,
      });
      throw error;
    }
    const edges = Array.isArray(payload.orders?.edges) ? payload.orders?.edges : [];
    logRuntimeValidation("recent_orders_source_fetch_succeeded", {
      pageCount,
      edgeCount: edges.length,
      hasNextPage: payload.orders?.pageInfo?.hasNextPage === true,
      endCursorPresent: Boolean(payload.orders?.pageInfo?.endCursor),
    });
    logRuntimeValidation("recent_orders_page_received", {
      pageCount,
      edgeCount: edges.length,
      hasNextPage: payload.orders?.pageInfo?.hasNextPage === true,
      endCursorPresent: Boolean(payload.orders?.pageInfo?.endCursor),
    });

    logRuntimeValidation("recent_orders_snapshot_persist_started", {
      pageCount,
      edgeCount: edges.length,
      cursorPresent: cursor !== null,
    });
    const snapshotId = await insertShopifyRawSnapshot({
      businessId: input.businessId,
      providerAccountId: credentials.shopId,
      endpointName: "orders",
      entityScope: "order",
      startDate: input.startDate,
      endDate: input.endDate,
      payloadJson: payload,
      payloadHash: buildShopifyRawSnapshotHash({
        businessId: input.businessId,
        providerAccountId: credentials.shopId,
        endpointName: "orders",
        startDate: input.startDate,
        endDate: input.endDate,
        payload,
      }),
      requestContext: {
        cursor,
        query,
      },
      status: "fetched",
    });
    logRuntimeValidation("recent_orders_snapshot_persist_succeeded", {
      pageCount,
      snapshotId,
    });

    const ordersBatch: ShopifyOrderWarehouseRow[] = [];
    const orderLinesBatch: ShopifyOrderLineWarehouseRow[] = [];
    const refundsBatch: ShopifyRefundWarehouseRow[] = [];
    const transactionsBatch: ShopifyOrderTransactionWarehouseRow[] = [];
    const salesEventsBatch: ShopifySalesEventWarehouseRow[] = [];

    logRuntimeValidation("recent_orders_normalization_started", {
      pageCount,
      edgeCount: edges.length,
    });
    for (const edge of edges) {
      const node = edge?.node;
      if (!node?.id || !node.createdAt) continue;
      const mappedRow = mapShopifyOrderNodeToWarehouseRows({
        businessId: input.businessId,
        providerAccountId: credentials.shopId,
        shopId: credentials.shopId,
        node,
        sourceSnapshotId: snapshotId,
        timeZone,
      });
      const candidate = mappedRow.order.orderUpdatedAt ?? mappedRow.order.orderCreatedAt;
      if (candidate && (!maxUpdatedAt || candidate > maxUpdatedAt)) {
        maxUpdatedAt = candidate;
      }
      ordersBatch.push(mappedRow.order);
      orderLinesBatch.push(...mappedRow.orderLines);
      refundsBatch.push(...mappedRow.refunds);
      transactionsBatch.push(...mappedRow.transactions);
      salesEventsBatch.push(
        ...mapShopifySalesEventsFromOrderWarehouseRows({
          order: mappedRow.order,
          refunds: mappedRow.refunds,
        })
      );
    }
    logRuntimeValidation("recent_orders_normalization_succeeded", {
      pageCount,
      ordersBatchCount: ordersBatch.length,
      orderLinesBatchCount: orderLinesBatch.length,
      refundsBatchCount: refundsBatch.length,
      transactionsBatchCount: transactionsBatch.length,
      salesEventsBatchCount: salesEventsBatch.length,
    });

    logRuntimeValidation("recent_orders_upsert_started", {
      pageCount,
      ordersBatchCount: ordersBatch.length,
      orderLinesBatchCount: orderLinesBatch.length,
      refundsBatchCount: refundsBatch.length,
      transactionsBatchCount: transactionsBatch.length,
      salesEventsBatchCount: salesEventsBatch.length,
    });
    logRuntimeValidation("recent_orders_orders_upsert_started", {
      pageCount,
      ordersBatchCount: ordersBatch.length,
    });
    ordersWritten += await upsertShopifyOrders(ordersBatch);
    logRuntimeValidation("recent_orders_orders_upsert_succeeded", {
      pageCount,
      ordersWritten,
    });
    logRuntimeValidation("recent_orders_order_lines_upsert_started", {
      pageCount,
      orderLinesBatchCount: orderLinesBatch.length,
    });
    orderLinesWritten += await upsertShopifyOrderLines(orderLinesBatch);
    logRuntimeValidation("recent_orders_order_lines_upsert_succeeded", {
      pageCount,
      orderLinesWritten,
    });
    logRuntimeValidation("recent_orders_refunds_upsert_started", {
      pageCount,
      refundsBatchCount: refundsBatch.length,
    });
    refundsWritten += await upsertShopifyRefunds(refundsBatch);
    logRuntimeValidation("recent_orders_refunds_upsert_succeeded", {
      pageCount,
      refundsWritten,
    });
    logRuntimeValidation("recent_orders_sales_events_upsert_started", {
      pageCount,
      salesEventsBatchCount: salesEventsBatch.length,
    });
    await upsertShopifySalesEvents(salesEventsBatch, {
      runtimeValidation:
        input.runtimeValidationRunId && input.runtimeValidationLog
          ? {
              runId: input.runtimeValidationRunId,
              pageCount,
              log: input.runtimeValidationLog,
            }
          : undefined,
    });
    logRuntimeValidation("recent_orders_sales_events_upsert_succeeded", {
      pageCount,
      salesEventsBatchCount: salesEventsBatch.length,
    });
    logRuntimeValidation("recent_orders_transactions_upsert_started", {
      pageCount,
      transactionsBatchCount: transactionsBatch.length,
    });
    transactionsWritten += await upsertShopifyOrderTransactions(transactionsBatch, {
      runtimeValidation:
        input.runtimeValidationRunId && input.runtimeValidationLog
          ? {
              runId: input.runtimeValidationRunId,
              pageCount,
              log: input.runtimeValidationLog,
            }
          : undefined,
    });
    logRuntimeValidation("recent_orders_transactions_upsert_succeeded", {
      pageCount,
      transactionsWritten,
    });
    logRuntimeValidation("recent_orders_upsert_succeeded", {
      pageCount,
      ordersWritten,
      orderLinesWritten,
      refundsWritten,
      transactionsWritten,
      maxUpdatedAt,
    });

    if (!payload.orders?.pageInfo?.hasNextPage || !payload.orders?.pageInfo?.endCursor) {
      break;
    }
    cursor = payload.orders.pageInfo.endCursor;
  }

  return {
    success: true,
    reason: "ok" as const,
    orders: ordersWritten,
    orderLines: orderLinesWritten,
    refunds: refundsWritten,
    transactions: transactionsWritten,
    pages: pageCount,
    maxUpdatedAt,
  };
}

export async function syncShopifyReturnsWindow(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const credentials = await resolveShopifyAdminCredentials(input.businessId);
  if (!credentials) {
    return {
      success: false,
      reason: "not_connected" as const,
      returns: 0,
      pages: 0,
      maxUpdatedAt: null as string | null,
    };
  }

  if (!hasShopifyScope(credentials.scopes, "read_returns")) {
    return {
      success: false,
      reason: "missing_read_returns_scope" as const,
      returns: 0,
      pages: 0,
      maxUpdatedAt: null as string | null,
    };
  }

  let cursor: string | null = null;
  let pageCount = 0;
  let returnsWritten = 0;
  let maxUpdatedAt: string | null = null;
  const timeZone =
    typeof credentials.metadata?.iana_timezone === "string"
      ? credentials.metadata.iana_timezone
      : null;
  const query = `updated_at:>=${input.startDate}T00:00:00Z updated_at:<=${input.endDate}T23:59:59Z`;

  while (pageCount < 20) {
    pageCount += 1;
    let payload: ShopifyReturnsPagePayload;
    try {
      payload = await shopifyAdminGraphql<ShopifyReturnsPagePayload>({
        shopId: credentials.shopId,
        accessToken: credentials.accessToken,
        query: RETURNS_QUERY,
        variables: {
          query,
          cursor,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const returnsSurfaceUnavailable =
        message.includes("Field 'returns' doesn't exist on type 'QueryRoot'") ||
        message.includes('Cannot query field "returns" on type "QueryRoot"');
      if (returnsSurfaceUnavailable) {
        return {
          success: true,
          reason: "returns_api_unavailable" as const,
          returns: 0,
          pages: 0,
          maxUpdatedAt: null as string | null,
        };
      }
      throw error;
    }

    const snapshotId = await insertShopifyRawSnapshot({
      businessId: input.businessId,
      providerAccountId: credentials.shopId,
      endpointName: "returns",
      entityScope: "return",
      startDate: input.startDate,
      endDate: input.endDate,
      payloadJson: payload,
      payloadHash: buildShopifyRawSnapshotHash({
        businessId: input.businessId,
        providerAccountId: credentials.shopId,
        endpointName: "returns",
        startDate: input.startDate,
        endDate: input.endDate,
        payload,
      }),
      requestContext: {
        cursor,
        query,
      },
      status: "fetched",
    });

    const mapped = (Array.isArray(payload.returns?.edges) ? payload.returns.edges : [])
      .map((edge) => edge?.node)
      .filter((node): node is ShopifyGraphqlReturnNode => Boolean(node?.id && (node?.updatedAt ?? node?.createdAt)))
      .map((node) =>
        mapShopifyReturnNodeToWarehouseRow({
          businessId: input.businessId,
          providerAccountId: credentials.shopId,
          shopId: credentials.shopId,
          node,
          sourceSnapshotId: snapshotId,
          timeZone,
        })
      );

    for (const row of mapped) {
      const candidate = row.updatedAt ?? row.createdAt;
      if (candidate && (!maxUpdatedAt || candidate > maxUpdatedAt)) {
        maxUpdatedAt = candidate;
      }
    }

    returnsWritten += await upsertShopifyReturns(mapped);
    await upsertShopifySalesEvents(
      mapped.map((row) =>
        mapShopifySalesEventFromReturnWarehouseRow({
          row,
        })
      )
    );

    if (!payload.returns?.pageInfo?.hasNextPage || !payload.returns?.pageInfo?.endCursor) {
      break;
    }
    cursor = payload.returns.pageInfo.endCursor;
  }

  return {
    success: true,
    reason: "ok" as const,
    returns: returnsWritten,
    pages: pageCount,
    maxUpdatedAt,
  };
}
