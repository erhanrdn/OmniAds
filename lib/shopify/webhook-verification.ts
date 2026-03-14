import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { SHOPIFY_CONFIG } from "@/lib/oauth/shopify-config";

/**
 * Verify the HMAC signature on an incoming Shopify webhook request.
 *
 * Shopify signs every webhook POST with an `X-Shopify-Hmac-SHA256` header
 * computed as Base64(HMAC-SHA256(secret, rawBody)).
 *
 * Returns the raw body string if valid, or a 401 NextResponse if invalid.
 */
export async function verifyShopifyWebhook(
  request: NextRequest,
): Promise<
  { valid: true; body: string } | { valid: false; response: NextResponse }
> {
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");

  if (!hmacHeader) {
    return {
      valid: false,
      response: NextResponse.json(
        { error: "Missing X-Shopify-Hmac-SHA256 header." },
        { status: 401 },
      ),
    };
  }

  const rawBody = await request.text();

  const expectedHmac = crypto
    .createHmac("sha256", SHOPIFY_CONFIG.clientSecret)
    .update(rawBody, "utf8")
    .digest("base64");

  const hmacValid = crypto.timingSafeEqual(
    Buffer.from(hmacHeader, "base64"),
    Buffer.from(expectedHmac, "base64"),
  );

  if (!hmacValid) {
    console.error("[shopify-webhook] HMAC verification failed");
    return {
      valid: false,
      response: NextResponse.json(
        { error: "HMAC verification failed." },
        { status: 401 },
      ),
    };
  }

  return { valid: true, body: rawBody };
}
