import {
  hasUsableCurrentDaySnapshot,
  isMetaTodayLiveReadsEnabled,
  type CurrentDayWarehouseSnapshotFields,
} from "@/lib/current-day-snapshot";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import { getDemoMetaBreakdowns } from "@/lib/demo-business";
import { getIntegration } from "@/lib/integrations";
import { resolveMetaCurrentDaySnapshot } from "@/lib/meta/current-day-snapshot";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { getMetaBreakdownGuardrail } from "@/lib/meta/constraints";
import { getMetaPartialReason, getMetaRangePreparationContext } from "@/lib/meta/readiness";
import {
  getMetaWarehouseBreakdowns,
  getMetaWarehouseCountryBreakdowns,
  type MetaWarehouseCountryBreakdownsResponse,
} from "@/lib/meta/serving";
import { getMetaSelectedRangeTruthReadiness } from "@/lib/sync/meta-sync";
import type { MetaBreakdownsResponse } from "@/app/api/meta/breakdowns/route";

export type MetaBreakdownsSourceResult =
  MetaBreakdownsResponse & CurrentDayWarehouseSnapshotFields;
export type MetaCountryBreakdownsSourceResult = {
  status: MetaBreakdownsResponse["status"];
  rows: MetaBreakdownsResponse["location"];
  freshness: MetaWarehouseCountryBreakdownsResponse["freshness"] | null;
  verification: MetaWarehouseCountryBreakdownsResponse["verification"] | null;
  isPartial: boolean;
  notReadyReason: string | null;
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

function buildCurrentDaySnapshotReason(input: {
  warehouseReadyThroughDate?: string | null;
  currentDateInTimezone: string | null;
  primaryAccountTimezone: string | null;
  defaultReason: string;
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
    defaultReason: input.defaultReason,
  });
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
  const currentDaySnapshot =
    rangeContext.isSelectedCurrentDay && !isMetaTodayLiveReadsEnabled()
      ? await resolveMetaCurrentDaySnapshot({
          businessId: input.businessId,
          requestedDate: resolvedEnd,
          scope: "summary",
        })
      : null;
  const effectiveStartDate =
    rangeContext.isSelectedCurrentDay && currentDaySnapshot?.effectiveEndDate
      ? currentDaySnapshot.effectiveEndDate
      : resolvedStart;
  const effectiveEndDate =
    rangeContext.isSelectedCurrentDay && currentDaySnapshot?.effectiveEndDate
      ? currentDaySnapshot.effectiveEndDate
      : resolvedEnd;

  if (
    rangeContext.isSelectedCurrentDay &&
    currentDaySnapshot != null &&
    !hasUsableCurrentDaySnapshot(currentDaySnapshot)
  ) {
    return {
      ...emptyBreakdowns(
        "ok",
        buildCurrentDaySnapshotReason({
          warehouseReadyThroughDate: currentDaySnapshot?.warehouseReadyThroughDate,
          currentDateInTimezone: rangeContext.currentDateInTimezone,
          primaryAccountTimezone: rangeContext.primaryAccountTimezone,
          defaultReason: "Breakdown warehouse data is still being prepared for the requested range.",
        }),
        true,
      ),
      ...(currentDaySnapshot ?? {}),
    };
  }

  try {
    const warehouse = await getMetaWarehouseBreakdowns({
      businessId: input.businessId,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
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
        isPartial:
          rangeContext.isSelectedCurrentDay
            ? false
            : historicalTruth
              ? !historicalTruth.truthReady
              : false,
        notReadyReason:
          rangeContext.isSelectedCurrentDay && currentDaySnapshot?.isStaleSnapshot
            ? buildCurrentDaySnapshotReason({
                warehouseReadyThroughDate: currentDaySnapshot.warehouseReadyThroughDate,
                currentDateInTimezone: rangeContext.currentDateInTimezone,
                primaryAccountTimezone: rangeContext.primaryAccountTimezone,
                defaultReason:
                  "Breakdown warehouse data is still being prepared for the requested range.",
              })
            : historicalTruth && !historicalTruth.truthReady
            ? getHistoricalVerificationReason({
                verificationState:
                  historicalTruth.verificationState ?? historicalTruth.state ?? null,
                fallbackReason:
                  "Breakdown warehouse data is still being prepared for the requested range.",
              })
            : null,
        ...(currentDaySnapshot ?? {}),
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

export async function getMetaCountryBreakdownsForRange(input: {
  businessId: string;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<MetaCountryBreakdownsSourceResult> {
  const resolvedStart = input.startDate ?? toISODate(nDaysAgo(29));
  const resolvedEnd = input.endDate ?? toISODate(new Date());

  if (await isDemoBusiness(input.businessId)) {
    const demo = getDemoMetaBreakdowns();
    return {
      status: "ok",
      rows: demo.location,
      freshness: {
        dataState: demo.location.length > 0 ? "ready" : "stale",
        lastSyncedAt: null,
        liveRefreshedAt: null,
        isPartial: false,
        missingWindows: [],
        warnings: [],
      },
      verification: null,
      isPartial: false,
      notReadyReason: null,
    };
  }

  const integration = await getIntegration(input.businessId, "meta").catch(() => null);
  if (!integration || integration.status !== "connected") {
    return {
      status: "no_connection",
      rows: [],
      freshness: null,
      verification: null,
      isPartial: false,
      notReadyReason: "Meta integration is not connected.",
    };
  }
  if (!integration.access_token) {
    return {
      status: "no_access_token",
      rows: [],
      freshness: null,
      verification: null,
      isPartial: false,
      notReadyReason: "Meta access token is missing for this workspace.",
    };
  }

  const assignedAccountIds = await fetchAssignedAccountIds(input.businessId);
  if (assignedAccountIds.length === 0) {
    return {
      status: "no_accounts_assigned",
      rows: [],
      freshness: null,
      verification: null,
      isPartial: false,
      notReadyReason: "No Meta ad account is assigned to this workspace.",
    };
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
  const currentDaySnapshot =
    rangeContext.isSelectedCurrentDay && !isMetaTodayLiveReadsEnabled()
      ? await resolveMetaCurrentDaySnapshot({
          businessId: input.businessId,
          requestedDate: resolvedEnd,
          scope: "summary",
        })
      : null;
  const effectiveStartDate =
    rangeContext.isSelectedCurrentDay && currentDaySnapshot?.effectiveEndDate
      ? currentDaySnapshot.effectiveEndDate
      : resolvedStart;
  const effectiveEndDate =
    rangeContext.isSelectedCurrentDay && currentDaySnapshot?.effectiveEndDate
      ? currentDaySnapshot.effectiveEndDate
      : resolvedEnd;

  if (
    rangeContext.isSelectedCurrentDay &&
    currentDaySnapshot != null &&
    !hasUsableCurrentDaySnapshot(currentDaySnapshot)
  ) {
    return {
      status: "ok",
      rows: [],
      freshness: {
        dataState: "syncing",
        lastSyncedAt: null,
        liveRefreshedAt: null,
        isPartial: true,
        missingWindows: [],
        warnings: [],
      },
      verification: null,
      isPartial: true,
      notReadyReason: buildCurrentDaySnapshotReason({
        warehouseReadyThroughDate: currentDaySnapshot?.warehouseReadyThroughDate,
        currentDateInTimezone: rangeContext.currentDateInTimezone,
        primaryAccountTimezone: rangeContext.primaryAccountTimezone,
        defaultReason:
          "Country breakdown warehouse data is still being prepared for the requested range.",
      }),
      ...(currentDaySnapshot ?? {}),
    };
  }

  try {
    const warehouse = await getMetaWarehouseCountryBreakdowns({
      businessId: input.businessId,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      providerAccountIds: assignedAccountIds,
    });
    if (warehouse.rows.length > 0) {
      return {
        status: "ok",
        rows: warehouse.rows,
        freshness: warehouse.freshness,
        verification: warehouse.verification ?? null,
        isPartial:
          rangeContext.isSelectedCurrentDay
            ? false
            : historicalTruth
              ? !historicalTruth.truthReady
              : Boolean(warehouse.isPartial),
        notReadyReason:
          rangeContext.isSelectedCurrentDay && currentDaySnapshot?.isStaleSnapshot
            ? buildCurrentDaySnapshotReason({
                warehouseReadyThroughDate: currentDaySnapshot.warehouseReadyThroughDate,
                currentDateInTimezone: rangeContext.currentDateInTimezone,
                primaryAccountTimezone: rangeContext.primaryAccountTimezone,
                defaultReason:
                  "Country breakdown warehouse data is still being prepared for the requested range.",
              })
            : historicalTruth && !historicalTruth.truthReady
            ? getHistoricalVerificationReason({
                verificationState:
                  historicalTruth.verificationState ?? historicalTruth.state ?? null,
                fallbackReason:
                  "Country breakdown warehouse data is still being prepared for the requested range.",
              })
            : null,
        ...(currentDaySnapshot ?? {}),
      };
    }
  } catch (error) {
    console.warn("[meta-country-breakdowns] warehouse_read_failed", {
      businessId: input.businessId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    status: "ok",
    rows: [],
    freshness: {
      dataState: "syncing",
      lastSyncedAt: null,
      liveRefreshedAt: null,
      isPartial: historicalTruth ? !historicalTruth.truthReady : true,
      missingWindows: [],
      warnings: [],
    },
    verification: null,
    isPartial: historicalTruth ? !historicalTruth.truthReady : true,
    notReadyReason:
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
                  "Country breakdown warehouse data is still being prepared for the requested range.",
              }),
            })
        : getMetaPartialReason({
            isSelectedCurrentDay: rangeContext.isSelectedCurrentDay,
            currentDateInTimezone: rangeContext.currentDateInTimezone,
            primaryAccountTimezone: rangeContext.primaryAccountTimezone,
            defaultReason:
              "Country breakdown warehouse data is still being prepared for the requested range.",
          })),
  };
}
