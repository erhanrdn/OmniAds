"use client";

import { useMemo } from "react";
import { PlanId, ModuleId } from "@/lib/pricing/plans";
import { PlanLimitResult, canAccessModule, canConnectAdAccount, canUseExports, canUseMultiWorkspace, canUseTeamAccess } from "@/lib/pricing/usePlanLimits";

export type SubscriptionFeatureName =
  | "connect_ad_accounts"
  | "export_reports"
  | "team_access"
  | "multi_workspace";

export interface FeatureAccessOptions {
  accountCount?: number;
  module?: ModuleId;
}

export interface FeatureAccessResult extends PlanLimitResult {
  feature: SubscriptionFeatureName | "module";
  plan: PlanId;
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
    case "export_reports": {
      return { ...canUseExports(plan), feature, plan };
    }
    case "team_access": {
      return { ...canUseTeamAccess(plan), feature, plan };
    }
    case "multi_workspace": {
      return { ...canUseMultiWorkspace(plan), feature, plan };
    }
    default:
      return { allowed: false, reason: "upgrade_required", upgradePlan: "growth", feature, plan };
  }
}

export function usePlanAccess(
  feature: SubscriptionFeatureName,
  plan: PlanId = DEFAULT_PLAN,
  options: FeatureAccessOptions = {}
): FeatureAccessResult {
  return useMemo(
    () => getPlanAccess(feature, plan, options),
    [feature, plan, options.accountCount]
  );
}
