import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import { getDemoMetaBreakdowns } from "@/lib/demo-business";
import { getIntegration } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { getMetaBreakdownGuardrail } from "@/lib/meta/constraints";
import { getMetaPartialReason, getMetaRangePreparationContext } from "@/lib/meta/readiness";
import { getMetaWarehouseBreakdowns } from "@/lib/meta/serving";
import { getMetaSelectedRangeTruthReadiness } from "@/lib/sync/meta-sync";
import type { MetaBreakdownsResponse } from "@/app/api/meta/breakdowns/route";

export type MetaBreakdownsSourceResult = MetaBreakdownsResponse;

function getHistoricalVerificationReason(input: {
  verificationState?: string | null;
  fallbackReason: string;
}) {
  if (input.verificationState === "failed") {
    return "Historical Meta verification failed for the selected range. The last published truth remains active while repair is required.";
  }
  if (input.verificationState === "repair_required") {
    return "Historical Meta data requires repair before the selected range can be treated as finalized.";
  }
  return input.fallbackReason;
}

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function nDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

async function fetchAssignedAccountIds(businessId: string): Promise<string[]> {
  try {
    const readiness = await getDbSchemaReadiness({
      tables: ["provider_account_assignments"],
    });
    if (!readiness.ready) return [];
    const row = await getProviderAccountAssignments(businessId, "meta");
    return row?.account_ids ?? [];
  } catch {
    return [];
  }
}

function emptyBreakdowns(
  status: MetaBreakdownsResponse["status"],
  notReadyReason: string | null,
  isPartial: boolean,
): MetaBreakdownsResponse {
  return {
    status,
    age: [],
    location: [],
    placement: [],
    budget: { campaign: [], adset: [] },
    audience: {
      available: false,
      reason:
        "Audience Performance unavailable: no reliable audience-type dimension from current Meta account setup.",
    },
    products: {
      available: false,
      reason:
        "Top Products unavailable: product-level catalog breakdown is not available from current Meta insights endpoint/tokens.",
    },
    isPartial,
    notReadyReason,
  };
}

export async function getMetaBreakdownsForRange(input: {
  businessId: string;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<MetaBreakdownsSourceResult> {
  const resolvedStart = input.startDate ?? toISODate(nDaysAgo(29));
  const resolvedEnd = input.endDate ?? toISODate(new Date());

  if (await isDemoBusiness(input.businessId)) {
    return {
      ...getDemoMetaBreakdowns(),
      isPartial: false,
      notReadyReason: null,
    };
  }

  const integration = await getIntegration(input.businessId, "meta").catch(() => null);
  if (!integration || integration.status !== "connected") {
    return emptyBreakdowns(
      "no_connection",
      "Meta integration is not connected.",
      false,
    );
  }
  if (!integration.access_token) {
    return emptyBreakdowns(
      "no_access_token",
      "Meta access token is missing for this workspace.",
      false,
    );
  }

  const assignedAccountIds = await fetchAssignedAccountIds(input.businessId);
  if (assignedAccountIds.length === 0) {
    return emptyBreakdowns(
      "no_accounts_assigned",
      "No Meta ad account is assigned to this workspace.",
      false,
    );
  }

  const rangeContext = await getMetaRangePreparationContext({
    businessId: input.businessId,
    startDate: resolvedStart,
    endDate: resolvedEnd,
  });
  const breakdownGuardrail = getMetaBreakdownGuardrail({
    startDate: resolvedStart,
    endDate: resolvedEnd,
    referenceToday: rangeContext.currentDateInTimezone,
  });
  const historicalTruth =
    !rangeContext.isSelectedCurrentDay
      ? await getMetaSelectedRangeTruthReadiness({
          businessId: input.businessId,
          startDate: resolvedStart,
          endDate: resolvedEnd,
        }).catch(() => null)
      : null;

  try {
    const warehouse = await getMetaWarehouseBreakdowns({
      businessId: input.businessId,
      startDate: resolvedStart,
      endDate: resolvedEnd,
      providerAccountIds: assignedAccountIds,
    });
    const hasWarehouseRows =
      warehouse.age.length > 0 ||
      warehouse.location.length > 0 ||
      warehouse.placement.length > 0 ||
      warehouse.budget.campaign.length > 0 ||
      warehouse.budget.adset.length > 0;
    if (hasWarehouseRows) {
      return {
        status: "ok",
        age: warehouse.age,
        location: warehouse.location,
        placement: warehouse.placement,
        budget: warehouse.budget,
        audience: {
          available: false,
          reason:
            "Audience Performance unavailable: no reliable audience-type dimension from current Meta account setup.",
        },
        products: {
          available: false,
          reason:
            "Top Products unavailable: product-level catalog breakdown is not available from current Meta insights endpoint/tokens.",
        },
        isPartial: historicalTruth ? !historicalTruth.truthReady : false,
        notReadyReason:
          historicalTruth && !historicalTruth.truthReady
            ? getHistoricalVerificationReason({
                verificationState:
                  historicalTruth.verificationState ?? historicalTruth.state ?? null,
                fallbackReason:
                  "Breakdown warehouse data is still being prepared for the requested range.",
              })
            : null,
      };
    }
  } catch (error) {
    console.warn("[meta-breakdowns] warehouse_read_failed", {
      businessId: input.businessId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return emptyBreakdowns(
    "ok",
    breakdownGuardrail.message ??
      (historicalTruth
        ? historicalTruth.truthReady
          ? null
          : getHistoricalVerificationReason({
              verificationState:
                historicalTruth.verificationState ?? historicalTruth.state ?? null,
              fallbackReason: getMetaPartialReason({
                isSelectedCurrentDay: rangeContext.isSelectedCurrentDay,
                currentDateInTimezone: rangeContext.currentDateInTimezone,
                primaryAccountTimezone: rangeContext.primaryAccountTimezone,
                defaultReason:
                  "Breakdown warehouse data is still being prepared for the requested range.",
              }),
            })
        : getMetaPartialReason({
            isSelectedCurrentDay: rangeContext.isSelectedCurrentDay,
            currentDateInTimezone: rangeContext.currentDateInTimezone,
            primaryAccountTimezone: rangeContext.primaryAccountTimezone,
            defaultReason:
              "Breakdown warehouse data is still being prepared for the requested range.",
          })),
    historicalTruth ? !historicalTruth.truthReady : true,
  );
}
