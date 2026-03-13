export type KlaviyoSourceType = "exact" | "derived" | "benchmark" | "ai";

export type KlaviyoRecommendationType = "scale" | "fix" | "test" | "monitor";

export type KlaviyoSeverity = "high" | "medium" | "low";

export type KlaviyoConfidence = "high" | "medium" | "low";

export type KlaviyoBenchmarkStatus =
  | "above"
  | "near"
  | "below"
  | "significantly_below";

export type KlaviyoHealthStatus = "healthy" | "watch" | "risk";

export type KlaviyoChannel = "email" | "sms" | "mixed";

export type KlaviyoDateRangePreset = "7d" | "14d" | "30d" | "90d" | "custom";

export interface KlaviyoDateRange {
  preset: KlaviyoDateRangePreset;
  label: string;
  days: number;
}

export interface KlaviyoMetricValue {
  value: number;
  formatted: string;
  sourceType: KlaviyoSourceType;
  delta?: number;
  deltaLabel?: string;
}

export interface KlaviyoBenchmarkReference {
  metric: string;
  label: string;
  baseline: number;
  baselineLabel: string;
  status: KlaviyoBenchmarkStatus;
  sourceType: "benchmark";
}

export interface KlaviyoTrendPoint {
  label: string;
  revenue: number;
  opens: number;
  clicks: number;
  conversions: number;
}

export interface KlaviyoMessagePerformance {
  id: string;
  name: string;
  order: number;
  channel: KlaviyoChannel;
  sends: number;
  openRate: number;
  clickRate: number;
  conversionRate: number;
  revenue: number;
  dropOffLabel: string;
  bottleneck: boolean;
}

export interface KlaviyoFlowSummary {
  id: string;
  name: string;
  flowType: string;
  channel: KlaviyoChannel;
  status: KlaviyoHealthStatus;
  revenue: KlaviyoMetricValue;
  sends: KlaviyoMetricValue;
  openRate: KlaviyoMetricValue;
  clickRate: KlaviyoMetricValue;
  conversionRate: KlaviyoMetricValue;
  benchmark: KlaviyoBenchmarkReference;
  warning?: string;
}

export interface KlaviyoFlowDetail extends KlaviyoFlowSummary {
  attributedRevenue: KlaviyoMetricValue;
  unsubscribeRate: KlaviyoMetricValue;
  messages: KlaviyoMessagePerformance[];
  trend: KlaviyoTrendPoint[];
  insights: string[];
}

export interface KlaviyoCampaignSummary {
  id: string;
  name: string;
  channel: KlaviyoChannel;
  sentAtLabel: string;
  audienceLabel: string;
  revenue: KlaviyoMetricValue;
  openRate: KlaviyoMetricValue;
  clickRate: KlaviyoMetricValue;
  conversionRate: KlaviyoMetricValue;
  benchmark: KlaviyoBenchmarkReference;
}

export interface KlaviyoRecommendation {
  id: string;
  type: KlaviyoRecommendationType;
  severity: KlaviyoSeverity;
  title: string;
  summary: string;
  evidence: Array<{
    label: string;
    value: string;
    sourceType: KlaviyoSourceType;
  }>;
  recommendedAction: string;
  confidence: KlaviyoConfidence;
  sourceType: KlaviyoSourceType;
  relatedEntityType: "overview" | "flow" | "campaign" | "message";
  relatedEntityId?: string;
}

export interface KlaviyoOverview {
  dateRange: KlaviyoDateRange;
  compareLabel: string;
  attributedRevenue: KlaviyoMetricValue;
  flowRevenue: KlaviyoMetricValue;
  campaignRevenue: KlaviyoMetricValue;
  emailRevenueShare: KlaviyoMetricValue;
  smsRevenueShare: KlaviyoMetricValue;
  benchmarkSummary: string;
  healthSummary: string;
  warnings: string[];
  opportunities: string[];
}

export interface KlaviyoDiagnostics {
  syncStatus: "healthy" | "delayed" | "attention";
  lastSuccessfulSync: string;
  snapshotStatus: string;
  benchmarkAvailability: string;
  apiCoverage: Array<{
    label: string;
    detail: string;
    sourceType: KlaviyoSourceType;
  }>;
  notes: string[];
}

export interface KlaviyoDashboardData {
  overview: KlaviyoOverview;
  flows: KlaviyoFlowSummary[];
  campaigns: KlaviyoCampaignSummary[];
  recommendations: KlaviyoRecommendation[];
  diagnostics: KlaviyoDiagnostics;
}
