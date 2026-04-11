import { getMetaOperatorDecisionMetadata } from "@/lib/operator-decision-metadata";
import { getMetaAdSetsForRange, type MetaAdSetsSourceResult } from "@/lib/meta/adsets-source";
import {
  getMetaBreakdownsForRange,
  type MetaBreakdownsSourceResult,
} from "@/lib/meta/breakdowns-source";
import {
  getMetaCampaignsForRange,
  type MetaCampaignsSourceResult,
} from "@/lib/meta/campaigns-source";

export async function getMetaDecisionWindowContext(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  decisionAsOf?: string | null;
}) {
  return getMetaOperatorDecisionMetadata({
    businessId: input.businessId,
    analyticsStartDate: input.startDate,
    analyticsEndDate: input.endDate,
    decisionAsOf: input.decisionAsOf,
  });
}

export async function getMetaDecisionSourceSnapshot(input: {
  businessId: string;
  decisionWindows: Awaited<ReturnType<typeof getMetaDecisionWindowContext>>["decisionWindows"];
}) {
  const primaryWindow = input.decisionWindows.primary30d;
  const [campaigns, breakdowns, adSets] = await Promise.all([
    getMetaCampaignsForRange({
      businessId: input.businessId,
      startDate: primaryWindow.startDate,
      endDate: primaryWindow.endDate,
    }),
    getMetaBreakdownsForRange({
      businessId: input.businessId,
      startDate: primaryWindow.startDate,
      endDate: primaryWindow.endDate,
    }),
    getMetaAdSetsForRange({
      businessId: input.businessId,
      campaignId: null,
      startDate: primaryWindow.startDate,
      endDate: primaryWindow.endDate,
    }),
  ]);

  return {
    campaigns,
    breakdowns,
    adSets,
  } satisfies {
    campaigns: MetaCampaignsSourceResult;
    breakdowns: MetaBreakdownsSourceResult;
    adSets: MetaAdSetsSourceResult;
  };
}
