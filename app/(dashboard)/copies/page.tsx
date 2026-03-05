"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BUSINESSES, useAppStore } from "@/store/app-store";
import { getCopies } from "@/src/services";
import { Copy, Platform } from "@/src/types";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { ErrorState } from "@/components/states/error-state";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

type DateRangeFilter = "7d" | "30d";
type ObjectiveFilter = "all" | Copy["objective"];

const PLATFORM_OPTIONS: Array<{ value: "all" | Platform; label: string }> = [
  { value: "all", label: "All platforms" },
  { value: Platform.META, label: "Meta" },
  { value: Platform.GOOGLE, label: "Google" },
  { value: Platform.TIKTOK, label: "TikTok" },
  { value: Platform.PINTEREST, label: "Pinterest" },
  { value: Platform.SNAPCHAT, label: "Snapchat" },
];

export default function CopiesPage() {
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businessId = selectedBusinessId ?? BUSINESSES[0].id;

  const [platform, setPlatform] = useState<"all" | Platform>("all");
  const [dateRange, setDateRange] = useState<DateRangeFilter>("30d");
  const [objective, setObjective] = useState<ObjectiveFilter>("all");
  const [selectedCopy, setSelectedCopy] = useState<Copy | null>(null);

  const query = useQuery({
    queryKey: ["copies", businessId, platform, dateRange, objective],
    queryFn: () =>
      getCopies(businessId, {
        platform: platform === "all" ? undefined : platform,
        dateRange,
        objective,
      }),
  });

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Copies</h1>
        <p className="text-sm text-muted-foreground">
          Compare copy performance and inspect usage across campaign structure.
        </p>
      </div>

      <section className="rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={platform}
            onChange={(event) => setPlatform(event.target.value as "all" | Platform)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            {PLATFORM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="inline-flex rounded-md border bg-muted/40 p-1">
            {(["7d", "30d"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setDateRange(item)}
                className={`rounded px-2.5 py-1 text-xs font-medium uppercase ${
                  dateRange === item
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          <select
            value={objective}
            onChange={(event) => setObjective(event.target.value as ObjectiveFilter)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">All objectives</option>
            <option value="awareness">Awareness</option>
            <option value="traffic">Traffic</option>
            <option value="conversions">Conversions</option>
          </select>
        </div>
      </section>

      {query.isLoading && <LoadingSkeleton rows={4} />}
      {query.isError && <ErrorState onRetry={() => query.refetch()} />}
      {!query.isLoading && !query.isError && (query.data?.length ?? 0) === 0 && (
        <EmptyState title="No copy found" description="No rows match current filters." />
      )}

      {!query.isLoading && !query.isError && (query.data?.length ?? 0) > 0 && (
        <section className="space-y-3">
          {query.data?.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedCopy(item)}
              className="w-full rounded-xl border bg-card p-4 text-left transition-shadow hover:shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">{item.snippet}</p>
                  <h3 className="mt-1 text-base font-semibold">{item.headline}</h3>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {item.platform}
                    </Badge>
                    <Badge variant="outline" className="capitalize">
                      {item.objective}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <Metric label="Usage" value={item.usageCount.toLocaleString()} />
                  <Metric label="Spend" value={`$${item.spend.toLocaleString()}`} />
                  <Metric label="ROAS" value={item.roas.toFixed(2)} />
                  <Metric label="CTR" value={`${item.ctr.toFixed(2)}%`} />
                </div>
              </div>
            </button>
          ))}
        </section>
      )}

      {selectedCopy && (
        <div className="fixed inset-0 z-50 bg-black/35">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setSelectedCopy(null)}
            aria-label="Close drawer overlay"
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l bg-background p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Copy Detail</h2>
              <button
                type="button"
                onClick={() => setSelectedCopy(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label="Close drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 rounded-xl border p-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Headline
                </p>
                <p className="mt-1 text-base font-semibold">{selectedCopy.headline}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Full Text
                </p>
                <p className="mt-1 text-sm leading-6">{selectedCopy.fullText}</p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Used In
              </h3>
              <div className="mt-2">
                <p className="text-xs text-muted-foreground">Campaigns</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {selectedCopy.usedIn.campaigns.map((item) => (
                    <Badge key={item} variant="outline">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="mt-3">
                <p className="text-xs text-muted-foreground">Ads</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {selectedCopy.usedIn.ads.map((item) => (
                    <Badge key={item} variant="outline">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-xl border p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Similar Copies
              </h3>
              <div className="mt-2 space-y-2">
                {selectedCopy.similarCopies.map((item) => (
                  <p key={item} className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                    {item}
                  </p>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
