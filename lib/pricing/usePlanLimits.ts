import { PlanId, PRICING_PLANS } from "@/lib/pricing/plans";

export type UpgradePlanName = "Growth" | "Pro" | "Scale";

export interface PlanLimitResult {
  allowed: boolean;
  reason?: "upgrade_required";
  upgradePlan?: UpgradePlanName;
}

function planRank(plan: PlanId): number {
  if (plan === "starter") return 0;
  if (plan === "growth") return 1;
  if (plan === "pro") return 2;
  return 3;
}

function upgradePlanName(plan: PlanId): UpgradePlanName {
  if (plan === "growth") return "Growth";
  if (plan === "pro") return "Pro";
  return "Scale";
}

export function getMaxAdAccounts(plan: PlanId): number | null {
  return PRICING_PLANS[plan].limits.adAccounts;
}

export function getHistoryDaysLimit(plan: PlanId): number | null {
  return PRICING_PLANS[plan].limits.analyticsHistoryDays;
}

export function canConnectAdAccount(
  plan: PlanId,
  nextAccountCount: number
): PlanLimitResult {
  const limit = getMaxAdAccounts(plan);
  if (limit === null || nextAccountCount <= limit) {
    return { allowed: true };
  }

  const upgradePlan: UpgradePlanName = nextAccountCount <= 3 ? "Growth" : "Pro";
  return { allowed: false, reason: "upgrade_required", upgradePlan };
}

export function canViewAnalyticsHistory(
  plan: PlanId,
  requestedDays: number
): PlanLimitResult {
  const limit = getHistoryDaysLimit(plan);
  if (limit === null || requestedDays <= limit) {
    return { allowed: true };
  }

  const upgradePlan: UpgradePlanName = requestedDays <= 90 ? "Growth" : "Pro";
  return { allowed: false, reason: "upgrade_required", upgradePlan };
}

export function canUseExports(plan: PlanId): PlanLimitResult {
  if (plan === "starter") {
    return { allowed: false, reason: "upgrade_required", upgradePlan: "Growth" };
  }
  return { allowed: true };
}

export type CapabilityLevel = "none" | "limited" | "full";

export function getAiRecommendationCapability(plan: PlanId): CapabilityLevel {
  if (plan === "starter") return "limited";
  if (plan === "growth") return "full";
  if (plan === "pro") return "full";
  return "full";
}

export function getAutomationInsightsCapability(plan: PlanId): CapabilityLevel {
  if (plan === "starter") return "none";
  if (plan === "growth") return "limited";
  if (plan === "pro") return "full";
  return "full";
}

export function getGeoIntelligenceCapability(plan: PlanId): CapabilityLevel {
  if (plan === "starter") return "limited";
  if (plan === "growth") return "full";
  if (plan === "pro") return "full";
  return "full";
}

export function canUseTeamAccess(plan: PlanId): PlanLimitResult {
  if (planRank(plan) < planRank("scale")) {
    return { allowed: false, reason: "upgrade_required", upgradePlan: "Scale" };
  }
  return { allowed: true };
}

export function canUseMultiWorkspace(plan: PlanId): PlanLimitResult {
  if (planRank(plan) < planRank("scale")) {
    return { allowed: false, reason: "upgrade_required", upgradePlan: "Scale" };
  }
  return { allowed: true };
}

export function canUseAutomationInsights(
  plan: PlanId,
  requiredLevel: Exclude<CapabilityLevel, "none"> = "limited"
): PlanLimitResult {
  const current = getAutomationInsightsCapability(plan);
  if (requiredLevel === "limited") {
    if (current === "limited" || current === "full") return { allowed: true };
    return { allowed: false, reason: "upgrade_required", upgradePlan: "Growth" };
  }
  if (current === "full") return { allowed: true };
  return { allowed: false, reason: "upgrade_required", upgradePlan: "Pro" };
}

export function canUseAiRecommendations(
  plan: PlanId,
  requiredLevel: Exclude<CapabilityLevel, "none"> = "limited"
): PlanLimitResult {
  const current = getAiRecommendationCapability(plan);
  if (requiredLevel === "limited") {
    if (current === "limited" || current === "full") return { allowed: true };
    return { allowed: false, reason: "upgrade_required", upgradePlan: "Growth" };
  }
  if (current === "full") return { allowed: true };
  return { allowed: false, reason: "upgrade_required", upgradePlan: "Growth" };
}

export function canUseGeoIntelligence(
  plan: PlanId,
  requiredLevel: Exclude<CapabilityLevel, "none"> = "limited"
): PlanLimitResult {
  const current = getGeoIntelligenceCapability(plan);
  if (requiredLevel === "limited") {
    if (current === "limited" || current === "full") return { allowed: true };
    return { allowed: false, reason: "upgrade_required", upgradePlan: "Growth" };
  }
  if (current === "full") return { allowed: true };
  return { allowed: false, reason: "upgrade_required", upgradePlan: "Growth" };
}

