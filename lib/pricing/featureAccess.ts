import { getPlan, PlanId, ModuleId, PricingPlan, planHasModule } from "@/lib/pricing/plans";

type PlanInput = PlanId | PricingPlan;

export function canAccessModule(plan: PlanInput, module: ModuleId): boolean {
  const resolvedPlan = getPlan(plan);
  return resolvedPlan.modules.includes(module);
}

export function canUseAccount(plan: PlanInput, accountCount: number): boolean {
  const resolvedPlan = getPlan(plan);
  const maxAccounts = resolvedPlan.limits.adAccounts;
  if (maxAccounts === null) return true;
  return accountCount <= maxAccounts;
}
