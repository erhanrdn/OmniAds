import { describe, expect, it } from "vitest";

import {
  mapShopifyOrderNodeToWarehouseRows,
  mapShopifyReturnNodeToWarehouseRow,
} from "@/lib/shopify/commerce-sync";

describe("shopify commerce sync mapping", () => {
  it("maps order, line items, refunds, and transactions into warehouse rows", () => {
    const mapped = mapShopifyOrderNodeToWarehouseRows({
      businessId: "biz_1",
      providerAccountId: "test-shop.myshopify.com",
      shopId: "test-shop.myshopify.com",
      sourceSnapshotId: "snap_1",
      timeZone: "America/New_York",
      node: {
        id: "gid://shopify/Order/1001",
        name: "#1001",
        createdAt: "2026-03-29T13:00:00Z",
        updatedAt: "2026-03-30T02:00:00Z",
        processedAt: "2026-03-29T13:05:00Z",
        displayFinancialStatus: "PAID",
        displayFulfillmentStatus: "FULFILLED",
        customer: { id: "gid://shopify/Customer/99" },
        subtotalPriceSet: { shopMoney: { amount: "120.00", currencyCode: "USD" } },
        totalDiscountsSet: { shopMoney: { amount: "10.00", currencyCode: "USD" } },
        totalShippingPriceSet: { shopMoney: { amount: "20.00", currencyCode: "USD" } },
        totalTaxSet: { shopMoney: { amount: "5.00", currencyCode: "USD" } },
        totalRefundedSet: { shopMoney: { amount: "15.00", currencyCode: "USD" } },
        totalPriceSet: { shopMoney: { amount: "135.00", currencyCode: "USD" } },
        originalTotalPriceSet: { shopMoney: { amount: "135.00", currencyCode: "USD" } },
        currentTotalPriceSet: { shopMoney: { amount: "120.00", currencyCode: "USD" } },
        lineItems: {
          nodes: [
            {
              id: "gid://shopify/LineItem/1",
              sku: "SKU-1",
              title: "Product 1",
              variantTitle: "Blue",
              quantity: 2,
              discountedTotalSet: { shopMoney: { amount: "90.00", currencyCode: "USD" } },
              originalTotalSet: { shopMoney: { amount: "100.00", currencyCode: "USD" } },
              totalTaxSet: { shopMoney: { amount: "4.00", currencyCode: "USD" } },
              product: { id: "gid://shopify/Product/10" },
              variant: { id: "gid://shopify/ProductVariant/20" },
            },
          ],
        },
        refunds: {
          nodes: [
            {
              id: "gid://shopify/Refund/500",
              createdAt: "2026-03-30T10:00:00Z",
              updatedAt: "2026-03-30T10:05:00Z",
              totalRefundedSet: { shopMoney: { amount: "15.00", currencyCode: "USD" } },
              refundLineItems: {
                nodes: [
                  {
                    subtotalSet: { shopMoney: { amount: "10.00", currencyCode: "USD" } },
                    totalTaxSet: { shopMoney: { amount: "2.00", currencyCode: "USD" } },
                  },
                ],
              },
              refundShippingLines: {
                edges: [
                  {
                    node: {
                      amountSet: { shopMoney: { amount: "3.00", currencyCode: "USD" } },
                      taxAmountSet: { shopMoney: { amount: "0.50", currencyCode: "USD" } },
                    },
                  },
                ],
              },
            },
          ],
        },
        transactions: {
          nodes: [
            {
              id: "gid://shopify/OrderTransaction/700",
              kind: "SALE",
              status: "SUCCESS",
              gateway: "shopify_payments",
              processedAt: "2026-03-29T13:02:00Z",
              amountSet: { shopMoney: { amount: "135.00", currencyCode: "USD" } },
            },
          ],
        },
      },
    });

    expect(mapped.order).toEqual(
      expect.objectContaining({
        orderId: "1001",
        customerId: "99",
        totalPrice: 135,
        totalRefunded: 15,
        orderCreatedDateLocal: "2026-03-29",
        orderUpdatedAt: "2026-03-30T02:00:00Z",
        orderUpdatedDateLocal: "2026-03-29",
        sourceSnapshotId: "snap_1",
      })
    );
    expect(mapped.orderLines).toHaveLength(1);
    expect(mapped.orderLines[0]).toEqual(
      expect.objectContaining({
        lineItemId: "1",
        productId: "10",
        variantId: "20",
        discountedTotal: 90,
      })
    );
    expect(mapped.refunds).toHaveLength(1);
    expect(mapped.refunds[0]).toEqual(
      expect.objectContaining({
        refundId: "500",
        refundedSales: 10,
        refundedShipping: 3,
        refundedTaxes: 2.5,
        totalRefunded: 15,
        refundedDateLocal: "2026-03-30",
      })
    );
    expect(mapped.transactions).toHaveLength(1);
    expect(mapped.transactions[0]).toEqual(
      expect.objectContaining({
        transactionId: "700",
        amount: 135,
        gateway: "shopify_payments",
      })
    );
  });

  it("maps returns into warehouse rows", () => {
    const mapped = mapShopifyReturnNodeToWarehouseRow({
      businessId: "biz_1",
      providerAccountId: "test-shop.myshopify.com",
      shopId: "test-shop.myshopify.com",
      sourceSnapshotId: "snap_2",
      timeZone: "America/New_York",
      node: {
        id: "gid://shopify/Return/2001",
        status: "OPEN",
        createdAt: "2026-03-31T12:00:00Z",
        updatedAt: "2026-03-31T13:00:00Z",
        order: { id: "gid://shopify/Order/1001" },
      },
    });

    expect(mapped).toEqual(
      expect.objectContaining({
        returnId: "2001",
        orderId: "1001",
        status: "OPEN",
        createdAt: "2026-03-31T12:00:00Z",
        createdDateLocal: "2026-03-31",
        updatedAt: "2026-03-31T13:00:00Z",
        updatedDateLocal: "2026-03-31",
        sourceSnapshotId: "snap_2",
      })
    );
  });
});
