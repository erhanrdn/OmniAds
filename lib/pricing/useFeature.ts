"use client";

import { useMemo } from "react";
import { PlanId } from "@/lib/pricing/plans";
import {
  CapabilityLevel,
  PlanLimitResult,
  getAiRecommendationCapability,
  getAutomationInsightsCapability,
  getGeoIntelligenceCapability,
  canConnectAdAccount,
  canViewAnalyticsHistory,
  canUseAiRecommendations,
  canUseAutomationInsights,
  canUseExports,
  canUseGeoIntelligence,
  canUseMultiWorkspace,
  canUseTeamAccess,
} from "@/lib/pricing/usePlanLimits";

export type SubscriptionFeatureName =
  | "connect_ad_accounts"
  | "analytics_history"
  | "ai_recommendations"
  | "export_reports"
  | "geo_intelligence"
  | "automation_insights"
  | "team_access"
  | "multi_workspace";

export interface FeatureAccessOptions {
  accountCount?: number;
  requestedHistoryDays?: number;
  requiredAiLevel?: Exclude<CapabilityLevel, "none">;
  requiredGeoLevel?: Exclude<CapabilityLevel, "none">;
  requiredAutomationLevel?: Exclude<CapabilityLevel, "none">;
}

export interface FeatureAccessResult extends PlanLimitResult {
  feature: SubscriptionFeatureName;
  plan: PlanId;
  capabilities?: {
    aiRecommendations?: CapabilityLevel;
    geoIntelligence?: CapabilityLevel;
    automationInsights?: CapabilityLevel;
  };
}

const DEFAULT_PLAN: PlanId = "starter";

export function getPlanAccess(
  feature: SubscriptionFeatureName,
  plan: PlanId = DEFAULT_PLAN,
  options: FeatureAccessOptions = {}
): FeatureAccessResult {
  switch (feature) {
    case "connect_ad_accounts": {
      const count = options.accountCount ?? 1;
      return { ...canConnectAdAccount(plan, count), feature, plan };
    }
    case "analytics_history": {
      const days = options.requestedHistoryDays ?? 14;
      return { ...canViewAnalyticsHistory(plan, days), feature, plan };
    }
    case "ai_recommendations": {
      const requiredLevel = options.requiredAiLevel ?? "limited";
      return {
        ...canUseAiRecommendations(plan, requiredLevel),
        feature,
        plan,
        capabilities: { aiRecommendations: getAiRecommendationCapability(plan) },
      };
    }
    case "export_reports": {
      return { ...canUseExports(plan), feature, plan };
    }
    case "geo_intelligence": {
      const requiredLevel = options.requiredGeoLevel ?? "limited";
      return {
        ...canUseGeoIntelligence(plan, requiredLevel),
        feature,
        plan,
        capabilities: { geoIntelligence: getGeoIntelligenceCapability(plan) },
      };
    }
    case "automation_insights": {
      const requiredLevel = options.requiredAutomationLevel ?? "limited";
      return {
        ...canUseAutomationInsights(plan, requiredLevel),
        feature,
        plan,
        capabilities: { automationInsights: getAutomationInsightsCapability(plan) },
      };
    }
    case "team_access": {
      return { ...canUseTeamAccess(plan), feature, plan };
    }
    case "multi_workspace": {
      return { ...canUseMultiWorkspace(plan), feature, plan };
    }
    default:
      return {
        allowed: false,
        reason: "upgrade_required",
        upgradePlan: "Growth",
        feature,
        plan,
      };
  }
}

export function usePlanAccess(
  feature: SubscriptionFeatureName,
  plan: PlanId = DEFAULT_PLAN,
  options: FeatureAccessOptions = {}
): FeatureAccessResult {
  return useMemo(
    () => getPlanAccess(feature, plan, options),
    [
      feature,
      plan,
      options.accountCount,
      options.requestedHistoryDays,
      options.requiredAiLevel,
      options.requiredGeoLevel,
      options.requiredAutomationLevel,
    ]
  );
}

