import { NextRequest, NextResponse } from "next/server";

/**
 * Legacy Shopify start route.
 *
 * Shopify installs must begin on Shopify-owned surfaces, not with a manually entered
 * shop domain inside Adsecute. Keep this route as a friendly fallback only.
 */
export async function GET(request: NextRequest) {
  const redirectUrl = new URL("/shopify/connect", request.nextUrl.origin);
  return NextResponse.redirect(redirectUrl.toString());
}
