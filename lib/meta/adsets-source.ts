import {
  hasUsableCurrentDaySnapshot,
  isMetaTodayLiveReadsEnabled,
  type CurrentDayWarehouseSnapshotFields,
} from "@/lib/current-day-snapshot";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getIntegration } from "@/lib/integrations";
import { resolveMetaCurrentDaySnapshot } from "@/lib/meta/current-day-snapshot";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { getMetaPartialReason, getMetaRangePreparationContext } from "@/lib/meta/readiness";
import { getMetaWarehouseAdSets } from "@/lib/meta/serving";
import { getMetaLiveAdSets } from "@/lib/meta/live";
import { getMetaSelectedRangeTruthReadiness } from "@/lib/sync/meta-sync";
import type { MetaAdSetData } from "@/lib/api/meta";
import { getDemoMetaAdSets } from "@/lib/demo-business";

export type MetaAdSetsSourceResult = {
  status?: "ok" | "not_connected";
  rows: MetaAdSetData[];
  isPartial?: boolean;
  notReadyReason?: string | null;
} & CurrentDayWarehouseSnapshotFields;

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

function buildCurrentDaySnapshotReason(input: {
  warehouseReadyThroughDate?: string | null;
  currentDateInTimezone: string | null;
  primaryAccountTimezone: string | null;
}) {
  if (input.warehouseReadyThroughDate) {
    const timezoneSuffix = input.primaryAccountTimezone
      ? ` (${input.primaryAccountTimezone})`
      : "";
    return `Showing the latest warehouse snapshot ready through ${input.warehouseReadyThroughDate} while Meta prepares ${input.currentDateInTimezone ?? "the current account day"}${timezoneSuffix}.`;
  }
  return getMetaPartialReason({
    isSelectedCurrentDay: true,
    currentDateInTimezone: input.currentDateInTimezone,
    primaryAccountTimezone: input.primaryAccountTimezone,
    defaultReason: "Ad set warehouse data is still being prepared for the requested range.",
  });
}

