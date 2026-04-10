import { getBusinessCommercialTruthSnapshot } from "@/lib/business-commercial";
import { getMetaAdSetsForRange } from "@/lib/meta/adsets-source";
import { getMetaBreakdownsForRange } from "@/lib/meta/breakdowns-source";
import { getMetaCampaignsForRange } from "@/lib/meta/campaigns-source";
import {
  buildMetaDecisionOs,
  type MetaDecisionOsV1Response,
} from "@/lib/meta/decision-os";

export async function getMetaDecisionOsForRange(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<MetaDecisionOsV1Response> {
  const [snapshot, campaigns, breakdowns, adSets] = await Promise.all([
    getBusinessCommercialTruthSnapshot(input.businessId),
    getMetaCampaignsForRange({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
    }),
    getMetaBreakdownsForRange({
      businessId: input.businessId,
      startDate: input.startDate,
      endDate: input.endDate,
    }),
    getMetaAdSetsForRange({
      businessId: input.businessId,
      campaignId: null,
      startDate: input.startDate,
      endDate: input.endDate,
    }),
  ]);

  return buildMetaDecisionOs({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
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
