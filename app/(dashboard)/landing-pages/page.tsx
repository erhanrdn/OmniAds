"use client";

import { useState } from "react";
import { useCurrencySymbol } from "@/hooks/use-currency";
import { useQuery } from "@tanstack/react-query";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { useAppStore } from "@/store/app-store";
import { getLandingPages } from "@/src/services";
import { LandingPage, Platform } from "@/src/types";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { ErrorState } from "@/components/states/error-state";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

type DateRangeFilter = "7d" | "30d";

const PLATFORM_OPTIONS: Array<{ value: "all" | Platform; label: string }> = [
  { value: "all", label: "All platforms" },
  { value: Platform.META, label: "Meta" },
  { value: Platform.GOOGLE, label: "Google" },
  { value: Platform.TIKTOK, label: "TikTok" },
  { value: Platform.PINTEREST, label: "Pinterest" },
  { value: Platform.SNAPCHAT, label: "Snapchat" },
];

export default function LandingPagesPage() {
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businessId = selectedBusinessId ?? "";
  const sym = useCurrencySymbol();

  const [platform, setPlatform] = useState<"all" | Platform>("all");
  const [dateRange, setDateRange] = useState<DateRangeFilter>("30d");
  const [search, setSearch] = useState("");
  const [selectedRow, setSelectedRow] = useState<LandingPage | null>(null);

  const query = useQuery({
    queryKey: ["landing-pages", businessId, platform, dateRange, search],
    enabled: Boolean(selectedBusinessId),
    queryFn: () =>
      getLandingPages(businessId, {
        platform: platform === "all" ? undefined : platform,
        dateRange,
        search: search.trim() || undefined,
      }),
  });

  if (!selectedBusinessId) return <BusinessEmptyState />;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Landing Pages</h1>
        <p className="text-sm text-muted-foreground">
          Track page efficiency and inspect traffic sources from creatives and copies.
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

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by URL or name"
            className="h-9 min-w-64 flex-1 rounded-md border bg-background px-3 text-sm"
          />
        </div>
      </section>

      {query.isLoading && <LoadingSkeleton rows={4} />}
      {query.isError && <ErrorState onRetry={() => query.refetch()} />}
      {!query.isLoading && !query.isError && (query.data?.length ?? 0) === 0 && (
        <EmptyState
          title="No landing pages found"
          description="Try changing date range or clearing filters."
        />
      )}

      {!query.isLoading && !query.isError && (query.data?.length ?? 0) > 0 && (
        <section className="overflow-x-auto rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/45 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">URL</th>
                <th className="px-4 py-3 font-medium">Clicks</th>
                <th className="px-4 py-3 font-medium">Sessions</th>
                <th className="px-4 py-3 font-medium">Purchases</th>
                <th className="px-4 py-3 font-medium">Revenue</th>
                <th className="px-4 py-3 font-medium">ROAS</th>
                <th className="px-4 py-3 font-medium">Conversion Rate</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-t transition-colors hover:bg-muted/25"
                  onClick={() => setSelectedRow(row)}
                >
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{row.url}</p>
                      <Badge variant="secondary" className="capitalize">
                        {row.platform}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3">{row.clicks.toLocaleString()}</td>
                  <td className="px-4 py-3">{row.sessions.toLocaleString()}</td>
                  <td className="px-4 py-3">{row.purchases.toLocaleString()}</td>
                  <td className="px-4 py-3">{sym}{row.revenue.toLocaleString()}</td>
                  <td className="px-4 py-3">{row.roas.toFixed(2)}</td>
                  <td className="px-4 py-3">{row.conversionRate.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {selectedRow && (
        <div className="fixed inset-0 z-50 bg-black/35">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setSelectedRow(null)}
            aria-label="Close drawer overlay"
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l bg-background p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Landing Page Detail</h2>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label="Close drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 rounded-xl border p-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  URL
                </p>
                <p className="mt-1 break-all text-sm font-medium">{selectedRow.url}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  UTM Placeholder
                </p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {selectedRow.utmPlaceholder}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Top Creatives Sending Traffic
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedRow.topCreatives.map((item) => (
                  <Badge key={item} variant="outline">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-xl border p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Top Copies
              </h3>
              <div className="mt-2 space-y-2">
                {selectedRow.topCopies.map((copy) => (
                  <p key={copy} className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                    {copy}
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
