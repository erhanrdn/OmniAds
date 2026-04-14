import { NextRequest, NextResponse } from "next/server";
import { verifyShopifyWebhook } from "@/lib/shopify/webhook-verification";
import { getDb } from "@/lib/db";
import { logRuntimeDebug } from "@/lib/runtime-logging";

/**
 * POST /api/webhooks/shopify/shop-redact
 *
 * Shopify mandatory compliance webhook: shop/redact
 * Fired 48 hours after a store uninstalls the app, requesting deletion
 * of all data associated with that store.
 *
 * Deletes the Shopify integration record and any related subscription
 * records from the database.
 */
export async function POST(request: NextRequest) {
  const result = await verifyShopifyWebhook(request);
  if (!result.valid) return result.response;

  const payload = JSON.parse(result.body);
  const shopDomain: string | undefined = payload.shop_domain;
  const shopId: string | undefined = payload.shop_id?.toString();

  logRuntimeDebug("shopify-webhook", "shop_redact_received", {
    shopDomain,
    shopId,
  });

  if (!shopDomain) {
    return NextResponse.json(
      { error: "Missing shop_domain in payload." },
      { status: 400 },
    );
  }

  const sql = getDb();

  // Delete integration records for this Shopify shop across all businesses
  const deleted = (await sql`
    DELETE FROM integrations
    WHERE provider = 'shopify'
      AND provider_account_id = ${shopDomain}
    RETURNING business_id
  `) as Record<string, unknown>[];

  // Delete related Shopify subscription records
  await sql`
    DELETE FROM shopify_subscriptions
    WHERE shop_id = ${shopDomain}
  `;

  logRuntimeDebug("shopify-webhook", "shop_redact_completed", {
    shopDomain,
    deletedIntegrations: deleted.length,
  });

  return NextResponse.json({ received: true }, { status: 200 });
}
