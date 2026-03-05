import { MetaCreativeRow } from "@/components/creatives/metricConfig";

export interface AiAnalysisResult {
  summary: string[];
  performanceInsights: string[];
  recommendations: string[];
  risks: string[];
}

export function generateAiAnalysis(row: MetaCreativeRow): AiAnalysisResult {
  const summary: string[] = [];
  const performanceInsights: string[] = [];
  const recommendations: string[] = [];
  const risks: string[] = [];

  if (row.roas >= 3.2) {
    summary.push("This creative is in scale territory based on ROAS.");
    recommendations.push("Increase spend 15-25% with daily guardrails.");
  } else if (row.roas >= 2.2) {
    summary.push("This creative is stable but not a clear winner yet.");
    recommendations.push("Iterate hooks and CTA while keeping budget stable.");
  } else {
    summary.push("Performance is below target and needs a reset.");
    recommendations.push("Consider pausing and replacing with a new angle.");
    risks.push("Continued spend may reduce blended account ROAS.");
  }

  if (row.cpa > 30) {
    performanceInsights.push("CPA is elevated versus healthy conversion cost bands.");
    recommendations.push("Narrow audience and optimize for high-intent placements.");
  } else {
    performanceInsights.push("CPA is within an acceptable acquisition range.");
  }

  if (row.ctrAll < 2) {
    performanceInsights.push("CTR indicates weak click intent from current hook/copy.");
    recommendations.push("Test a stronger first-line hook and clearer offer framing.");
    risks.push("Low CTR can cap scale and increase CPM pressure.");
  } else {
    performanceInsights.push("CTR suggests the message is resonating with audience intent.");
  }

  if (row.thumbstop > 0 && row.thumbstop < 30) {
    performanceInsights.push("Thumbstop rate is soft; first seconds are not stopping scroll.");
    recommendations.push("Recut the first 2 seconds with fast visual contrast and on-screen claim.");
  } else if (row.thumbstop >= 30) {
    performanceInsights.push("Thumbstop rate is healthy for short-form placements.");
  }

  recommendations.push("Run a headline-only A/B test against the current winning concept.");
  recommendations.push("Duplicate to a fresh ad set and test broad vs lookalike traffic.");

  if (risks.length === 0) {
    risks.push("No immediate red flags, but monitor fatigue weekly.");
  }

  return {
    summary: summary.slice(0, 3),
    performanceInsights: performanceInsights.slice(0, 4),
    recommendations: recommendations.slice(0, 3),
    risks: risks.slice(0, 2),
  };
}
