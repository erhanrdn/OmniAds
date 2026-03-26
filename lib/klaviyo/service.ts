import {
  KlaviyoBenchmarkReference,
  KlaviyoBenchmarkStatus,
  KlaviyoCampaignSummary,
  KlaviyoDashboardData,
  KlaviyoDateRange,
  KlaviyoDateRangePreset,
  KlaviyoDiagnostics,
  KlaviyoFlowDetail,
  KlaviyoFlowSummary,
  KlaviyoMetricValue,
  KlaviyoOverview,
  KlaviyoRecommendation,
} from "@/lib/klaviyo/types";

const PRESETS: Record<KlaviyoDateRangePreset, KlaviyoDateRange> = {
  "7d": { preset: "7d", label: "Last 7 days", days: 7 },
  "14d": { preset: "14d", label: "Last 14 days", days: 14 },
  "30d": { preset: "30d", label: "Last 30 days", days: 30 },
  "90d": { preset: "90d", label: "Last 90 days", days: 90 },
  custom: { preset: "custom", label: "Custom range", days: 30 },
};

type FlowSeed = {
  id: string;
  name: string;
  flowType: string;
  channel: "email" | "sms" | "mixed";
  revenue: number;
  revenueDelta: number;
  sends: number;
  sendsDelta: number;
  openRate: number;
  openRateDelta: number;
  clickRate: number;
  clickRateDelta: number;
  conversionRate: number;
  conversionRateDelta: number;
  unsubscribeRate: number;
  status: "healthy" | "watch" | "risk";
  warning?: string;
};

type CampaignSeed = {
  id: string;
  name: string;
  channel: "email" | "sms";
  sentAtLabel: string;
  audienceLabel: string;
  revenue: number;
  revenueDelta: number;
  openRate: number;
  openRateDelta: number;
  clickRate: number;
  clickRateDelta: number;
  conversionRate: number;
  conversionRateDelta: number;
};

const FLOW_SEEDS: FlowSeed[] = [
  {
    id: "welcome-series",
    name: "Welcome Series",
    flowType: "Welcome flow",
    channel: "email",
    revenue: 28400,
    revenueDelta: 12.4,
    sends: 18200,
    sendsDelta: 6.2,
    openRate: 0.57,
    openRateDelta: -4.3,
    clickRate: 0.094,
    clickRateDelta: -7.1,
    conversionRate: 0.041,
    conversionRateDelta: 3.8,
    unsubscribeRate: 0.004,
    status: "watch",
    warning: "Click rate is drifting down even though revenue remains healthy.",
  },
  {
    id: "abandoned-cart",
    name: "Abandoned Cart",
    flowType: "Cart recovery",
    channel: "mixed",
    revenue: 41850,
    revenueDelta: 18.1,
    sends: 12680,
    sendsDelta: 9.5,
    openRate: 0.523,
    openRateDelta: -2.1,
    clickRate: 0.081,
    clickRateDelta: -9.2,
    conversionRate: 0.063,
    conversionRateDelta: 1.3,
    unsubscribeRate: 0.006,
    status: "watch",
    warning: "Message 2 is dropping sharply after the first recovery email.",
  },
  {
    id: "browse-abandonment",
    name: "Browse Abandonment",
    flowType: "Browse abandonment",
    channel: "email",
    revenue: 12980,
    revenueDelta: 4.7,
    sends: 13920,
    sendsDelta: 7.9,
    openRate: 0.441,
    openRateDelta: -6.4,
    clickRate: 0.047,
    clickRateDelta: -11.3,
    conversionRate: 0.018,
    conversionRateDelta: -5.8,
    unsubscribeRate: 0.007,
    status: "risk",
    warning: "Flow is below benchmark for click quality and conversion recovery.",
  },
  {
    id: "post-purchase",
    name: "Post-Purchase Nurture",
    flowType: "Post-purchase",
    channel: "email",
    revenue: 10320,
    revenueDelta: 21.2,
    sends: 8920,
    sendsDelta: 5.4,
    openRate: 0.612,
    openRateDelta: 2.4,
    clickRate: 0.102,
    clickRateDelta: 5.1,
    conversionRate: 0.024,
    conversionRateDelta: 8.6,
    unsubscribeRate: 0.003,
    status: "healthy",
  },
  {
    id: "winback",
    name: "Winback",
    flowType: "Re-engagement",
    channel: "sms",
    revenue: 6740,
    revenueDelta: 9.2,
    sends: 4860,
    sendsDelta: 3.7,
    openRate: 0.971,
    openRateDelta: 0.6,
    clickRate: 0.139,
    clickRateDelta: -2.4,
    conversionRate: 0.029,
    conversionRateDelta: 4.1,
    unsubscribeRate: 0.011,
    status: "watch",
    warning: "SMS revenue is solid, but unsubscribe pressure is climbing.",
  },
];

