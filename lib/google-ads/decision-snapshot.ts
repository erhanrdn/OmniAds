import { buildGoogleAdsExecutionSurface } from "@/lib/google-ads/decision-engine-config";
import { attachGoogleAdsAdvisorActionContract } from "@/lib/google-ads/advisor-action-contract";
import { buildGoogleAdsDecisionSnapshotWindowSet } from "@/lib/google-ads/decision-window-policy";
import type {
  GoogleAdvisorHistoricalSupport,
  GoogleAdvisorMetadata,
  GoogleAdvisorActionContractSource,
  GoogleAdvisorResponse,
} from "@/lib/google-ads/growth-advisor-types";

type DecisionSummaryTotals = NonNullable<GoogleAdvisorMetadata["decisionSummaryTotals"]>;
type SelectedRangeTotals = NonNullable<GoogleAdvisorMetadata["selectedRangeTotals"]>;
type SelectedRangeContext = NonNullable<GoogleAdvisorMetadata["selectedRangeContext"]>;

export function buildGoogleAdsLagAdjustedEndDate(value?: string | null): NonNullable<GoogleAdvisorMetadata["lagAdjustedEndDate"]> {
  if (value) {
    return {
      available: true,
      value,
      note: null,
    };
  }
  return {
    available: false,
    value: null,
    note: "Lag-adjusted end date is not yet computed in the current Google Ads serving architecture.",
  };
}

export function buildGoogleAdsDecisionSummaryTotals(input: {
  windowKey: "operational_28d";
  windowLabel: string;
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
}): DecisionSummaryTotals {
  return {
    windowKey: input.windowKey,
    windowLabel: input.windowLabel,
    spend: input.spend,
    revenue: input.revenue,
    conversions: input.conversions,
    roas: input.roas,
  };
}

export function buildGoogleAdsSelectedRangeTotals(input: {
  windowKey: "custom";
  windowLabel: string;
  spend: number;
  revenue: number;
  conversions: number;
  roas: number;
}): SelectedRangeTotals {
  return {
    windowKey: input.windowKey,
    windowLabel: input.windowLabel,
    spend: input.spend,
    revenue: input.revenue,
    conversions: input.conversions,
    roas: input.roas,
  };
}

export function buildGoogleAdsDecisionSnapshotMetadata(input: {
  analysisMode: GoogleAdvisorMetadata["analysisMode"];
  asOfDate: string;
  selectedWindowKey: GoogleAdvisorMetadata["selectedWindowKey"];
  historicalSupport?: GoogleAdvisorHistoricalSupport | null;
  decisionSummaryTotals?: DecisionSummaryTotals | null;
  selectedRangeTotals?: SelectedRangeTotals | null;
  selectedRangeContext?: SelectedRangeContext | null;
  aggregateIntelligence?: GoogleAdvisorMetadata["aggregateIntelligence"];
  lagAdjustedEndDate?: string | null;
}): GoogleAdvisorMetadata {
  const windowSet = buildGoogleAdsDecisionSnapshotWindowSet(input.asOfDate);
  return {
    analysisMode: input.analysisMode,
    asOfDate: input.asOfDate,
    decisionEngineVersion: "v2",
    snapshotModel: "decision_snapshot_v2",
    selectedWindowKey: input.selectedWindowKey,
    primaryWindowKey: windowSet.primaryWindowKey,
    queryWindowKey: windowSet.queryWindowKey,
    baselineWindowKey: windowSet.baselineWindowKey,
    maturityCutoffDays: windowSet.maturityCutoffDays,
    lagAdjustedEndDate: buildGoogleAdsLagAdjustedEndDate(input.lagAdjustedEndDate),
    selectedRangeRole: "contextual_only",
    analysisWindows: {
      healthAlarmWindows: windowSet.healthAlarmWindows,
      operationalWindow: windowSet.primaryWindow,
      queryGovernanceWindow: windowSet.queryWindow,
      baselineWindow: windowSet.baselineWindow,
    },
    executionSurface: buildGoogleAdsExecutionSurface(),
    historicalSupportAvailable: input.historicalSupport?.available ?? false,
    historicalSupport: input.historicalSupport ?? null,
    decisionSummaryTotals: input.decisionSummaryTotals ?? null,
    selectedRangeTotals: input.selectedRangeTotals ?? null,
    canonicalWindowTotals: input.decisionSummaryTotals
      ? {
          spend: input.decisionSummaryTotals.spend,
          revenue: input.decisionSummaryTotals.revenue,
          conversions: input.decisionSummaryTotals.conversions,
          roas: input.decisionSummaryTotals.roas,
        }
      : null,
    selectedRangeContext: input.selectedRangeContext ?? null,
    aggregateIntelligence: input.aggregateIntelligence ?? null,
  };
}

export function normalizeGoogleAdsDecisionSnapshotPayload(input: {
  advisorPayload: GoogleAdvisorResponse;
  analysisMode: GoogleAdvisorMetadata["analysisMode"];
  asOfDate: string;
  selectedWindowKey: GoogleAdvisorMetadata["selectedWindowKey"];
  historicalSupport?: GoogleAdvisorHistoricalSupport | null;
  actionContractSource?: GoogleAdvisorActionContractSource;
}): GoogleAdvisorResponse {
  const existingMetadata = input.advisorPayload.metadata;
  const normalizedMetadata = buildGoogleAdsDecisionSnapshotMetadata({
    analysisMode: existingMetadata?.analysisMode ?? input.analysisMode,
    asOfDate: existingMetadata?.asOfDate ?? input.asOfDate,
    selectedWindowKey: existingMetadata?.selectedWindowKey ?? input.selectedWindowKey,
    historicalSupport:
      existingMetadata?.historicalSupport ??
      (existingMetadata?.historicalSupportAvailable ? input.historicalSupport ?? null : input.historicalSupport ?? null),
    decisionSummaryTotals:
      existingMetadata?.decisionSummaryTotals ??
      (existingMetadata?.canonicalWindowTotals
        ? {
            windowKey: "operational_28d",
            windowLabel:
              existingMetadata.analysisWindows?.operationalWindow?.label ?? "operational 28d",
            spend: existingMetadata.canonicalWindowTotals.spend,
            revenue: existingMetadata.canonicalWindowTotals.revenue,
            conversions: existingMetadata.canonicalWindowTotals.conversions,
            roas: existingMetadata.canonicalWindowTotals.roas,
          }
        : null),
    selectedRangeTotals: existingMetadata?.selectedRangeTotals ?? null,
    selectedRangeContext: existingMetadata?.selectedRangeContext ?? null,
    aggregateIntelligence: existingMetadata?.aggregateIntelligence ?? null,
    lagAdjustedEndDate: existingMetadata?.lagAdjustedEndDate?.value ?? null,
  });

  const payload = {
    ...input.advisorPayload,
    metadata: normalizedMetadata,
  };

  return attachGoogleAdsAdvisorActionContract({
    advisorPayload: payload,
    source: input.actionContractSource ?? existingMetadata?.actionContract?.source ?? "compatibility_derived",
  });
}
