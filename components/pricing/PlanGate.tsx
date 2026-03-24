"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { usePlanState } from "@/lib/pricing/usePlan";
import { planRank } from "@/lib/pricing/usePlanLimits";
import { PRICING_PLANS, type PlanId } from "@/lib/pricing/plans";
import { useAppStore } from "@/store/app-store";
import { isDemoBusinessSelected } from "@/lib/business-mode";

const PLAN_LABELS: Record<PlanId, string> = {
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
  scale: "Scale",
};

interface Props {
  requiredPlan: PlanId;
  children: React.ReactNode;
}

export function PlanGate({ requiredPlan, children }: Props) {
  const { plan: currentPlan, isLoading: isPlanLoading, isReady: isPlanReady } = usePlanState();
  const selectedBusinessId = useAppStore((s) => s.selectedBusinessId);
  const businesses = useAppStore((s) => s.businesses);
  const isDemo = isDemoBusinessSelected(selectedBusinessId, businesses);

  if (!selectedBusinessId || isPlanLoading || !isPlanReady) {
    return (
      <div className="flex min-h-[60vh] flex-1 items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading workspace…</div>
      </div>
    );
  }

  if (isDemo || planRank(currentPlan) >= planRank(requiredPlan)) {
    return <>{children}</>;
  }

  const planName = PLAN_LABELS[requiredPlan];
  const price = PRICING_PLANS[requiredPlan].monthlyPrice;

  return (
    <div className="flex flex-1 items-center justify-center min-h-[60vh]">
      <div className="max-w-sm w-full text-center px-6">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">
          {planName} plan required
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          This module is available on the {planName} plan (${price}/mo) and above.
          Upgrade to unlock it for your workspace.
        </p>
        <Link
          href="/settings"
          className="inline-flex items-center justify-center rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:opacity-90 transition-opacity"
        >
          Upgrade to {planName}
        </Link>
      </div>
    </div>
  );
}
