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
} from "@/lib/shopify/warehouse";
import type {
  ShopifyOrderLineWarehouseRow,
  ShopifyOrderTransactionWarehouseRow,
  ShopifyOrderWarehouseRow,
  ShopifyRefundWarehouseRow,
  ShopifyReturnWarehouseRow,
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
  refunds?: {
    nodes?: Array<{
      id?: string | null;
      createdAt?: string | null;
      updatedAt?: string | null;
      totalRefundedSet?: MoneyBag;
      refundShippingLines?: {
        edges?: Array<{
          node?: {
            amountSet?: MoneyBag;
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
  } | null;
  transactions?: {
    nodes?: Array<{
      id?: string | null;
      kind?: string | null;
      status?: string | null;
      gateway?: string | null;
      processedAt?: string | null;
      amountSet?: MoneyBag;
    } | null> | null;
  } | null;
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
          customerJourneySummary
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
              totalTaxSet { shopMoney { amount currencyCode } }
              product { id }
              variant { id }
            }
          }
          refunds(first: 50) {
            nodes {
              id
              createdAt
              updatedAt
              totalRefundedSet { shopMoney { amount currencyCode } }
              refundShippingLines(first: 20) {
                edges {
                  node {
                    amountSet { shopMoney { amount currencyCode } }
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
          }
          transactions(first: 50) {
            nodes {
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

export function mapShopifyOrderNodeToWarehouseRows(input: {
  businessId: string;
  providerAccountId: string;
  shopId: string;
  node: ShopifyGraphqlOrderNode;
  sourceSnapshotId?: string | null;
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
    orderUpdatedAt: input.node.updatedAt ?? null,
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
      taxTotal: moneyAmount(row.totalTaxSet),
      payloadJson: row,
      sourceSnapshotId: input.sourceSnapshotId ?? null,
    }));

  const refunds: ShopifyRefundWarehouseRow[] = (input.node.refunds?.nodes ?? [])
    .filter((row): row is NonNullable<typeof row> => Boolean(row?.id && (row.updatedAt ?? row.createdAt)))
    .map((row) => ({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId,
      shopId: input.shopId,
      orderId,
      refundId: trimGid(row.id)!,
      refundedAt: row.updatedAt ?? row.createdAt!,
      refundedSales: round2(
        (row.refundLineItems?.nodes ?? []).reduce(
          (sum, line) => sum + moneyAmount(line?.subtotalSet),
          0
        )
      ),
      refundedShipping: round2(
        (row.refundShippingLines?.edges ?? []).reduce(
          (sum, edge) => sum + moneyAmount(edge?.node?.amountSet),
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

  const transactions: ShopifyOrderTransactionWarehouseRow[] = (input.node.transactions?.nodes ?? [])
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

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function mapShopifyReturnNodeToWarehouseRow(input: {
  businessId: string;
  providerAccountId: string;
  shopId: string;
  node: ShopifyGraphqlReturnNode;
  sourceSnapshotId?: string | null;
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
    updatedAt: input.node.updatedAt ?? null,
    payloadJson: input.node,
    sourceSnapshotId: input.sourceSnapshotId ?? null,
  } satisfies ShopifyReturnWarehouseRow;
}

export async function syncShopifyOrdersWindow(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  queryField?: "created_at" | "updated_at";
}) {
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
  const queryField = input.queryField ?? "created_at";
  const query = `${queryField}:>=${input.startDate}T00:00:00Z ${queryField}:<=${input.endDate}T23:59:59Z status:any test:false`;

  while (pageCount < 20) {
    pageCount += 1;
    const payload: ShopifyOrdersPagePayload = await shopifyAdminGraphql<ShopifyOrdersPagePayload>({
      shopId: credentials.shopId,
      accessToken: credentials.accessToken,
      query: ORDERS_QUERY,
      variables: {
        query,
        cursor,
      },
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

    const edges = Array.isArray(payload.orders?.edges) ? payload.orders?.edges : [];
    const mapped = edges
      .map((edge) => edge?.node)
      .filter((node): node is ShopifyGraphqlOrderNode => Boolean(node?.id && node?.createdAt))
      .map((node) =>
        mapShopifyOrderNodeToWarehouseRows({
          businessId: input.businessId,
          providerAccountId: credentials.shopId,
          shopId: credentials.shopId,
          node,
          sourceSnapshotId: snapshotId,
        })
      );

    for (const mappedRow of mapped) {
      const candidate = mappedRow.order.orderUpdatedAt ?? mappedRow.order.orderCreatedAt;
      if (candidate && (!maxUpdatedAt || candidate > maxUpdatedAt)) {
        maxUpdatedAt = candidate;
      }
    }

    ordersWritten += await upsertShopifyOrders(mapped.map((row) => row.order));
    orderLinesWritten += await upsertShopifyOrderLines(mapped.flatMap((row) => row.orderLines));
    refundsWritten += await upsertShopifyRefunds(mapped.flatMap((row) => row.refunds));
    transactionsWritten += await upsertShopifyOrderTransactions(
      mapped.flatMap((row) => row.transactions)
    );

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
  const query = `updated_at:>=${input.startDate}T00:00:00Z updated_at:<=${input.endDate}T23:59:59Z`;

  while (pageCount < 20) {
    pageCount += 1;
    const payload: ShopifyReturnsPagePayload = await shopifyAdminGraphql<ShopifyReturnsPagePayload>({
      shopId: credentials.shopId,
      accessToken: credentials.accessToken,
      query: RETURNS_QUERY,
      variables: {
        query,
        cursor,
      },
    });

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
        })
      );

    for (const row of mapped) {
      const candidate = row.updatedAt ?? row.createdAt;
      if (candidate && (!maxUpdatedAt || candidate > maxUpdatedAt)) {
        maxUpdatedAt = candidate;
      }
    }

    returnsWritten += await upsertShopifyReturns(mapped);

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