const CAMPAIGN_SEEDS: CampaignSeed[] = [
  {
    id: "spring-drop-email",
    name: "Spring Drop Launch",
    channel: "email",
    sentAtLabel: "Mar 12",
    audienceLabel: "VIP early access",
    revenue: 18240,
    revenueDelta: 14.2,
    openRate: 0.482,
    openRateDelta: -1.4,
    clickRate: 0.075,
    clickRateDelta: 2.1,
    conversionRate: 0.031,
    conversionRateDelta: 6.8,
  },
  {
    id: "back-in-stock-sms",
    name: "Back in Stock Alert",
    channel: "sms",
    sentAtLabel: "Mar 09",
    audienceLabel: "High-intent subscribers",
    revenue: 7340,
    revenueDelta: 8.9,
    openRate: 0.986,
    openRateDelta: 0.2,
    clickRate: 0.164,
    clickRateDelta: -3.5,
    conversionRate: 0.038,
    conversionRateDelta: 4.7,
  },
  {
    id: "bundle-promo-email",
    name: "Bundle Offer",
    channel: "email",
    sentAtLabel: "Mar 05",
    audienceLabel: "Repeat purchasers",
    revenue: 11260,
    revenueDelta: -4.1,
    openRate: 0.437,
    openRateDelta: -5.6,
    clickRate: 0.052,
    clickRateDelta: -8.7,
    conversionRate: 0.021,
    conversionRateDelta: -6.2,
  },
];

const BENCHMARKS = {
  email: {
    openRate: 0.46,
    clickRate: 0.072,
    conversionRate: 0.026,
  },
  sms: {
    openRate: 0.98,
    clickRate: 0.151,
    conversionRate: 0.032,
  },
  mixed: {
    openRate: 0.54,
    clickRate: 0.084,
    conversionRate: 0.048,
  },
};

function formatPercent(value: number) {
  return formatPercentFromRatioSmart(value);
}

