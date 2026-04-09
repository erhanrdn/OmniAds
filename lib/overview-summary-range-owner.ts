import { readGoogleAdsDailyRange } from "@/lib/google-ads/warehouse";
import {
  materializeOverviewSummaryRangeFromGoogle,
  materializeOverviewSummaryRangeFromMeta,
} from "@/lib/overview-summary-materializer";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { getMetaAccountDailyRange } from "@/lib/meta/warehouse";

export type OverviewSummaryOwnerProvider = "meta" | "google";

function normalizeProviderAccountIds(values: string[] | null | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

async function resolveProviderAccountIds(input: {
  businessId: string;
  provider: OverviewSummaryOwnerProvider;
  providerAccountIds?: string[] | null;
}) {
  const explicit = normalizeProviderAccountIds(input.providerAccountIds);
  if (explicit.length > 0) {
    return explicit;
  }
  const assignmentProvider = input.provider === "google" ? "google" : "meta";
  const assignment = await getProviderAccountAssignments(input.businessId, assignmentProvider);
  return normalizeProviderAccountIds(assignment?.account_ids ?? []);
}

export async function materializeOverviewSummaryRangeForBusiness(input: {
  businessId: string;
  provider: OverviewSummaryOwnerProvider;
  startDate: string;
  endDate: string;
  providerAccountIds?: string[] | null;
}) {
  const providerAccountIds = await resolveProviderAccountIds(input);
  if (providerAccountIds.length === 0) {
    return {
      businessId: input.businessId,
      provider: input.provider,
      startDate: input.startDate,
      endDate: input.endDate,
      providerAccountIds,
      materialized: false,
      rowCount: 0,
      reason: "no_provider_accounts",
    };
  }

  if (input.provider === "meta") {
    const rows = await getMetaAccountDailyRange({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
      providerAccountIds,
      includeProvisional: false,
    });
    const materializedRows = await materializeOverviewSummaryRangeFromMeta({
      businessId: input.businessId,
      providerAccountIds,
      startDate: input.startDate,
      endDate: input.endDate,
      rows,
    });
    return {
      businessId: input.businessId,
      provider: input.provider,
      startDate: input.startDate,
      endDate: input.endDate,
      providerAccountIds,
      materialized: true,
      rowCount: materializedRows.length,
      reason: "ok",
    };
  }

  const rows = await readGoogleAdsDailyRange({
    scope: "account_daily",
    businessId: input.businessId,
    providerAccountIds,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  const materializedRows = await materializeOverviewSummaryRangeFromGoogle({
    businessId: input.businessId,
    providerAccountIds,
    startDate: input.startDate,
    endDate: input.endDate,
    rows,
  });
  return {
    businessId: input.businessId,
    provider: input.provider,
    startDate: input.startDate,
    endDate: input.endDate,
    providerAccountIds,
    materialized: true,
    rowCount: materializedRows.length,
    reason: "ok",
  };
}

