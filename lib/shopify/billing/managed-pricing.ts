function getShopifyAppHandle() {
  return process.env.SHOPIFY_APP_HANDLE?.trim() || "adsecute";
}

export function getShopifyStoreHandle(shopDomain: string): string | null {
  const normalized = shopDomain.trim().toLowerCase();
  if (!normalized.endsWith(".myshopify.com")) return null;
  const handle = normalized.replace(/\.myshopify\.com$/, "");
  return handle || null;
}

export function getManagedPricingUrl(shopDomain: string): string | null {
  const storeHandle = getShopifyStoreHandle(shopDomain);
  if (!storeHandle) return null;

  return `https://admin.shopify.com/store/${storeHandle}/charges/${getShopifyAppHandle()}/pricing_plans`;
}
