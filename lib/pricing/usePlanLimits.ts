import { ModuleId, PlanId, PLAN_ORDER, PRICING_PLANS, planHasModule, minPlanForModule } from "@/lib/pricing/plans";

export interface PlanLimitResult {
  allowed: boolean;
  reason?: "upgrade_required";
  upgradePlan?: PlanId;
}

export function planRank(plan: PlanId): number {
  return PLAN_ORDER.indexOf(plan);
}

function nextPlan(current: PlanId): PlanId {
  const idx = PLAN_ORDER.indexOf(current);
  return PLAN_ORDER[Math.min(idx + 1, PLAN_ORDER.length - 1)];
}

export function canAccessModule(plan: PlanId, module: ModuleId): PlanLimitResult {
  if (planHasModule(plan, module)) return { allowed: true };
  const required = minPlanForModule(module);
  return { allowed: false, reason: "upgrade_required", upgradePlan: required };
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
  if (limit === null || nextAccountCount <= limit) return { allowed: true };
  return { allowed: false, reason: "upgrade_required", upgradePlan: nextPlan(plan) };
}

export function canConnectStore(
  plan: PlanId,
  nextStoreCount: number
): PlanLimitResult {
  const limit = PRICING_PLANS[plan].limits.storeConnections;
  if (limit === null || nextStoreCount <= limit) return { allowed: true };
  return { allowed: false, reason: "upgrade_required", upgradePlan: nextPlan(plan) };
}

export function canUseExports(plan: PlanId): PlanLimitResult {
  return canAccessModule(plan, "custom_reporting");
}

export function canUseTeamAccess(plan: PlanId): PlanLimitResult {
  return canAccessModule(plan, "team_roles");
}

export function canUseMultiWorkspace(plan: PlanId): PlanLimitResult {
  const limit = PRICING_PLANS[plan].limits.workspaces;
  if (limit === null || limit > 1) return { allowed: true };
  return { allowed: false, reason: "upgrade_required", upgradePlan: "pro" };
}
