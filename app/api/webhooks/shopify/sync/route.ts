import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import { syncShopifyCommerceReports } from "@/lib/sync/shopify-sync";
import { buildShopifyWebhookPayloadHash } from "@/lib/shopify/webhooks";
import { upsertShopifyWebhookDelivery } from "@/lib/shopify/warehouse";
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
  const webhookId = request.headers.get("x-shopify-webhook-id");
  const payload = JSON.parse(result.body);
  const payloadHash = buildShopifyWebhookPayloadHash({
    topic: topic ?? "unknown",
    shopDomain: shopDomain ?? "unknown",
    body: result.body,
  });

  await runMigrations();
  const sql = getDb();
  const integrationRows = shopDomain
    ? ((await sql`
        SELECT business_id, provider_account_id
        FROM integrations
        WHERE provider = 'shopify'
          AND status = 'connected'
          AND provider_account_id = ${shopDomain}
        LIMIT 1
      `) as Array<{ business_id: string; provider_account_id: string }>)
    : [];
  const match = integrationRows[0] ?? null;

  await upsertShopifyWebhookDelivery({
    businessId: match?.business_id ?? null,
    providerAccountId: match?.provider_account_id ?? null,
    topic: topic ?? "unknown",
    shopDomain: shopDomain ?? "unknown",
    webhookId,
    payloadHash,
    payloadJson: payload,
    receivedAt: new Date().toISOString(),
    processingState: match ? "received" : "ignored",
    resultSummary: match ? { matchedBusiness: match.business_id } : { ignored: true },
  }).catch(() => null);

  console.log("[shopify-webhook] sync received", {
    topic,
    shopDomain,
    orderId: payload.id ?? payload.admin_graphql_api_id ?? null,
  });

  if (!match) {
    return NextResponse.json({ received: true, ignored: true }, { status: 200 });
  }

  try {
    const syncResult = await syncShopifyCommerceReports(match.business_id);
    await upsertShopifyWebhookDelivery({
      businessId: match.business_id,
      providerAccountId: match.provider_account_id,
      topic: topic ?? "unknown",
      shopDomain: shopDomain ?? "unknown",
      webhookId,
      payloadHash,
      payloadJson: payload,
      processedAt: new Date().toISOString(),
      processingState: "processed",
      resultSummary:
        syncResult && typeof syncResult === "object"
          ? (syncResult as Record<string, unknown>)
          : { ok: true },
    }).catch(() => null);
  } catch (error) {
    await upsertShopifyWebhookDelivery({
      businessId: match.business_id,
      providerAccountId: match.provider_account_id,
      topic: topic ?? "unknown",
      shopDomain: shopDomain ?? "unknown",
      webhookId,
      payloadHash,
      payloadJson: payload,
      processedAt: new Date().toISOString(),
      processingState: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    }).catch(() => null);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
