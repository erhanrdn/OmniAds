import { shopifyAdminGraphql } from "@/lib/shopify/admin";

export const SHOPIFY_SYNC_WEBHOOK_TOPICS = [
  "ORDERS_CREATE",
  "ORDERS_UPDATED",
  "ORDERS_CANCELLED",
  "REFUNDS_CREATE",
] as const;

function getShopifyWebhookBaseUrl() {
  const base =
    process.env.SHOPIFY_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return base.replace(/\/$/, "");
}

export function buildShopifyWebhookCallbackUrl(pathname: string) {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${getShopifyWebhookBaseUrl()}${path}`;
}

interface ExistingWebhookPayload {
  webhookSubscriptions?: {
    nodes?: Array<{
      id?: string | null;
      topic?: string | null;
      endpoint?: {
        __typename?: string | null;
        callbackUrl?: string | null;
      } | null;
    }>;
  };
}

const LIST_WEBHOOKS_QUERY = `
  query ShopifyWebhookSubscriptions {
    webhookSubscriptions(first: 100) {
      nodes {
        id
        topic
        endpoint {
          __typename
          ... on WebhookHttpEndpoint {
            callbackUrl
          }
        }
      }
    }
  }
`;

const CREATE_WEBHOOK_MUTATION = `
  mutation ShopifyWebhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
    webhookSubscriptionCreate(
      topic: $topic
      webhookSubscription: {
        callbackUrl: $callbackUrl
        format: JSON
      }
    ) {
      userErrors {
        field
        message
      }
    }
  }
`;

export async function registerShopifySyncWebhooks(input: {
  shopId: string;
  accessToken: string;
}) {
  const callbackUrl = buildShopifyWebhookCallbackUrl("/api/webhooks/shopify/sync");
  const existing = await shopifyAdminGraphql<ExistingWebhookPayload>({
    shopId: input.shopId,
    accessToken: input.accessToken,
    query: LIST_WEBHOOKS_QUERY,
  }).catch(() => null);

  const existingTopics = new Set(
    (existing?.webhookSubscriptions?.nodes ?? [])
      .filter((node) => node?.endpoint?.__typename === "WebhookHttpEndpoint")
      .filter((node) => node?.endpoint?.callbackUrl === callbackUrl)
      .map((node) => node?.topic)
      .filter((topic): topic is string => Boolean(topic))
  );

  const created: string[] = [];
  for (const topic of SHOPIFY_SYNC_WEBHOOK_TOPICS) {
    if (existingTopics.has(topic)) continue;
    const payload = await shopifyAdminGraphql<{
      webhookSubscriptionCreate?: {
        userErrors?: Array<{ message?: string | null } | null> | null;
      } | null;
    }>({
      shopId: input.shopId,
      accessToken: input.accessToken,
      query: CREATE_WEBHOOK_MUTATION,
      variables: {
        topic,
        callbackUrl,
      },
    });
    const error = payload.webhookSubscriptionCreate?.userErrors?.find((row) => row?.message)?.message;
    if (error) {
      throw new Error(error);
    }
    created.push(topic);
  }

  return {
    callbackUrl,
    created,
    existingTopics: [...existingTopics],
    desiredTopics: [...SHOPIFY_SYNC_WEBHOOK_TOPICS],
  };
}
