export type ShopifyWarehouseDataState =
  | "not_connected"
  | "syncing"
  | "partial"
  | "stale"
  | "ready"
  | "action_required";

export type ShopifyRawSnapshotStatus = "fetched" | "partial" | "failed";

export interface ShopifyRawSnapshotRecord {
  id?: string;
  businessId: string;
  providerAccountId: string;
  endpointName: string;
  entityScope: string;
  startDate?: string | null;
  endDate?: string | null;
  payloadJson: unknown;
  payloadHash: string;
  requestContext?: Record<string, unknown>;
  responseHeaders?: Record<string, unknown>;
  providerHttpStatus?: number | null;
  status: ShopifyRawSnapshotStatus;
  fetchedAt?: string;
}

export interface ShopifyOrderWarehouseRow {
  businessId: string;
  providerAccountId: string;
  shopId: string;
  orderId: string;
  orderName?: string | null;
  customerId?: string | null;
  currencyCode?: string | null;
  shopCurrencyCode?: string | null;
  orderCreatedAt: string;
  orderCreatedDateLocal?: string | null;
  orderUpdatedAt?: string | null;
  orderUpdatedDateLocal?: string | null;
  orderProcessedAt?: string | null;
  orderCancelledAt?: string | null;
  orderClosedAt?: string | null;
  financialStatus?: string | null;
  fulfillmentStatus?: string | null;
  customerJourneySummary?: unknown;
  subtotalPrice?: number;
  totalDiscounts?: number;
  totalShipping?: number;
  totalTax?: number;
  totalRefunded?: number;
  totalPrice?: number;
  originalTotalPrice?: number;
  currentTotalPrice?: number;
  payloadJson?: unknown;
  sourceSnapshotId?: string | null;
}

export interface ShopifyOrderLineWarehouseRow {
  businessId: string;
  providerAccountId: string;
  shopId: string;
  orderId: string;
  lineItemId: string;
  productId?: string | null;
  variantId?: string | null;
  sku?: string | null;
  title?: string | null;
  variantTitle?: string | null;
  quantity?: number;
  discountedTotal?: number;
  originalTotal?: number;
  taxTotal?: number;
  payloadJson?: unknown;
  sourceSnapshotId?: string | null;
}

export interface ShopifyRefundWarehouseRow {
  businessId: string;
  providerAccountId: string;
  shopId: string;
  orderId: string;
  refundId: string;
  refundedAt: string;
  refundedDateLocal?: string | null;
  refundedSales?: number;
  refundedShipping?: number;
  refundedTaxes?: number;
  totalRefunded?: number;
  payloadJson?: unknown;
  sourceSnapshotId?: string | null;
}

export interface ShopifyOrderTransactionWarehouseRow {
  businessId: string;
  providerAccountId: string;
  shopId: string;
  orderId: string;
  transactionId: string;
  kind?: string | null;
  status?: string | null;
  gateway?: string | null;
  processedAt?: string | null;
  amount?: number;
  currencyCode?: string | null;
  payloadJson?: unknown;
  sourceSnapshotId?: string | null;
}

export interface ShopifyReturnWarehouseRow {
  businessId: string;
  providerAccountId: string;
  shopId: string;
  orderId?: string | null;
  returnId: string;
  status?: string | null;
  createdAt: string;
  createdDateLocal?: string | null;
  updatedAt?: string | null;
  updatedDateLocal?: string | null;
  payloadJson?: unknown;
  sourceSnapshotId?: string | null;
}

export interface ShopifyServingStateRecord {
  businessId: string;
  providerAccountId: string;
  canaryKey: string;
  startDate?: string | null;
  endDate?: string | null;
  timeZoneBasis?: string | null;
  assessedAt?: string | null;
  statusState?: string | null;
  preferredSource?: string | null;
  canServeWarehouse?: boolean;
  canaryEnabled?: boolean;
  decisionReasons?: string[] | null;
  divergence?: Record<string, unknown> | null;
  ordersRecentSyncedAt?: string | null;
  ordersRecentCursorTimestamp?: string | null;
  ordersRecentCursorValue?: string | null;
  returnsRecentSyncedAt?: string | null;
  returnsRecentCursorTimestamp?: string | null;
  returnsRecentCursorValue?: string | null;
  ordersHistoricalSyncedAt?: string | null;
  ordersHistoricalReadyThroughDate?: string | null;
  ordersHistoricalTargetEnd?: string | null;
  returnsHistoricalSyncedAt?: string | null;
  returnsHistoricalReadyThroughDate?: string | null;
  returnsHistoricalTargetEnd?: string | null;
}

export interface ShopifyServingStateHistoryRecord extends ShopifyServingStateRecord {
  id?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ShopifyServingOverrideRecord {
  businessId: string;
  providerAccountId: string;
  overrideKey: string;
  startDate?: string | null;
  endDate?: string | null;
  mode: "auto" | "force_live" | "force_warehouse";
  reason?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export interface ShopifyWebhookDeliveryRecord {
  businessId?: string | null;
  providerAccountId?: string | null;
  topic: string;
  shopDomain: string;
  webhookId?: string | null;
  payloadHash: string;
  payloadJson: unknown;
  receivedAt?: string | null;
  processedAt?: string | null;
  processingState: "received" | "processed" | "ignored" | "failed";
  resultSummary?: Record<string, unknown> | null;
  errorMessage?: string | null;
}

export interface ShopifySalesEventWarehouseRow {
  businessId: string;
  providerAccountId: string;
  shopId: string;
  eventId: string;
  sourceKind: "order" | "refund" | "return";
  sourceId: string;
  orderId?: string | null;
  occurredAt: string;
  occurredDateLocal?: string | null;
  grossSales?: number;
  refundedSales?: number;
  refundedShipping?: number;
  refundedTaxes?: number;
  netRevenue?: number;
  currencyCode?: string | null;
  payloadJson?: unknown;
  sourceSnapshotId?: string | null;
}

export interface ShopifyReconciliationRunRecord {
  businessId: string;
  providerAccountId: string;
  reconciliationKey: string;
  startDate?: string | null;
  endDate?: string | null;
  preferredSource?: string | null;
  canServeWarehouse?: boolean;
  divergence?: Record<string, unknown> | null;
  warehouseAggregate?: Record<string, unknown> | null;
  ledgerAggregate?: Record<string, unknown> | null;
  liveAggregate?: Record<string, unknown> | null;
  recordedAt?: string | null;
}

export interface ShopifyCustomerEventWarehouseRow {
  businessId: string;
  providerAccountId: string;
  shopId: string;
  eventId: string;
  eventType: string;
  occurredAt: string;
  customerId?: string | null;
  sessionId?: string | null;
  pageType?: string | null;
  pageUrl?: string | null;
  consentState?: string | null;
  payloadJson?: unknown;
}
