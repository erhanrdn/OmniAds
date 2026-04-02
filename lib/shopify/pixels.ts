import { shopifyAdminGraphql } from "@/lib/shopify/admin";
import { buildShopifyWebhookCallbackUrl } from "@/lib/shopify/webhooks";

const WEB_PIXEL_CREATE_MUTATION = `
  mutation ShopifyWebPixelCreate($settings: JSON!) {
    webPixelCreate(webPixel: { settings: $settings }) {
      userErrors {
        field
        message
      }
      webPixel {
        id
      }
    }
  }
`;

export function buildShopifyCustomerEventsIngestUrl() {
  return buildShopifyWebhookCallbackUrl("/api/webhooks/shopify/customer-events");
}

export async function registerShopifyCustomerEventsPixel(input: {
  shopId: string;
  accessToken: string;
}) {
  const settings = JSON.stringify({
    endpoint: buildShopifyCustomerEventsIngestUrl(),
    authToken: process.env.SHOPIFY_CUSTOMER_EVENTS_SECRET?.trim() || null,
  });
  const payload = await shopifyAdminGraphql<{
    webPixelCreate?: {
      userErrors?: Array<{ message?: string | null } | null> | null;
      webPixel?: { id?: string | null } | null;
    } | null;
  }>({
    shopId: input.shopId,
    accessToken: input.accessToken,
    query: WEB_PIXEL_CREATE_MUTATION,
    variables: {
      settings,
    },
  });
  const error = payload.webPixelCreate?.userErrors?.find((row) => row?.message)?.message;
  if (error) throw new Error(error);
  return {
    endpoint: buildShopifyCustomerEventsIngestUrl(),
    pixelId: payload.webPixelCreate?.webPixel?.id ?? null,
  };
}
