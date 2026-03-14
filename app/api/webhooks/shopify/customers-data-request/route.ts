import { NextRequest, NextResponse } from "next/server";
import { verifyShopifyWebhook } from "@/lib/shopify/webhook-verification";

/**
 * POST /api/webhooks/shopify/customers-data-request
 *
 * Shopify mandatory compliance webhook: customers/data_request
 * Fired when a customer requests their data from a store.
 *
 * OmniAds stores integration-level data (per business), not individual
 * customer data, so we acknowledge the request and log it for audit.
 */
export async function POST(request: NextRequest) {
  const result = await verifyShopifyWebhook(request);
  if (!result.valid) return result.response;

  const payload = JSON.parse(result.body);

  console.log("[shopify-webhook] customers/data_request received", {
    shopDomain: payload.shop_domain,
    shopId: payload.shop_id,
    ordersRequested: payload.orders_requested?.length ?? 0,
    customerId: payload.customer?.id,
  });

  // OmniAds does not store individual customer PII — acknowledge the request.
  return NextResponse.json({ received: true }, { status: 200 });
}
