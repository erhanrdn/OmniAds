import type { PlanId } from "@/lib/pricing/plans";
import { upsertSubscriptionRecord } from "@/lib/shopify/billing/checkSubscription";

export interface CreateSubscriptionInput {
  shopId: string;
  accessToken: string;
  planId: PlanId;
  returnUrl: string;
  test?: boolean;
}

export interface CreateSubscriptionResult {
  planId: PlanId;
  status: "active" | "pending";
  confirmationUrl: string | null;
}

const BILLING_API_VERSION = process.env.SHOPIFY_BILLING_API_VERSION ?? "2024-10";
const BILLING_CURRENCY = process.env.SHOPIFY_BILLING_CURRENCY ?? "USD";

const PLAN_DETAILS: Record<
  Exclude<PlanId, "starter">,
  { name: string; amount: number }
> = {
  growth: { name: "Growth", amount: 39 },
  pro: { name: "Pro", amount: 99 },
  scale: { name: "Scale", amount: 249 },
};

async function shopifyBillingMutation<T>(input: {
  shopId: string;
  accessToken: string;
  query: string;
  variables: Record<string, unknown>;
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
        variables: input.variables,
      }),
      cache: "no-store",
    }
  );

  const payload = (await res.json().catch(() => null)) as
    | {
        data?: T;
        errors?: Array<{ message?: string }>;
      }
    | null;

  if (!res.ok) {
    throw new Error(
      payload?.errors?.[0]?.message ??
        `Shopify billing mutation failed (${res.status}).`
    );
  }

  if (payload?.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? "Shopify billing error.");
  }

  if (!payload?.data) {
    throw new Error("Shopify billing response missing data.");
  }

  return payload.data;
}

export async function createSubscription(
  input: CreateSubscriptionInput
): Promise<CreateSubscriptionResult> {
  if (input.planId === "starter") {
    await upsertSubscriptionRecord({
      shopId: input.shopId,
      planId: "starter",
      status: "active",
    });
    return {
      planId: "starter",
      status: "active",
      confirmationUrl: null,
    };
  }

  const plan = PLAN_DETAILS[input.planId];
  const mutation = `
    mutation CreateAppSubscription(
      $name: String!,
      $returnUrl: URL!,
      $price: Decimal!,
      $currencyCode: CurrencyCode!,
      $test: Boolean!
    ) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        test: $test
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: $price, currencyCode: $currencyCode }
                interval: EVERY_30_DAYS
              }
            }
          }
        ]
      ) {
        confirmationUrl
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyBillingMutation<{
    appSubscriptionCreate?: {
      confirmationUrl?: string;
      userErrors?: Array<{ field?: string[]; message?: string }>;
    };
  }>({
    shopId: input.shopId,
    accessToken: input.accessToken,
    query: mutation,
    variables: {
      name: `Adsecute ${plan.name}`,
      returnUrl: input.returnUrl,
      price: plan.amount,
      currencyCode: BILLING_CURRENCY,
      test: input.test ?? process.env.NODE_ENV !== "production",
    },
  });

  const userErrors = data.appSubscriptionCreate?.userErrors ?? [];
  if (userErrors.length > 0) {
    throw new Error(
      userErrors[0]?.message ?? "Shopify subscription creation failed."
    );
  }

  const confirmationUrl = data.appSubscriptionCreate?.confirmationUrl ?? null;
  if (!confirmationUrl) {
    throw new Error("Shopify did not return a confirmation URL.");
  }

  await upsertSubscriptionRecord({
    shopId: input.shopId,
    planId: input.planId,
    status: "pending",
  });

  return {
    planId: input.planId,
    status: "pending",
    confirmationUrl,
  };
}

