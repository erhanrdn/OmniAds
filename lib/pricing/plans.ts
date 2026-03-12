export type PlanId = "starter" | "growth" | "pro" | "scale";

export type PricingFeature =
  | "basic_ad_dashboard"
  | "creative_performance_insights"
  | "copy_performance_insights"
  | "limited_ai_recommendations"
  | "limited_geo_intelligence"
  | "basic_google_ads_insights"
  | "full_ai_recommendations"
  | "search_term_intelligence"
  | "advanced_google_ads_insights"
  | "geo_intelligence_insights"
  | "export_reports"
  | "creative_testing_insights"
  | "advanced_ai_insights"
  | "campaign_optimization_suggestions"
  | "cross_platform_comparison"
  | "advanced_geo_intelligence"
  | "advanced_search_term_analysis"
  | "custom_reporting"
  | "agency_mode"
  | "team_member_roles"
  | "priority_support"
  | "advanced_data_export"
  | "white_label_reports";

export interface PlanLimits {
  adAccounts: number | null;
  analyticsHistoryDays: number | null;
  workspaces: number | null;
  storeConnections: number | null;
}

export interface PricingPlan {
  id: PlanId;
  name: string;
  monthlyPrice: number;
  limits: PlanLimits;
  enabledFeatures: PricingFeature[];
}

export const PRICING_PLANS: Record<PlanId, PricingPlan> = {
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPrice: 0,
    limits: {
      adAccounts: 1,
      analyticsHistoryDays: 14,
      workspaces: 1,
      storeConnections: 1,
    },
    enabledFeatures: [
      "basic_ad_dashboard",
      "creative_performance_insights",
      "copy_performance_insights",
      "limited_ai_recommendations",
      "limited_geo_intelligence",
      "basic_google_ads_insights",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    monthlyPrice: 39,
    limits: {
      adAccounts: 3,
      analyticsHistoryDays: 90,
      workspaces: 1,
      storeConnections: 1,
    },
    enabledFeatures: [
      "basic_ad_dashboard",
      "creative_performance_insights",
      "copy_performance_insights",
      "full_ai_recommendations",
      "search_term_intelligence",
      "advanced_google_ads_insights",
      "geo_intelligence_insights",
      "export_reports",
      "creative_testing_insights",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPrice: 99,
    limits: {
      adAccounts: null,
      analyticsHistoryDays: null,
      workspaces: 3,
      storeConnections: 3,
    },
    enabledFeatures: [
      "basic_ad_dashboard",
      "creative_performance_insights",
      "copy_performance_insights",
      "advanced_ai_insights",
      "campaign_optimization_suggestions",
      "cross_platform_comparison",
      "advanced_geo_intelligence",
      "advanced_search_term_analysis",
      "custom_reporting",
      "export_reports",
      "creative_testing_insights",
      "advanced_google_ads_insights",
    ],
  },
  scale: {
    id: "scale",
    name: "Scale",
    monthlyPrice: 249,
    limits: {
      adAccounts: null,
      analyticsHistoryDays: null,
      workspaces: null,
      storeConnections: null,
    },
    enabledFeatures: [
      "basic_ad_dashboard",
      "creative_performance_insights",
      "copy_performance_insights",
      "advanced_ai_insights",
      "campaign_optimization_suggestions",
      "cross_platform_comparison",
      "advanced_geo_intelligence",
      "advanced_search_term_analysis",
      "custom_reporting",
      "export_reports",
      "creative_testing_insights",
      "advanced_google_ads_insights",
      "agency_mode",
      "team_member_roles",
      "priority_support",
      "advanced_data_export",
      "white_label_reports",
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["starter", "growth", "pro", "scale"];

export function getPlan(plan: PlanId | PricingPlan): PricingPlan {
  return typeof plan === "string" ? PRICING_PLANS[plan] : plan;
}

export interface PricingPlanUiMeta {
  id: PlanId;
  name: string;
  monthlyPrice: number;
  limits: PlanLimits;
  enabledFeatures: PricingFeature[];
}

export const PRICING_PLAN_METADATA: PricingPlanUiMeta[] = PLAN_ORDER.map((id) => {
  const plan = PRICING_PLANS[id];
  return {
    id: plan.id,
    name: plan.name,
    monthlyPrice: plan.monthlyPrice,
    limits: plan.limits,
    enabledFeatures: plan.enabledFeatures,
  };
});

