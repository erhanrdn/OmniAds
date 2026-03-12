import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import type { PlanId } from "@/lib/pricing/plans";

export type ShopifyPlanName = "Starter" | "Growth" | "Pro" | "Scale";
export type ShopifyBillingCycle = "monthly";

export interface StoredSubscription {
  id: string;
  shopId: string;
  planId: PlanId;
  status: string;
  billingCycle: ShopifyBillingCycle;
  createdAt: string;
}

interface ShopifyGraphqlSubscription {
  id: string;
  name: string;
  status: string;
  test: boolean;
  lineItems: Array<{
    plan: {
      pricingDetails?: {
        __typename?: string;
        interval?: string;
        price?: {
          amount?: string;
          currencyCode?: string;
        };
      };
    };
  }>;
}

const BILLING_API_VERSION = process.env.SHOPIFY_BILLING_API_VERSION ?? "2024-10";

const PLAN_PRICE_TO_ID: Record<string, PlanId> = {
  "39": "growth",
  "99": "pro",
  "249": "scale",
};

function normalizeAmount(raw: string | undefined): string | null {
  if (!raw) return null;
  const amount = Number.parseFloat(raw);
  if (!Number.isFinite(amount)) return null;
  return String(Math.round(amount));
}

function inferPlanIdFromSubscription(subscription: ShopifyGraphqlSubscription): PlanId {
  const lowerName = subscription.name.toLowerCase();
  if (lowerName.includes("scale")) return "scale";
  if (lowerName.includes("pro")) return "pro";
  if (lowerName.includes("growth")) return "growth";

  const priceAmount =
    normalizeAmount(
      subscription.lineItems?.[0]?.plan?.pricingDetails?.price?.amount
    ) ?? null;

  if (priceAmount && PLAN_PRICE_TO_ID[priceAmount]) {
    return PLAN_PRICE_TO_ID[priceAmount];
  }

  return "starter";
}

async function shopifyAdminGraphql<T>(input: {
  shopId: string;
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
}): Promise<T> {
  const res = await fetch(
    `https://${input.shopId}/admin/api/${BILLING_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": input.accessToken,
      },
      body: JSON.stringify({
        query: input.query,
        variables: input.variables ?? {},
      }),
      cache: "no-store",
    }
  );

  const payload = (await res.json().catch(() => null)) as
    | { data?: T; errors?: Array<{ message?: string }> }
    | null;

  if (!res.ok) {
    throw new Error(
      payload?.errors?.[0]?.message ??
        `Shopify billing query failed (${res.status}).`
    );
  }

  if (payload?.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? "Shopify GraphQL error.");
  }

  if (!payload?.data) {
    throw new Error("Shopify GraphQL response missing data.");
  }

  return payload.data;
}

export async function upsertSubscriptionRecord(input: {
  shopId: string;
  planId: PlanId;
  status: string;
  billingCycle?: ShopifyBillingCycle;
}): Promise<StoredSubscription> {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    INSERT INTO shopify_subscriptions (
      shop_id, plan_id, status, billing_cycle
    ) VALUES (
      ${input.shopId},
      ${input.planId},
      ${input.status},
      ${input.billingCycle ?? "monthly"}
    )
    ON CONFLICT (shop_id) DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      status = EXCLUDED.status,
      billing_cycle = EXCLUDED.billing_cycle,
      updated_at = now()
    RETURNING id, shop_id, plan_id, status, billing_cycle, created_at
  `;
  const row = rows[0] as {
    id: string;
    shop_id: string;
    plan_id: PlanId;
    status: string;
    billing_cycle: ShopifyBillingCycle;
    created_at: string;
  };
  return {
    id: row.id,
    shopId: row.shop_id,
    planId: row.plan_id,
    status: row.status,
    billingCycle: row.billing_cycle,
    createdAt: row.created_at,
  };
}

export async function getCurrentPlan(shopId: string): Promise<PlanId> {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT plan_id, status
    FROM shopify_subscriptions
    WHERE shop_id = ${shopId}
    LIMIT 1
  `;
  const row = rows[0] as { plan_id?: PlanId; status?: string } | undefined;
  if (!row || row.status !== "active") return "starter";
  return row.plan_id ?? "starter";
}

export async function checkSubscription(input: {
  shopId: string;
  accessToken: string;
}): Promise<{
  planId: PlanId;
  status: string;
  source: "shopify" | "database" | "default";
}> {
  const query = `
    query CurrentAppInstallationSubscriptions {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          test
          lineItems {
            plan {
              ... on AppRecurringPricing {
                pricingDetails {
                  __typename
                  ... on AppRecurringPricingDetails {
                    interval
                    price {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const data = await shopifyAdminGraphql<{
      currentAppInstallation?: {
        activeSubscriptions?: ShopifyGraphqlSubscription[];
      };
    }>({
      shopId: input.shopId,
      accessToken: input.accessToken,
      query,
    });

    const active = data.currentAppInstallation?.activeSubscriptions ?? [];
    if (active.length === 0) {
      await upsertSubscriptionRecord({
        shopId: input.shopId,
        planId: "starter",
        status: "active",
      });
      return { planId: "starter", status: "active", source: "shopify" };
    }

    const primary = active[0];
    const planId = inferPlanIdFromSubscription(primary);
    const status = primary.status?.toLowerCase() || "active";
    await upsertSubscriptionRecord({
      shopId: input.shopId,
      planId,
      status,
    });
    return { planId, status, source: "shopify" };
  } catch {
    const dbPlan = await getCurrentPlan(input.shopId);
    if (dbPlan !== "starter") {
      return { planId: dbPlan, status: "active", source: "database" };
    }
    return { planId: "starter", status: "active", source: "default" };
  }
}

