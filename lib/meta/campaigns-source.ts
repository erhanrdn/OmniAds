import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import { getDemoMetaCampaigns } from "@/lib/demo-business";
import { getIntegration } from "@/lib/integrations";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";
import { getMetaHistoricalVerificationReason } from "@/lib/meta/historical-verification";
import { getMetaLiveCampaignRows } from "@/lib/meta/live";
import { getMetaPartialReason, getMetaRangePreparationContext } from "@/lib/meta/readiness";
import { getMetaWarehouseCampaignTable } from "@/lib/meta/serving";
import { getMetaSelectedRangeTruthReadiness } from "@/lib/sync/meta-sync";
import type { MetaCampaignRow } from "@/app/api/meta/campaigns/route";

export interface MetaCampaignsSourceResult {
  status?: "ok" | "no_accounts_assigned" | "account_not_assigned" | "not_connected";
  rows: MetaCampaignRow[];
  isPartial?: boolean;
  notReadyReason?: string | null;
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
    !rangeContext.isSelectedCurrentDay &&
    rangeContext.withinAuthoritativeHistory &&
    connected
      ? await getMetaSelectedRangeTruthReadiness({
          businessId: input.businessId,
          startDate: resolvedStart,
          endDate: resolvedEnd,
        }).catch(() => null)
      : null;

  let rows: MetaCampaignRow[] = [];
  try {
    if (rangeContext.historicalReadMode === "historical_live_fallback") {
      if (!connected) {
        return {
          status: "not_connected",
          rows: [],
          isPartial: true,
          notReadyReason:
            "Meta integration is not connected. Historical live fallback is unavailable.",
        };
      }
      rows = await getMetaLiveCampaignRows({
        businessId: input.businessId,
        startDate: resolvedStart,
        endDate: resolvedEnd,
        providerAccountIds: targetAccountIds,
        includePrev: input.includePrev,
      });
      return {
        status: "ok",
        rows,
        isPartial: false,
        notReadyReason: null,
      };
    }

    if (rangeContext.isSelectedCurrentDay) {
      if (!connected) {
        return {
          status: "not_connected",
          rows: [],
          isPartial: true,
          notReadyReason:
            "Meta integration is not connected. Current-day campaign data is only available from the live provider.",
        };
      }
      rows = await getMetaLiveCampaignRows({
        businessId: input.businessId,
        startDate: resolvedStart,
        endDate: resolvedEnd,
        providerAccountIds: targetAccountIds,
        includePrev: input.includePrev,
      });
      return {
        status: "ok",
        rows,
        isPartial: rows.length === 0,
        notReadyReason:
          rows.length === 0
            ? getMetaPartialReason({
                isSelectedCurrentDay: true,
                currentDateInTimezone: rangeContext.currentDateInTimezone,
                primaryAccountTimezone: rangeContext.primaryAccountTimezone,
                defaultReason:
                  "Current-day live Meta campaign data is still being prepared.",
              })
            : null,
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
    if (rangeContext.historicalReadMode === "historical_live_fallback") {
      return {
        status: connected ? "ok" : "not_connected",
        rows: [],
        isPartial: true,
        notReadyReason: connected
          ? "Historical live Meta campaign data is temporarily unavailable for the selected range."
          : "Meta integration is not connected. Historical live fallback is unavailable.",
      };
    }
    if (rangeContext.isSelectedCurrentDay) {
      return {
        status: connected ? "ok" : "not_connected",
        rows: [],
        isPartial: true,
        notReadyReason: connected
          ? getMetaPartialReason({
              isSelectedCurrentDay: true,
              currentDateInTimezone: rangeContext.currentDateInTimezone,
              primaryAccountTimezone: rangeContext.primaryAccountTimezone,
              defaultReason:
                "Current-day live Meta campaign data is still being prepared.",
            })
          : "Meta integration is not connected. Current-day campaign data is only available from the live provider.",
      };
    }
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
          : getMetaHistoricalVerificationReason({
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
  };
}
