import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

function normalizeEventType(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function isOneOf(value: string, allowed: string[]) {
  return allowed.includes(value);
}

export function classifyShopifyCustomerEventType(value: string | null | undefined) {
  const normalized = normalizeEventType(value);
  if (isOneOf(normalized, ["page_viewed", "page_view", "pageview"])) return "page_view";
  if (isOneOf(normalized, ["product_viewed", "product_view", "view_item"])) return "product_view";
  if (isOneOf(normalized, ["add_to_cart", "addtocart"])) return "add_to_cart";
  if (isOneOf(normalized, ["begin_checkout", "checkout_started"])) return "begin_checkout";
  if (isOneOf(normalized, ["purchase", "checkout_completed"])) return "purchase";
  return "other";
}

export interface ShopifyCustomerEventsDailyAggregate {
  date: string;
  sessions: number;
  pageViews: number;
  productViews: number;
  addToCart: number;
  beginCheckout: number;
  purchases: number;
}

export interface ShopifyCustomerEventsAggregate {
  sessions: number;
  pageViews: number;
  productViews: number;
  addToCart: number;
  beginCheckout: number;
  purchases: number;
  daily: ShopifyCustomerEventsDailyAggregate[];
}

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getShopifyCustomerEventsAggregate(input: {
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = (await sql`
    SELECT
      occurred_at::date::text AS date,
      COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL AND session_id <> '') AS sessions,
      COUNT(*) FILTER (
        WHERE lower(event_type) IN ('page_viewed', 'page_view', 'pageview')
      ) AS page_views,
      COUNT(*) FILTER (
        WHERE lower(event_type) IN ('product_viewed', 'product_view', 'view_item')
      ) AS product_views,
      COUNT(*) FILTER (
        WHERE lower(event_type) IN ('add_to_cart', 'addtocart')
      ) AS add_to_cart,
      COUNT(*) FILTER (
        WHERE lower(event_type) IN ('begin_checkout', 'checkout_started')
      ) AS begin_checkout,
      COUNT(*) FILTER (
        WHERE lower(event_type) IN ('purchase', 'checkout_completed')
      ) AS purchases
    FROM shopify_customer_events
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND occurred_at::date >= ${input.startDate}::date
      AND occurred_at::date <= ${input.endDate}::date
    GROUP BY 1
    ORDER BY 1 ASC
  `) as Array<Record<string, unknown>>;

  const daily = rows.map((row) => ({
    date: String(row.date ?? ""),
    sessions: Math.trunc(toNumber(row.sessions)),
    pageViews: Math.trunc(toNumber(row.page_views)),
    productViews: Math.trunc(toNumber(row.product_views)),
    addToCart: Math.trunc(toNumber(row.add_to_cart)),
    beginCheckout: Math.trunc(toNumber(row.begin_checkout)),
    purchases: Math.trunc(toNumber(row.purchases)),
  })) satisfies ShopifyCustomerEventsDailyAggregate[];

  return {
    sessions: daily.reduce((sum, row) => sum + row.sessions, 0),
    pageViews: daily.reduce((sum, row) => sum + row.pageViews, 0),
    productViews: daily.reduce((sum, row) => sum + row.productViews, 0),
    addToCart: daily.reduce((sum, row) => sum + row.addToCart, 0),
    beginCheckout: daily.reduce((sum, row) => sum + row.beginCheckout, 0),
    purchases: daily.reduce((sum, row) => sum + row.purchases, 0),
    daily,
  } satisfies ShopifyCustomerEventsAggregate;
}
