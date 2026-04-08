import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { isDemoBusiness } from "@/lib/business-mode.server";
import { getDemoGoogleAdsAdvisor } from "@/lib/demo-business";
import { getOrCreateGoogleAdsAdvisorSnapshot } from "@/lib/google-ads/advisor-snapshots";
import { isGoogleAdsDecisionEngineV2Enabled } from "@/lib/google-ads/decision-engine-config";
import { parseGoogleAdsRequestParams } from "@/lib/google-ads-request-params";
import {
  buildGoogleAdsSelectedRangeContext,
  getGoogleAdsAdvisorReport,
  getGoogleAdsCampaignsReport,
} from "@/lib/google-ads/serving";

export async function GET(request: NextRequest) {
  const { businessId, accountId, dateRange, customStart, customEnd, debug } = parseGoogleAdsRequestParams(
    request.nextUrl.searchParams
  );

  if (!businessId) {
    return NextResponse.json({ error: "businessId is required" }, { status: 400 });
  }

  const access = await requireBusinessAccess({ request, businessId, minRole: "guest" });
  if ("error" in access) return access.error;

  if (!isGoogleAdsDecisionEngineV2Enabled()) {
    return NextResponse.json(
      { error: "Google Ads Decision Engine V2 is disabled." },
      { status: 503 }
    );
  }

  if (await isDemoBusiness(businessId)) {
    return NextResponse.json(getDemoGoogleAdsAdvisor());
  }

  const payload = debug
    ? await getGoogleAdsAdvisorReport({
        businessId,
        accountId,
        dateRange,
        customStart,
        customEnd,
        debug,
      })
    : (
        await getOrCreateGoogleAdsAdvisorSnapshot({
          businessId,
          accountId,
          forceRefresh: request.nextUrl.searchParams.get("refresh") === "1",
        })
      ).advisorPayload;

  if (!debug && payload.metadata && customStart && customEnd) {
    const selectedCampaigns = await getGoogleAdsCampaignsReport({
      businessId,
      accountId,
      dateRange,
      customStart,
      customEnd,
      compareMode: "none",
    }).catch(() => null);

    const selectedTotals = selectedCampaigns
      ? {
          spend: selectedCampaigns.rows.reduce((sum, row) => sum + Number(row.spend ?? 0), 0),
          revenue: selectedCampaigns.rows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0),
          conversions: selectedCampaigns.rows.reduce((sum, row) => sum + Number(row.conversions ?? 0), 0),
          roas:
            selectedCampaigns.rows.reduce((sum, row) => sum + Number(row.spend ?? 0), 0) > 0
              ? Number(
                  (
                    selectedCampaigns.rows.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0) /
                    selectedCampaigns.rows.reduce((sum, row) => sum + Number(row.spend ?? 0), 0)
                  ).toFixed(2)
                )
              : 0,
        }
      : null;

    payload.metadata.selectedRangeContext =
      selectedTotals &&
      payload.metadata.asOfDate &&
      (payload.metadata.decisionSummaryTotals || payload.metadata.canonicalWindowTotals)
        ? buildGoogleAdsSelectedRangeContext({
            canonicalAsOfDate: payload.metadata.asOfDate,
            canonicalTotals:
              payload.metadata.canonicalWindowTotals ??
              (payload.metadata.decisionSummaryTotals
                ? {
                    spend: payload.metadata.decisionSummaryTotals.spend,
                    revenue: payload.metadata.decisionSummaryTotals.revenue,
                    conversions: payload.metadata.decisionSummaryTotals.conversions,
                    roas: payload.metadata.decisionSummaryTotals.roas,
                  }
                : null),
            selectedRangeStart: customStart,
            selectedRangeEnd: customEnd,
            selectedTotals,
          })
        : {
            eligible: false,
            state: "hidden",
            label: "",
            summary: "",
            selectedRangeStart: customStart,
            selectedRangeEnd: customEnd,
            deltaPercent: null,
            metricKey: null,
          };
  }

  return NextResponse.json(payload);
}
