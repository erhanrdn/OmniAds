import {
  hasUsableCurrentDaySnapshot,
  isMetaTodayLiveReadsEnabled,
  type CurrentDayWarehouseSnapshotFields,
} from "@/lib/current-day-snapshot";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import { getDemoMetaCampaigns } from "@/lib/demo-business";
import { getIntegration } from "@/lib/integrations";
import { resolveMetaCurrentDaySnapshot } from "@/lib/meta/current-day-snapshot";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { getMetaLiveCampaignRows } from "@/lib/meta/live";
import { getMetaPartialReason, getMetaRangePreparationContext } from "@/lib/meta/readiness";
import { getMetaWarehouseCampaignTable } from "@/lib/meta/serving";
import { getMetaSelectedRangeTruthReadiness } from "@/lib/sync/meta-sync";
import type { MetaCampaignRow } from "@/app/api/meta/campaigns/route";

export type MetaCampaignsSourceResult = {
  status?: "ok" | "no_accounts_assigned" | "account_not_assigned" | "not_connected";
  rows: MetaCampaignRow[];
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

function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function nDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
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
    defaultReason: "Campaign warehouse data is still being prepared for the requested range.",
  });
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

export async function getMetaCampaignsForRange(input: {
  businessId: string;
  startDate?: string | null;
  endDate?: string | null;
  accountId?: string | null;
  includePrev?: boolean;
}): Promise<MetaCampaignsSourceResult> {
  if (await isDemoBusiness(input.businessId)) {
    return {
      status: "ok",
      rows: getDemoMetaCampaigns().rows as MetaCampaignRow[],
      isPartial: false,
      notReadyReason: null,
    };
  }

  const resolvedStart = input.startDate ?? toISODate(nDaysAgo(29));
  const resolvedEnd = input.endDate ?? toISODate(new Date());
  const assignedAccountIds = await fetchAssignedAccountIds(input.businessId);
  if (assignedAccountIds.length === 0) {
    return {
      status: "no_accounts_assigned",
      rows: [],
      isPartial: false,
      notReadyReason: "No Meta ad account is assigned to this workspace.",
    };
  }

  const targetAccountIds =
    input.accountId && input.accountId !== "all"
      ? assignedAccountIds.filter((accountId) => accountId === input.accountId)
      : assignedAccountIds;
  if (targetAccountIds.length === 0) {
    return {
      status: "account_not_assigned",
      rows: [],
      isPartial: false,
      notReadyReason:
        "The requested Meta ad account is not assigned to this workspace.",
    };
  }

  const integration = await getIntegration(input.businessId, "meta").catch(() => null);
  const connected = integration?.status === "connected";
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

  let rows: MetaCampaignRow[] = [];
  try {
    if (rangeContext.isSelectedCurrentDay && connected) {
      if (isMetaTodayLiveReadsEnabled()) {
        rows = await getMetaLiveCampaignRows({
          businessId: input.businessId,
          startDate: resolvedStart,
          endDate: resolvedEnd,
          providerAccountIds: targetAccountIds,
          includePrev: input.includePrev,
        });
        if (rows.length > 0) {
          return {
            status: "ok",
            rows,
            isPartial: historicalTruth ? !historicalTruth.truthReady : false,
            notReadyReason:
              historicalTruth && !historicalTruth.truthReady
                ? getHistoricalVerificationReason({
                    verificationState:
                      historicalTruth.verificationState ??
                      historicalTruth.state ??
                      null,
                    fallbackReason:
                      "Campaign warehouse data is still being prepared for the requested range.",
                  })
                : null,
          };
        }
      }

      const snapshot = await resolveMetaCurrentDaySnapshot({
        businessId: input.businessId,
        requestedDate: resolvedEnd,
        scope: "campaigns",
      });
      if (!hasUsableCurrentDaySnapshot(snapshot)) {
        return {
          status: "ok",
          rows: [],
          isPartial: true,
          notReadyReason:
            buildCurrentDaySnapshotReason({
              warehouseReadyThroughDate: snapshot.warehouseReadyThroughDate,
              currentDateInTimezone: rangeContext.currentDateInTimezone,
              primaryAccountTimezone: rangeContext.primaryAccountTimezone,
            }),
          ...snapshot,
        };
      }

      const effectiveSnapshotDate = snapshot.effectiveEndDate!;
      rows = (await getMetaWarehouseCampaignTable({
        businessId: input.businessId,
        startDate: effectiveSnapshotDate,
        endDate: effectiveSnapshotDate,
        providerAccountIds: targetAccountIds,
        includePrev: input.includePrev,
      })) as MetaCampaignRow[];
      return {
        status: "ok",
        rows,
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

    rows = (await getMetaWarehouseCampaignTable({
      businessId: input.businessId,
      startDate: resolvedStart,
      endDate: resolvedEnd,
      providerAccountIds: targetAccountIds,
      includePrev: input.includePrev,
    })) as MetaCampaignRow[];
  } catch (error) {
    console.warn("[meta-campaigns] data_fetch_failed", {
      businessId: input.businessId,
      live: rangeContext.isSelectedCurrentDay,
      message: error instanceof Error ? error.message : String(error),
    });
    try {
      rows = (await getMetaWarehouseCampaignTable({
        businessId: input.businessId,
        startDate: resolvedStart,
        endDate: resolvedEnd,
        providerAccountIds: targetAccountIds,
        includePrev: input.includePrev,
      })) as MetaCampaignRow[];
    } catch {
      rows = [];
    }
  }

  return {
    status: "ok",
    rows,
    isPartial: historicalTruth ? !historicalTruth.truthReady : rows.length === 0,
    notReadyReason:
      historicalTruth
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
                  "Campaign warehouse data is still being prepared for the requested range.",
              }),
            })
        : rows.length === 0
          ? connected
            ? getMetaPartialReason({
                isSelectedCurrentDay: rangeContext.isSelectedCurrentDay,
                currentDateInTimezone: rangeContext.currentDateInTimezone,
                primaryAccountTimezone: rangeContext.primaryAccountTimezone,
                defaultReason:
                  "Campaign warehouse data is still being prepared for the requested range.",
              })
            : "Meta integration is not connected. Historical warehouse data will appear here once available."
          : null,
    todayMode: undefined,
    requestedEndDate: undefined,
    effectiveEndDate: undefined,
    warehouseReadyThroughDate: undefined,
    lastWarehouseWriteAt: undefined,
    isStaleSnapshot: undefined,
  };
}
