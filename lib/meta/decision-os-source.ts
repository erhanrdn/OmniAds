import { getBusinessCommercialTruthSnapshot } from "@/lib/business-commercial";
import {
  buildMetaDecisionOs,
  type MetaDecisionOsV1Response,
} from "@/lib/meta/decision-os";
import {
  getMetaDecisionSourceSnapshot,
  getMetaDecisionWindowContext,
} from "@/lib/meta/operator-decision-source";

export async function getMetaDecisionOsForRange(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<MetaDecisionOsV1Response> {
  const [snapshot, decisionContext] = await Promise.all([
    getBusinessCommercialTruthSnapshot(input.businessId),
    getMetaDecisionWindowContext({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
    }),
  ]);
  const { campaigns, breakdowns, adSets } = await getMetaDecisionSourceSnapshot({
    businessId: input.businessId,
    decisionWindows: decisionContext.decisionWindows,
  });

  return buildMetaDecisionOs({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
    analyticsWindow: decisionContext.analyticsWindow,
    decisionWindows: decisionContext.decisionWindows,
    historicalMemory: decisionContext.historicalMemory,
    decisionAsOf: decisionContext.decisionAsOf,
    campaigns: campaigns.rows ?? [],
    adSets: adSets.rows ?? [],
    breakdowns:
      breakdowns.location.length > 0 || breakdowns.placement.length > 0
        ? {
            location: breakdowns.location ?? [],
            placement: breakdowns.placement ?? [],
          }
        : null,
    commercialTruth: snapshot,
  });
}
