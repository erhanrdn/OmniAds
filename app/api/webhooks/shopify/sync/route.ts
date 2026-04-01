import { NextRequest, NextResponse } from "next/server";
import { verifyShopifyWebhook } from "@/lib/shopify/webhook-verification";

/**
 * POST /api/webhooks/shopify/sync
 *
 * Generic Shopify commerce sync webhook endpoint.
 * The first cut only verifies, logs, and acknowledges webhook delivery.
 * Incremental replay/reconciliation can later consume these events explicitly.
 */
export async function POST(request: NextRequest) {
  const result = await verifyShopifyWebhook(request);
  if (!result.valid) return result.response;

  const topic = request.headers.get("x-shopify-topic");
  const shopDomain = request.headers.get("x-shopify-shop-domain");
  const payload = JSON.parse(result.body);

  console.log("[shopify-webhook] sync received", {
    topic,
    shopDomain,
    orderId: payload.id ?? payload.admin_graphql_api_id ?? null,
  });

  return NextResponse.json({ received: true }, { status: 200 });
}
