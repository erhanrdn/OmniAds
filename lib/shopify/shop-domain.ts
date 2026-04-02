const SHOPIFY_SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export function normalizeShopifyShopDomain(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return SHOPIFY_SHOP_DOMAIN_PATTERN.test(normalized) ? normalized : null;
}

export function isValidShopifyShopDomain(value: string | null | undefined) {
  return normalizeShopifyShopDomain(value) !== null;
}
