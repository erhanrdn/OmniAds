"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function MetricLoadingCard() {
  return (
    <article className="rounded-2xl border bg-card p-5 shadow-sm">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-3 h-9 w-28" />
      <Skeleton className="mt-4 h-4 w-36" />
    </article>
  );
}