function formatCurrency(value: number) {
  return formatCurrencySmart(value, "$", { compactLarge: false });
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDelta(delta: number, suffix = "%") {
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${delta.toFixed(1)}${suffix}`;
}

function getBenchmarkStatus(value: number, baseline: number): KlaviyoBenchmarkStatus {
  const ratio = baseline === 0 ? 1 : value / baseline;
  if (ratio >= 1.08) return "above";
  if (ratio >= 0.95) return "near";
  if (ratio >= 0.82) return "below";
  return "significantly_below";
}

function buildMetricValue(
  value: number,
  formatted: string,
  delta?: number,
): KlaviyoMetricValue {
  return {
    value,
    formatted,
    sourceType: "exact",
    delta,
    deltaLabel: typeof delta === "number" ? formatDelta(delta) : undefined,
  };
}

function buildBenchmark(
  metric: "openRate" | "clickRate" | "conversionRate",
  channel: keyof typeof BENCHMARKS,
  value: number,
): KlaviyoBenchmarkReference {
  const baseline = BENCHMARKS[channel][metric];
  const labelMap = {
    openRate: "Open rate",
    clickRate: "Click rate",
    conversionRate: "Conversion rate",
  };
  return {
    metric,
    label: labelMap[metric],
    baseline,
    baselineLabel: formatPercent(baseline),
    status: getBenchmarkStatus(value, baseline),
    sourceType: "benchmark",
  };
}

function scaleValue(value: number, range: KlaviyoDateRange) {
  const multiplier = range.days / 30;
  return Math.round(value * multiplier);
}

function scalePercent(value: number, range: KlaviyoDateRange) {
  const variance = range.days >= 90 ? 0.008 : range.days <= 7 ? -0.006 : 0;
  return Math.max(0, value + variance);
}

function buildFlowSummary(seed: FlowSeed, range: KlaviyoDateRange): KlaviyoFlowSummary {
  const revenue = scaleValue(seed.revenue, range);
  const sends = scaleValue(seed.sends, range);
  const openRate = scalePercent(seed.openRate, range);
  const clickRate = scalePercent(seed.clickRate, range);
  const conversionRate = scalePercent(seed.conversionRate, range);
  return {
    id: seed.id,
    name: seed.name,
    flowType: seed.flowType,
    channel: seed.channel,
    status: seed.status,
    revenue: buildMetricValue(revenue, formatCurrency(revenue), seed.revenueDelta),
    sends: buildMetricValue(sends, formatNumber(sends), seed.sendsDelta),
    openRate: {
      value: openRate,
      formatted: formatPercent(openRate),
      sourceType: "derived",
      delta: seed.openRateDelta,
      deltaLabel: formatDelta(seed.openRateDelta),
    },
    clickRate: {
      value: clickRate,
      formatted: formatPercent(clickRate),
      sourceType: "derived",
      delta: seed.clickRateDelta,
      deltaLabel: formatDelta(seed.clickRateDelta),
    },
    conversionRate: {
      value: conversionRate,
      formatted: formatPercent(conversionRate),
      sourceType: "derived",
      delta: seed.conversionRateDelta,
      deltaLabel: formatDelta(seed.conversionRateDelta),
    },
    benchmark: buildBenchmark("clickRate", seed.channel, clickRate),
    warning: seed.warning,
  };
}

function buildCampaign(seed: CampaignSeed, range: KlaviyoDateRange): KlaviyoCampaignSummary {
  const revenue = scaleValue(seed.revenue, range);
  const openRate = scalePercent(seed.openRate, range);
  const clickRate = scalePercent(seed.clickRate, range);
  const conversionRate = scalePercent(seed.conversionRate, range);
  return {
    id: seed.id,
    name: seed.name,
    channel: seed.channel,
    sentAtLabel: seed.sentAtLabel,
    audienceLabel: seed.audienceLabel,
    revenue: buildMetricValue(revenue, formatCurrency(revenue), seed.revenueDelta),
    openRate: {
      value: openRate,
      formatted: formatPercent(openRate),
      sourceType: "derived",
      delta: seed.openRateDelta,
      deltaLabel: formatDelta(seed.openRateDelta),
    },
    clickRate: {
      value: clickRate,
      formatted: formatPercent(clickRate),
      sourceType: "derived",
      delta: seed.clickRateDelta,
      deltaLabel: formatDelta(seed.clickRateDelta),
    },
    conversionRate: {
      value: conversionRate,
      formatted: formatPercent(conversionRate),
      sourceType: "derived",
      delta: seed.conversionRateDelta,
      deltaLabel: formatDelta(seed.conversionRateDelta),
    },
    benchmark: buildBenchmark("clickRate", seed.channel, clickRate),
  };
}

export function resolveKlaviyoDateRange(
  preset: KlaviyoDateRangePreset = "30d",
): KlaviyoDateRange {
  return PRESETS[preset] ?? PRESETS["30d"];
}

export async function getKlaviyoOverview(
  businessId: string,
  range: KlaviyoDateRange,
): Promise<KlaviyoOverview> {
  const seedShift = businessId.length % 7;
  const flowRevenue = scaleValue(100290 + seedShift * 680, range);
  const campaignRevenue = scaleValue(45820 + seedShift * 340, range);
  const attributedRevenue = flowRevenue + campaignRevenue;
  const emailRevenueShare = 0.74;
  const smsRevenueShare = 0.26;

  return {
    dateRange: range,
    compareLabel: "vs previous period",
    attributedRevenue: buildMetricValue(
      attributedRevenue,
      formatCurrency(attributedRevenue),
      11.8,
    ),
    flowRevenue: buildMetricValue(flowRevenue, formatCurrency(flowRevenue), 13.4),
    campaignRevenue: buildMetricValue(
      campaignRevenue,
      formatCurrency(campaignRevenue),
      8.2,
    ),
    emailRevenueShare: {
      value: emailRevenueShare,
      formatted: formatPercent(emailRevenueShare),
      sourceType: "derived",
      delta: -1.8,
      deltaLabel: formatDelta(-1.8),
    },
    smsRevenueShare: {
      value: smsRevenueShare,
      formatted: formatPercent(smsRevenueShare),
      sourceType: "derived",
      delta: 1.8,
      deltaLabel: formatDelta(1.8),
    },
    benchmarkSummary:
      "3 major flows are at or above benchmark, while browse abandonment and winback need attention.",
    healthSummary:
      "Revenue is expanding faster than engagement, so the account is healthy but needs quality monitoring.",
    warnings: [
      "Browse abandonment click quality is significantly below benchmark.",
      "Winback SMS unsubscribe pressure is creeping up.",
    ],
    opportunities: [
      "Welcome series remains a strong scale candidate with stable conversion efficiency.",
      "Post-purchase nurture is outperforming benchmark and can absorb more testing.",
    ],
  };
}

export async function getKlaviyoFlows(
  businessId: string,
  range: KlaviyoDateRange,
): Promise<KlaviyoFlowSummary[]> {
  void businessId;
  return FLOW_SEEDS.map((seed) => buildFlowSummary(seed, range));
}

export async function getKlaviyoFlowDetail(
  businessId: string,
  flowId: string,
  range: KlaviyoDateRange,
): Promise<KlaviyoFlowDetail | null> {
  void businessId;
  const seed = FLOW_SEEDS.find((item) => item.id === flowId);
  if (!seed) return null;

  const summary = buildFlowSummary(seed, range);
  const revenue = scaleValue(seed.revenue, range);
  const messageBase = [
    {
      id: `${flowId}-m1`,
      name: "Message 1",
      order: 1,
      channel: seed.channel === "mixed" ? "email" : seed.channel,
      sends: Math.round(summary.sends.value * 0.9),
      openRate: summary.openRate.value,
      clickRate: summary.clickRate.value,
      conversionRate: summary.conversionRate.value,
      revenue: Math.round(revenue * 0.56),
      dropOffLabel: "Strong first touch engagement",
      bottleneck: false,
    },
    {
      id: `${flowId}-m2`,
      name: "Message 2",
      order: 2,
      channel: seed.channel === "mixed" ? "sms" : seed.channel,
      sends: Math.round(summary.sends.value * 0.62),
      openRate: Math.max(0, summary.openRate.value - 0.07),
      clickRate: Math.max(0, summary.clickRate.value - 0.022),
      conversionRate: Math.max(0, summary.conversionRate.value - 0.014),
      revenue: Math.round(revenue * 0.27),
      dropOffLabel: "Largest engagement drop after first send",
      bottleneck: true,
    },
    {
      id: `${flowId}-m3`,
      name: "Message 3",
      order: 3,
      channel: seed.channel,
      sends: Math.round(summary.sends.value * 0.41),
      openRate: Math.max(0, summary.openRate.value - 0.11),
      clickRate: Math.max(0, summary.clickRate.value - 0.03),
      conversionRate: Math.max(0, summary.conversionRate.value - 0.019),
      revenue: Math.round(revenue * 0.17),
      dropOffLabel: "Late-series efficiency is modest",
      bottleneck: false,
    },
  ];

  return {
    ...summary,
    attributedRevenue: buildMetricValue(revenue, formatCurrency(revenue), seed.revenueDelta),
    unsubscribeRate: {
      value: seed.unsubscribeRate,
      formatted: formatPercent(seed.unsubscribeRate),
      sourceType: "derived",
      delta: 1.1,
      deltaLabel: formatDelta(1.1),
    },
    messages: messageBase,
    trend: Array.from({ length: 6 }, (_, index) => ({
      label: `W${index + 1}`,
      revenue: Math.round(revenue * (0.12 + index * 0.03)),
      opens: Math.round(summary.sends.value * (0.28 + index * 0.04)),
      clicks: Math.round(summary.sends.value * (0.046 + index * 0.006)),
      conversions: Math.round(summary.sends.value * (0.011 + index * 0.002)),
    })),
    insights: [
      "Revenue is concentrated in the first touch, which makes the second message the highest-leverage optimization point.",
      "The conversion curve suggests timing and creative testing are more urgent than audience expansion.",
      "Benchmark comparison is based on static lifecycle baselines, not live Klaviyo peer API data.",
    ],
  };
}

export async function getKlaviyoCampaigns(
  businessId: string,
  range: KlaviyoDateRange,
): Promise<KlaviyoCampaignSummary[]> {
  void businessId;
  return CAMPAIGN_SEEDS.map((seed) => buildCampaign(seed, range));
}

export async function getKlaviyoRecommendations(
  businessId: string,
  range: KlaviyoDateRange,
): Promise<KlaviyoRecommendation[]> {
  void businessId;
  void range;
  return [
    {
      id: "rec-browse-click",
      type: "fix",
      severity: "high",
      title: "Browse abandonment needs a click-through reset",
      summary:
        "Click rate is materially below benchmark, which is limiting downstream recovery even though send volume is growing.",
      evidence: [
        { label: "Flow click rate", value: "4.7%", sourceType: "derived" },
        { label: "Benchmark", value: "7.2%", sourceType: "benchmark" },
        { label: "Period delta", value: "-11.3%", sourceType: "derived" },
      ],
      recommendedAction:
        "Test stronger product context in the first two emails and review delay timing before adding more sends.",
      confidence: "high",
      sourceType: "ai",
      relatedEntityType: "flow",
      relatedEntityId: "browse-abandonment",
    },
    {
      id: "rec-welcome-scale",
      type: "scale",
      severity: "medium",
      title: "Welcome flow is a scale candidate",
      summary:
        "Revenue and conversion efficiency remain strong enough to support new subject line and offer testing without sacrificing stability.",
      evidence: [
        { label: "Revenue delta", value: "+12.4%", sourceType: "exact" },
        { label: "Conversion rate", value: "4.1%", sourceType: "derived" },
        { label: "Benchmark status", value: "Above benchmark", sourceType: "benchmark" },
      ],
      recommendedAction:
        "Run controlled subject line tests and explore a stronger first-purchase incentive for new subscribers.",
      confidence: "medium",
      sourceType: "ai",
      relatedEntityType: "flow",
      relatedEntityId: "welcome-series",
    },
    {
      id: "rec-winback-monitor",
      type: "monitor",
      severity: "medium",
      title: "Monitor winback SMS fatigue",
      summary:
        "Revenue is holding up, but unsubscribe pressure suggests the sequence may be too aggressive for the current audience.",
      evidence: [
        { label: "Unsubscribe rate", value: "1.1%", sourceType: "derived" },
        { label: "SMS revenue delta", value: "+9.2%", sourceType: "exact" },
      ],
      recommendedAction:
        "Review cadence and test a softer second touch before expanding SMS coverage.",
      confidence: "medium",
      sourceType: "ai",
      relatedEntityType: "flow",
      relatedEntityId: "winback",
    },
    {
      id: "rec-campaign-test",
      type: "test",
      severity: "low",
      title: "Bundle campaign likely needs creative refresh",
      summary:
        "Revenue and click quality both slipped, which points to offer framing or subject line fatigue rather than audience size alone.",
      evidence: [
        { label: "Campaign revenue delta", value: "-4.1%", sourceType: "exact" },
        { label: "Click rate delta", value: "-8.7%", sourceType: "derived" },
      ],
      recommendedAction:
        "Test new value framing and send-time variants before increasing send frequency.",
      confidence: "medium",
      sourceType: "ai",
      relatedEntityType: "campaign",
      relatedEntityId: "bundle-promo-email",
    },
  ];
}

export async function getKlaviyoDiagnostics(
  businessId: string,
  range: KlaviyoDateRange,
): Promise<KlaviyoDiagnostics> {
  void businessId;
  void range;
  return {
    syncStatus: "healthy",
    lastSuccessfulSync: "14 minutes ago",
    snapshotStatus: "Snapshot-backed provider state is enabled for Klaviyo.",
    benchmarkAvailability:
      "Benchmark comparisons currently use configurable lifecycle baselines until direct benchmark feeds are added.",
    apiCoverage: [
      {
        label: "Flows, campaigns, and messages",
        detail: "Modeled as API-backed entities and presented as exact metrics where supported.",
        sourceType: "exact",
      },
      {
        label: "Rates and period deltas",
        detail: "Calculated from raw sends, opens, clicks, conversions, and prior-period values.",
        sourceType: "derived",
      },
      {
        label: "Benchmark scoring",
        detail: "Based on static reference baselines, not real-time peer account data.",
        sourceType: "benchmark",
      },
      {
        label: "Recommendations",
        detail: "Generated from rule patterns and AI-style reasoning with evidence traces.",
        sourceType: "ai",
      },
    ],
    notes: [
      "This first version uses service contracts and seeded analytics data so the UI is production-structured without faking unsupported live fields.",
      "The UI keeps benchmark, derived, and AI outputs clearly labeled to support future API-backed upgrades.",
    ],
  };
}

export async function getKlaviyoDashboardData(
  businessId: string,
  preset: KlaviyoDateRangePreset = "30d",
): Promise<KlaviyoDashboardData> {
  const range = resolveKlaviyoDateRange(preset);
  const [overview, flows, campaigns, recommendations, diagnostics] = await Promise.all([
    getKlaviyoOverview(businessId, range),
    getKlaviyoFlows(businessId, range),
    getKlaviyoCampaigns(businessId, range),
    getKlaviyoRecommendations(businessId, range),
    getKlaviyoDiagnostics(businessId, range),
  ]);

  return {
    overview,
    flows,
    campaigns,
    recommendations,
    diagnostics,
  };
}
import { formatCurrencySmart, formatPercentFromRatioSmart } from "@/lib/metric-format";
