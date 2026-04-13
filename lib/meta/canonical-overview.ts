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

function getHistoricalVerificationReason(input: {
  verificationState?: string | null;
  fallbackReason: string;
}) {
  if (input.verificationState === "blocked") {
    return "Historical Meta publication is blocked because finalized work does not match the required published truth.";
  }
  if (input.verificationState === "failed") {
    return "Historical Meta verification failed for the selected range. The last published truth remains active while repair is required.";
  }
  if (input.verificationState === "repair_required") {
    return "Historical Meta data requires a fresh authoritative retry before the selected range can be treated as finalized.";
  }
  return input.fallbackReason;
}

export type MetaCanonicalOverviewSummary = Awaited<
  ReturnType<typeof getMetaWarehouseSummary>
> & {
  isPartial: boolean;
  notReadyReason?: string | null;
  readSource:
    | "warehouse_published"
    | "current_day_live"
    | "live_historical_fallback";
};

export type MetaCanonicalOverviewTrends = Awaited<
  ReturnType<typeof getMetaWarehouseTrends>
> & {
  isPartial: boolean;
  notReadyReason?: string | null;
  readSource: "warehouse_published";
};

export async function getMetaCanonicalOverviewSummary(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<MetaCanonicalOverviewSummary> {
  const [assignment, rangeContext, integration] = await Promise.all([
    getProviderAccountAssignments(input.businessId, "meta").catch(() => null),
    getMetaRangePreparationContext(input),
    getIntegration(input.businessId, "meta").catch(() => null),
  ]);
  const providerAccountIds = assignment?.account_ids ?? [];
  const warehouseSummary = await getMetaWarehouseSummary({
    ...input,
    providerAccountIds,
  });

  const connected = integration?.status === "connected";
  if (rangeContext.isSelectedCurrentDay && connected) {
    try {
      const liveTotals = await getMetaLiveSummaryTotals({
        ...input,
        providerAccountIds,
      });
      console.info("[meta-canonical] summary_read", {
        businessId: input.businessId,
        startDate: input.startDate,
        endDate: input.endDate,
        readSource: "current_day_live",
        isPartial: liveTotals.spend <= 0 && liveTotals.impressions <= 0,
        accountCount: 0,
      });
      return {
        ...warehouseSummary,
        totals: liveTotals,
        accounts: [],
        isPartial: liveTotals.spend <= 0 && liveTotals.impressions <= 0,
        notReadyReason:
          liveTotals.spend <= 0 && liveTotals.impressions <= 0
            ? getMetaPartialReason({
                isSelectedCurrentDay: true,
                currentDateInTimezone: rangeContext.currentDateInTimezone,
                primaryAccountTimezone: rangeContext.primaryAccountTimezone,
                defaultReason:
                  "Current-day live Meta totals are still being prepared.",
              })
            : null,
        readSource: "current_day_live",
      };
    } catch (error: unknown) {
      console.warn("[meta-canonical] live_totals_failed", {
        businessId: input.businessId,
        message: error instanceof Error ? error.message : String(error),
      });
      console.info("[meta-canonical] summary_read", {
        businessId: input.businessId,
        startDate: input.startDate,
        endDate: input.endDate,
        readSource: "current_day_live",
        isPartial: true,
        accountCount: 0,
      });
      return {
        ...warehouseSummary,
        totals: {
          spend: 0,
          revenue: 0,
          conversions: 0,
          roas: 0,
          cpa: null,
          ctr: null,
          cpc: null,
          impressions: 0,
          clicks: 0,
          reach: 0,
        },
        accounts: [],
        isPartial: true,
        notReadyReason: getMetaPartialReason({
          isSelectedCurrentDay: true,
          currentDateInTimezone: rangeContext.currentDateInTimezone,
          primaryAccountTimezone: rangeContext.primaryAccountTimezone,
          defaultReason: "Current-day live Meta totals are still being prepared.",
        }),
        readSource: "current_day_live",
      };
    }
  }
  if (
    rangeContext.historicalReadMode === "historical_live_fallback" &&
    connected &&
    providerAccountIds.length > 0
  ) {
    try {
      const liveTotals = await getMetaLiveSummaryTotals({
        ...input,
        providerAccountIds,
      });
      console.info("[meta-canonical] summary_read", {
        businessId: input.businessId,
        startDate: input.startDate,
        endDate: input.endDate,
        readSource: "live_historical_fallback",
        isPartial: false,
        accountCount: warehouseSummary.accounts.length,
      });
      return {
        ...warehouseSummary,
        totals: liveTotals,
        isPartial: false,
        notReadyReason: null,
        readSource: "live_historical_fallback",
      };
    } catch (error: unknown) {
      console.warn("[meta-canonical] live_historical_totals_failed", {
        businessId: input.businessId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const result = {
    ...warehouseSummary,
    isPartial: Boolean(warehouseSummary.isPartial),
    notReadyReason:
      warehouseSummary.isPartial
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
    readSource: "warehouse_published" as const,
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
