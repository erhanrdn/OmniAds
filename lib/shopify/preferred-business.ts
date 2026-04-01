const SHOPIFY_PREFERRED_BUSINESS_IDS: Record<string, string> = {
  "vitahome-design.myshopify.com": "5dbc7147-f051-4681-a4d6-20617170074f",
};

function normalizeShopDomain(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function getPreferredBusinessIdForShopifyShop(
  shopDomain: string | null | undefined,
) {
  const normalizedShopDomain = normalizeShopDomain(shopDomain);
  return SHOPIFY_PREFERRED_BUSINESS_IDS[normalizedShopDomain] ?? null;
}
