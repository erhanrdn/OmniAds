"use client";

import { TrendingUp, AlertTriangle, Info } from "lucide-react";
import type { GeoInsight } from "@/lib/geo-intelligence";

export function GeoInsightCallout({ insight }: { insight: GeoInsight }) {
  if (insight.type === "positive") {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-violet-200 bg-violet-50 px-3.5 py-2.5 dark:border-violet-900/50 dark:bg-violet-950/30">
        <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
        <p className="text-sm text-violet-800 dark:text-violet-200">{insight.text}</p>
      </div>
    );
  }
  if (insight.type === "warning") {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/30">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-sm text-amber-800 dark:text-amber-200">{insight.text}</p>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 px-3.5 py-2.5">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{insight.text}</p>
    </div>
  );
}