export async function getMetaAdSetsForRange(input: {
  businessId: string;
  campaignId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  includePrev?: boolean;
}): Promise<MetaAdSetsSourceResult> {
  const resolvedStart =
    input.startDate ?? new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const resolvedEnd =
    input.endDate ?? new Date().toISOString().slice(0, 10);

  if (await isDemoBusiness(input.businessId)) {
    return {
      status: "ok",
      rows: getDemoMetaAdSets(input.campaignId ?? null),
      isPartial: false,
      notReadyReason: null,
    };
  }

  const integration = await getIntegration(input.businessId, "meta").catch(() => null);
  const connected = integration?.status === "connected";
  const assignment = await getProviderAccountAssignments(input.businessId, "meta").catch(() => null);
  const providerAccountIds = assignment?.account_ids ?? [];
  const rangeContext = await getMetaRangePreparationContext({
    businessId: input.businessId,
    startDate: resolvedStart,
    endDate: resolvedEnd,
  });
  const historicalTruth =
    !rangeContext.isSelectedCurrentDay && connected
      ? await getMetaSelectedRangeTruthReadiness({
          businessId: input.businessId,
          startDate: resolvedStart,
          endDate: resolvedEnd,
        }).catch(() => null)
      : null;

  try {
    if (rangeContext.isSelectedCurrentDay && connected) {
      if (isMetaTodayLiveReadsEnabled()) {
        const liveRows = await getMetaLiveAdSets({
          businessId: input.businessId,
          campaignId: input.campaignId ?? null,
          startDate: resolvedStart,
          endDate: resolvedEnd,
          includePrev: input.includePrev,
        });
        if (liveRows.length > 0) {
          return {
            status: "ok",
            rows: liveRows,
            isPartial: false,
            notReadyReason: null,
          };
        }
      }

      const snapshot = await resolveMetaCurrentDaySnapshot({
        businessId: input.businessId,
        requestedDate: resolvedEnd,
        scope: "adsets",
      });
      if (!hasUsableCurrentDaySnapshot(snapshot)) {
        return {
          status: "ok",
          rows: [],
          isPartial: true,
          notReadyReason: buildCurrentDaySnapshotReason({
            warehouseReadyThroughDate: snapshot.warehouseReadyThroughDate,
            currentDateInTimezone: rangeContext.currentDateInTimezone,
            primaryAccountTimezone: rangeContext.primaryAccountTimezone,
          }),
          ...snapshot,
        };
      }

      const effectiveSnapshotDate = snapshot.effectiveEndDate!;
      const warehouseRows = await getMetaWarehouseAdSets({
        businessId: input.businessId,
        startDate: effectiveSnapshotDate,
        endDate: effectiveSnapshotDate,
        campaignId: input.campaignId,
        providerAccountIds,
        includePrev: input.includePrev,
      });
      return {
        status: "ok",
        rows: warehouseRows,
        isPartial: false,
        notReadyReason:
          snapshot.isStaleSnapshot
            ? buildCurrentDaySnapshotReason({
                warehouseReadyThroughDate: snapshot.warehouseReadyThroughDate,
                currentDateInTimezone: rangeContext.currentDateInTimezone,
                primaryAccountTimezone: rangeContext.primaryAccountTimezone,
              })
            : null,
        ...snapshot,
      };
    }

    const warehouseRows = await getMetaWarehouseAdSets({
      businessId: input.businessId,
      startDate: resolvedStart,
      endDate: resolvedEnd,
      campaignId: input.campaignId,
      providerAccountIds,
      includePrev: input.includePrev,
    });
    if (warehouseRows.length > 0) {
      return {
        status: "ok",
        rows: warehouseRows,
        isPartial: historicalTruth ? !historicalTruth.truthReady : false,
        notReadyReason:
          historicalTruth && !historicalTruth.truthReady
            ? getHistoricalVerificationReason({
                verificationState: historicalTruth.verificationState ?? historicalTruth.state ?? null,
                fallbackReason: "Ad set warehouse data is still being prepared for the requested range.",
              })
            : null,
      };
    }
  } catch (error) {
    console.warn("[meta-adsets] data_fetch_failed", {
      businessId: input.businessId,
      campaignId: input.campaignId ?? null,
      live: rangeContext.isSelectedCurrentDay,
      message: error instanceof Error ? error.message : String(error),
    });
    try {
      const warehouseRows = await getMetaWarehouseAdSets({
        businessId: input.businessId,
        startDate: resolvedStart,
        endDate: resolvedEnd,
        campaignId: input.campaignId,
        providerAccountIds,
        includePrev: input.includePrev,
      });
      if (warehouseRows.length > 0) {
        return {
          status: "ok",
          rows: warehouseRows,
          isPartial: historicalTruth ? !historicalTruth.truthReady : false,
          notReadyReason:
            historicalTruth && !historicalTruth.truthReady
              ? getHistoricalVerificationReason({
                  verificationState: historicalTruth.verificationState ?? historicalTruth.state ?? null,
                  fallbackReason: "Ad set warehouse data is still being prepared for the requested range.",
                })
              : null,
        };
      }
    } catch {
      // Fall through to the partial payload below.
    }
  }

  return {
    status: "ok",
    rows: [],
    isPartial: historicalTruth ? !historicalTruth.truthReady : true,
    notReadyReason: historicalTruth
      ? historicalTruth.truthReady
        ? null
        : getHistoricalVerificationReason({
            verificationState: historicalTruth.verificationState ?? historicalTruth.state ?? null,
            fallbackReason: getMetaPartialReason({
              isSelectedCurrentDay: rangeContext.isSelectedCurrentDay,
              currentDateInTimezone: rangeContext.currentDateInTimezone,
              primaryAccountTimezone: rangeContext.primaryAccountTimezone,
              defaultReason: "Ad set warehouse data is still being prepared for the requested range.",
            }),
          })
      : connected
        ? getMetaPartialReason({
            isSelectedCurrentDay: rangeContext.isSelectedCurrentDay,
            currentDateInTimezone: rangeContext.currentDateInTimezone,
            primaryAccountTimezone: rangeContext.primaryAccountTimezone,
            defaultReason: "Ad set warehouse data is still being prepared for the requested range.",
          })
        : "Meta integration is not connected. Historical warehouse data will appear here once available.",
    todayMode: undefined,
    requestedEndDate: undefined,
    effectiveEndDate: undefined,
    warehouseReadyThroughDate: undefined,
    lastWarehouseWriteAt: undefined,
    isStaleSnapshot: undefined,
  };
}
