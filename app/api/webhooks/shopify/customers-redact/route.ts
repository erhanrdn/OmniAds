import { NextRequest, NextResponse } from "next/server";
import { verifyShopifyWebhook } from "@/lib/shopify/webhook-verification";

/**
 * POST /api/webhooks/shopify/customers-redact
 *
 * Shopify mandatory compliance webhook: customers/redact
 * Fired when a store owner requests deletion of a customer's data.
 *
 * OmniAds stores integration-level data (per business), not individual
 * customer PII, so we acknowledge and log the request for audit.
 */
export async function POST(request: NextRequest) {
  const result = await verifyShopifyWebhook(request);
  if (!result.valid) return result.response;

  const payload = JSON.parse(result.body);

  console.log("[shopify-webhook] customers/redact received", {
    shopDomain: payload.shop_domain,
    shopId: payload.shop_id,
    customerId: payload.customer?.id,
    ordersToRedact: payload.orders_to_redact?.length ?? 0,
  });

  // OmniAds does not store individual customer PII — acknowledge the request.
  return NextResponse.json({ received: true }, { status: 200 });
}
