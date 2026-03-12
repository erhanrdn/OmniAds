import { getPlan, PlanId, PricingFeature, PricingPlan } from "@/lib/pricing/plans";

type PlanInput = PlanId | PricingPlan;

export function canAccessFeature(plan: PlanInput, feature: PricingFeature): boolean {
  const resolvedPlan = getPlan(plan);
  return resolvedPlan.enabledFeatures.includes(feature);
}

export function canUseAccount(plan: PlanInput, accountCount: number): boolean {
  const resolvedPlan = getPlan(plan);
  const maxAccounts = resolvedPlan.limits.adAccounts;
  if (maxAccounts === null) return true;
  return accountCount <= maxAccounts;
}

