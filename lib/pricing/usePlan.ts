"use client";

import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/store/app-store";
import type { PlanId } from "@/lib/pricing/plans";

async function fetchPlan(businessId: string): Promise<PlanId> {
  const res = await fetch(`/api/billing?businessId=${businessId}`);
  if (!res.ok) return "starter";
  const data = await res.json();
  return (data.planId as PlanId) ?? "starter";
}

export function usePlan(): PlanId {
  return usePlanState().plan;
}

export function usePlanState(): {
  plan: PlanId;
  isLoading: boolean;
  isReady: boolean;
} {
  const businessId = useAppStore((s) => s.selectedBusinessId);
  const hasHydrated = useAppStore((s) => s.hasHydrated);
  const authBootstrapStatus = useAppStore((s) => s.authBootstrapStatus);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["plan", businessId],
    queryFn: () => fetchPlan(businessId!),
    enabled: Boolean(businessId) && hasHydrated && authBootstrapStatus === "ready",
    staleTime: 5 * 60 * 1000,
  });

  const queryReady = Boolean(businessId) && hasHydrated && authBootstrapStatus === "ready";

  return {
    plan: data ?? "starter",
    isLoading: !queryReady || isLoading || isFetching || !data,
    isReady: queryReady && Boolean(data),
  };
}
