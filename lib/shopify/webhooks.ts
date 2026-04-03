import crypto from "node:crypto";
import { shopifyAdminGraphql } from "@/lib/shopify/admin";

export const SHOPIFY_SYNC_WEBHOOK_TOPICS = [
  "ORDERS_CREATE",
  "ORDERS_UPDATED",
  "ORDERS_CANCELLED",
  "REFUNDS_CREATE",
  "RETURNS_REQUEST",
  "RETURNS_APPROVE",
  "RETURNS_UPDATE",
  "RETURNS_PROCESS",
  "RETURNS_CLOSE",
  "RETURNS_REOPEN",
  "RETURNS_CANCEL",
  "RETURNS_DECLINE",
] as const;

export type ShopifySyncWebhookTopic = (typeof SHOPIFY_SYNC_WEBHOOK_TOPICS)[number];

function envNumber(name: string, fallback: number) {
  const parsed = Number(process.env[name] ?? String(fallback));
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export interface ShopifySyncWebhookRepairPolicy {
  supported: boolean;
  entity: "orders" | "refunds" | "returns" | "unknown";
  action: "create" | "update" | "cancel" | "ignore";
  shouldTriggerSync: boolean;
  recentWindowDays: number;
  eventTimestamp: string | null;
  eventAgeDays: number | null;
  windowExpanded: boolean;
  recentTargets: {
    orders: boolean;
    returns: boolean;
  };
  allowHistorical: boolean;
  triggerReason: string | null;
}

function buildReturnPolicy(action: ShopifySyncWebhookRepairPolicy["action"]) {
  return {
    supported: true,
    entity: "returns" as const,
    action,
    shouldTriggerSync: true,
    recentWindowDays: envNumber("SHOPIFY_WEBHOOK_RETURN_SYNC_DAYS", 14),
    eventTimestamp: null,
    eventAgeDays: null,
    windowExpanded: false,
    recentTargets: { orders: true, returns: true },
    allowHistorical: false,
    triggerReason: `webhook:returns:${action}`,
  };
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
        eventTimestamp: null,
        eventAgeDays: null,
        windowExpanded: false,
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
        eventTimestamp: null,
        eventAgeDays: null,
        windowExpanded: false,
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
        eventTimestamp: null,
        eventAgeDays: null,
        windowExpanded: false,
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
        eventTimestamp: null,
        eventAgeDays: null,
        windowExpanded: false,
        recentTargets: { orders: true, returns: true },
        allowHistorical: false,
        triggerReason: "webhook:refunds:create",
      };
    case "RETURNS_REQUEST":
      return buildReturnPolicy("create");
    case "RETURNS_APPROVE":
    case "RETURNS_UPDATE":
    case "RETURNS_PROCESS":
    case "RETURNS_CLOSE":
    case "RETURNS_REOPEN":
    case "RETURNS_CANCEL":
    case "RETURNS_DECLINE":
      return buildReturnPolicy("update");
    default:
      return {
        supported: false,
        entity: "unknown" as const,
        action: "ignore" as const,
        shouldTriggerSync: false,
        recentWindowDays: 0,
        eventTimestamp: null,
        eventAgeDays: null,
        windowExpanded: false,
        recentTargets: { orders: false, returns: false },
        allowHistorical: false,
        triggerReason: null,
      };
  }
}

function parseWebhookTimestamp(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

function resolveWebhookEventTimestamp(payload: unknown) {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  if (!record) return null;
  return (
    parseWebhookTimestamp(record.updated_at) ??
    parseWebhookTimestamp(record.processed_at) ??
    parseWebhookTimestamp(record.cancelled_at) ??
    parseWebhookTimestamp(record.created_at) ??
    parseWebhookTimestamp(record.closed_at) ??
    null
  );
}

function computeEventAgeDays(eventTimestamp: string, receivedAt: Date) {
  const ageMs = receivedAt.getTime() - new Date(eventTimestamp).getTime();
  if (!Number.isFinite(ageMs)) return null;
  if (ageMs <= 0) return 0;
  return Math.ceil(ageMs / 86_400_000);
}

export function resolveShopifySyncWebhookRepairPolicy(input: {
  topic: string | null | undefined;
  payload: unknown;
  receivedAt?: Date;
}) {
  const base = classifyShopifySyncWebhookTopic(input.topic);
  const receivedAt = input.receivedAt ?? new Date();
  const eventTimestamp = resolveWebhookEventTimestamp(input.payload);
  const eventAgeDays =
    eventTimestamp === null ? null : computeEventAgeDays(eventTimestamp, receivedAt);
  const maxWindowDays = envNumber("SHOPIFY_WEBHOOK_MAX_SYNC_DAYS", 30);
  const expandedRecentWindowDays =
    eventAgeDays === null ? base.recentWindowDays : Math.max(base.recentWindowDays, eventAgeDays + 1);

  return {
    ...base,
    eventTimestamp,
    eventAgeDays,
    recentWindowDays: Math.min(expandedRecentWindowDays, maxWindowDays),
    windowExpanded:
      eventAgeDays !== null &&
      Math.min(expandedRecentWindowDays, maxWindowDays) > base.recentWindowDays,
  } satisfies ShopifySyncWebhookRepairPolicy;
}

function getShopifyWebhookBaseUrl() {
  const base =
    process.env.SHOPIFY_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000";
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
  const verification = await verifyShopifySyncWebhooks(input);
  const created: string[] = [];
  for (const topic of verification.missingTopics) {
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
        callbackUrl: verification.callbackUrl,
      },
    });
    const error = payload.webhookSubscriptionCreate?.userErrors?.find((row) => row?.message)?.message;
    if (error) {
      throw new Error(error);
    }
    created.push(topic);
  }

  return {
    ...verification,
    created,
  };
}

export async function verifyShopifySyncWebhooks(input: {
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

  const desiredTopics = [...SHOPIFY_SYNC_WEBHOOK_TOPICS];
  const missingTopics = desiredTopics.filter((topic) => !existingTopics.has(topic));
  const extraTopics = [...existingTopics].filter((topic) => !desiredTopics.includes(topic as ShopifySyncWebhookTopic));
  return {
    callbackUrl,
    existingTopics: [...existingTopics],
    desiredTopics,
    missingTopics,
    extraTopics,
  };
}
