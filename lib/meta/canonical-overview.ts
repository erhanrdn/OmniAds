import { getIntegration } from "@/lib/integrations";
import { getMetaLiveSummaryTotals } from "@/lib/meta/live";
import {
  getMetaPartialReason,
  getMetaRangePreparationContext,
} from "@/lib/meta/readiness";
import {
  getMetaWarehouseSummary,
  getMetaWarehouseTrends,
} from "@/lib/meta/serving";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { getMetaSelectedRangeTruthReadiness } from "@/lib/sync/meta-sync";

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

export type MetaCanonicalOverviewSummary = Awaited<
  ReturnType<typeof getMetaWarehouseSummary>
> & {
  isPartial: boolean;
  notReadyReason?: string | null;
  readSource: "warehouse" | "warehouse_plus_live_override";
};

export type MetaCanonicalOverviewTrends = Awaited<
  ReturnType<typeof getMetaWarehouseTrends>
> & {
  isPartial: boolean;
  notReadyReason?: string | null;
  readSource: "warehouse_published";
};

function canServeMetaHistoricalSummaryWhileFinalizePending(
  selectedRangeTruth:
    | Awaited<ReturnType<typeof getMetaSelectedRangeTruthReadiness>>
    | null
    | undefined,
) {
  if (!selectedRangeTruth) return false;
  if (selectedRangeTruth.completedCoreDays < selectedRangeTruth.totalDays) {
    return false;
  }
  return selectedRangeTruth.blockingReasons.every(
    (reason) => reason === "non_finalized",
  );
}

export async function getMetaCanonicalOverviewSummary(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<MetaCanonicalOverviewSummary> {
  const assignment = await getProviderAccountAssignments(input.businessId, "meta").catch(
    () => null,
  );
  const providerAccountIds = assignment?.account_ids ?? [];
  const [rangeContext, integration, warehouseSummary, selectedRangeTruth] = await Promise.all([
    getMetaRangePreparationContext(input),
    getIntegration(input.businessId, "meta").catch(() => null),
    getMetaWarehouseSummary({
      ...input,
      providerAccountIds,
    }),
    providerAccountIds.length > 0
      ? getMetaSelectedRangeTruthReadiness({
          businessId: input.businessId,
          startDate: input.startDate,
          endDate: input.endDate,
        }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const connected = integration?.status === "connected";
  if (rangeContext.isSelectedCurrentDay && connected) {
    try {
      const liveTotals = await getMetaLiveSummaryTotals({
        ...input,
        providerAccountIds,
      });
      if (liveTotals.spend > 0 || liveTotals.impressions > 0) {
        console.info("[meta-canonical] summary_read", {
          businessId: input.businessId,
          startDate: input.startDate,
          endDate: input.endDate,
          readSource: "warehouse_plus_live_override",
          isPartial: false,
          accountCount: warehouseSummary.accounts.length,
        });
        return {
          ...warehouseSummary,
          totals: liveTotals,
          isPartial: false,
          notReadyReason: null,
          readSource: "warehouse_plus_live_override",
        };
      }
    } catch (error: unknown) {
      console.warn("[meta-canonical] live_totals_failed", {
        businessId: input.businessId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const historicalServeableWhileFinalizePending =
    !rangeContext.isSelectedCurrentDay &&
    canServeMetaHistoricalSummaryWhileFinalizePending(selectedRangeTruth);

  const result = {
    ...warehouseSummary,
    isPartial:
      historicalServeableWhileFinalizePending
        ? false
        : Boolean(warehouseSummary.isPartial),
    notReadyReason:
      historicalServeableWhileFinalizePending
        ? null
        : warehouseSummary.isPartial
      ? getHistoricalVerificationReason({
          verificationState: warehouseSummary.verification?.verificationState ?? null,
          fallbackReason: getMetaPartialReason({
            isSelectedCurrentDay: rangeContext.isSelectedCurrentDay,
            currentDateInTimezone: rangeContext.currentDateInTimezone,
            primaryAccountTimezone: rangeContext.primaryAccountTimezone,
            defaultReason:
              "Warehouse data is still being prepared for the requested range.",
          }),
        })
        : null,
    readSource: "warehouse" as const,
  };
  console.info("[meta-canonical] summary_read", {
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    readSource: result.readSource,
    isPartial: result.isPartial,
    accountCount: result.accounts.length,
  });
  return result;
}

export async function getMetaCanonicalOverviewTrends(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<MetaCanonicalOverviewTrends> {
  const assignment = await getProviderAccountAssignments(input.businessId, "meta").catch(
    () => null,
  );
  const providerAccountIds = assignment?.account_ids ?? [];
  const [rangeContext, trends] = await Promise.all([
    getMetaRangePreparationContext(input),
    getMetaWarehouseTrends({
      ...input,
      providerAccountIds,
    }),
  ]);

  const result = {
    ...trends,
    isPartial: Boolean(trends.isPartial),
    notReadyReason: trends.isPartial
      ? getMetaPartialReason({
          isSelectedCurrentDay: rangeContext.isSelectedCurrentDay,
          currentDateInTimezone: rangeContext.currentDateInTimezone,
          primaryAccountTimezone: rangeContext.primaryAccountTimezone,
          defaultReason: "Trend data is still being prepared for the requested range.",
        })
      : null,
    readSource: "warehouse_published" as const,
  };
  console.info("[meta-canonical] trends_read", {
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    readSource: result.readSource,
    isPartial: result.isPartial,
    pointCount: result.points.length,
  });
  return result;
}
