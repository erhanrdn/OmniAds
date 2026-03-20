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
  const businessId = useAppStore((s) => s.selectedBusinessId);

  const { data } = useQuery({
    queryKey: ["plan", businessId],
    queryFn: () => fetchPlan(businessId!),
    enabled: Boolean(businessId),
    staleTime: 5 * 60 * 1000,
  });

  return data ?? "starter";
}
