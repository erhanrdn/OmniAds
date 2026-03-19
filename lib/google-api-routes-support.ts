import { NextResponse } from "next/server";
import { executeGaqlQuery } from "@/lib/google-ads-gaql";

export function requireBusinessIdJson(businessId: string | null) {
  if (businessId) return null;
  return NextResponse.json({ error: "businessId is required" }, { status: 400 });
}

export function resolveGoogleAccountsToQuery(
  assignedAccounts: string[],
  accountId: string | null
) {
  return accountId && accountId !== "all" ? [accountId] : assignedAccounts;
}

export async function executeGoogleQueries(params: {
  businessId: string;
  customerIds: string[];
  buildQuery: (customerId: string) => string;
  errorLabel: string;
}) {
  const { businessId, customerIds, buildQuery, errorLabel } = params;

  return Promise.all(
    customerIds.map((customerId) =>
      executeGaqlQuery({
        businessId,
        customerId,
        query: buildQuery(customerId),
      }).catch((error) => {
        console.error(`[${errorLabel}] Query failed for account ${customerId}:`, error);
        return { results: [] };
      })
    )
  );
}

export function uniqueByKey<T>(items: T[], getKey: (item: T) => string) {
  return Array.from(new Map(items.map((item) => [getKey(item), item])).values());
}
