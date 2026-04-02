import crypto from "node:crypto";
import { shopifyAdminGraphql } from "@/lib/shopify/admin";

export const SHOPIFY_SYNC_WEBHOOK_TOPICS = [
  "ORDERS_CREATE",
  "ORDERS_UPDATED",
  "ORDERS_CANCELLED",
  "REFUNDS_CREATE",
] as const;

export type ShopifySyncWebhookTopic = (typeof SHOPIFY_SYNC_WEBHOOK_TOPICS)[number];

function envNumber(name: string, fallback: number) {
  const parsed = Number(process.env[name] ?? String(fallback));
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export interface ShopifySyncWebhookRepairPolicy {
  supported: boolean;
  entity: "orders" | "refunds" | "unknown";
  action: "create" | "update" | "cancel" | "ignore";
  shouldTriggerSync: boolean;
  recentWindowDays: number;
  recentTargets: {
    orders: boolean;
    returns: boolean;
  };
  allowHistorical: boolean;
  triggerReason: string | null;
}

export function classifyShopifySyncWebhookTopic(
  topic: string | null | undefined
): ShopifySyncWebhookRepairPolicy {
  switch (topic) {
    case "ORDERS_CREATE":
      return {
        supported: true,
        entity: "orders" as const,
        action: "create" as const,
        shouldTriggerSync: true,
        recentWindowDays: envNumber("SHOPIFY_WEBHOOK_ORDER_SYNC_DAYS", 3),
        recentTargets: { orders: true, returns: false },
        allowHistorical: false,
        triggerReason: "webhook:orders:create",
      };
    case "ORDERS_UPDATED":
      return {
        supported: true,
        entity: "orders" as const,
        action: "update" as const,
        shouldTriggerSync: true,
        recentWindowDays: envNumber("SHOPIFY_WEBHOOK_ORDER_SYNC_DAYS", 3),
        recentTargets: { orders: true, returns: false },
        allowHistorical: false,
        triggerReason: "webhook:orders:update",
      };
    case "ORDERS_CANCELLED":
      return {
        supported: true,
        entity: "orders" as const,
        action: "cancel" as const,
        shouldTriggerSync: true,
        recentWindowDays: envNumber("SHOPIFY_WEBHOOK_ORDER_SYNC_DAYS", 3),
        recentTargets: { orders: true, returns: false },
        allowHistorical: false,
        triggerReason: "webhook:orders:cancel",
      };
    case "REFUNDS_CREATE":
      return {
        supported: true,
        entity: "refunds" as const,
        action: "create" as const,
        shouldTriggerSync: true,
        recentWindowDays: envNumber("SHOPIFY_WEBHOOK_REFUND_SYNC_DAYS", 14),
        recentTargets: { orders: true, returns: true },
        allowHistorical: false,
        triggerReason: "webhook:refunds:create",
      };
    default:
      return {
        supported: false,
        entity: "unknown" as const,
        action: "ignore" as const,
        shouldTriggerSync: false,
        recentWindowDays: 0,
        recentTargets: { orders: false, returns: false },
        allowHistorical: false,
        triggerReason: null,
      };
  }
}

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

export function buildShopifyWebhookPayloadHash(input: {
  topic: string;
  shopDomain: string;
  body: string;
}) {
  return crypto
    .createHash("sha1")
    .update(`${input.shopDomain}:${input.topic}:${input.body}`)
    .digest("hex");
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
