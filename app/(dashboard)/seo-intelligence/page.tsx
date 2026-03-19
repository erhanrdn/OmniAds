"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import {
  DateRangePicker,
  getPresetDates,
} from "@/components/date-range/DateRangePicker";
import { IntegrationEmptyState } from "@/components/states/IntegrationEmptyState";
import { ErrorState } from "@/components/states/error-state";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { usePersistentDateRange } from "@/hooks/use-persistent-date-range";
import { useAppStore } from "@/store/app-store";
import { useIntegrationsStore } from "@/store/integrations-store";
import { cn } from "@/lib/utils";
import {
  AiBriefCard,
  CauseCards,
  EntityTable,
  RecommendationsList,
  SectionIntro,
  SeoKpiCard,
  type SeoOverviewResponse,
  SEO_TABS,
  type SeoTab,
} from "@/app/(dashboard)/seo-intelligence/seo-intelligence-support";

async function fetchSeoOverview(params: {
  businessId: string;
  startDate: string;
  endDate: string;
}): Promise<SeoOverviewResponse> {
  const qs = new URLSearchParams(params).toString();
  const response = await fetch(`/api/seo/overview?${qs}`);
  const payload = (await response.json().catch(() => null)) as
    | { message?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.message ?? "Failed to load SEO Intelligence.");
  }

  return payload as SeoOverviewResponse;
}

export default function SeoIntelligencePage() {
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businessId = selectedBusinessId ?? "";

  const ensureBusiness = useIntegrationsStore((state) => state.ensureBusiness);
  const byBusinessId = useIntegrationsStore((state) => state.byBusinessId);

  useEffect(() => {
    if (!selectedBusinessId) return;
    ensureBusiness(businessId);
  }, [businessId, ensureBusiness, selectedBusinessId]);

  const [activeTab, setActiveTab] = useState<SeoTab>("overview");
  const [dateRange, setDateRange] = usePersistentDateRange();

  const { start: startDate, end: endDate } = getPresetDates(
    dateRange.rangePreset,
    dateRange.customStart,
    dateRange.customEnd,
  );

  const searchConsoleStatus = byBusinessId[businessId]?.search_console?.status;
  const searchConsoleConnected = searchConsoleStatus === "connected";

  const overviewQuery = useQuery({
    queryKey: ["seo-overview", businessId, startDate, endDate],
    enabled: searchConsoleConnected && Boolean(businessId),
    queryFn: () => fetchSeoOverview({ businessId, startDate, endDate }),
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (!selectedBusinessId) return <BusinessEmptyState />;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">SEO Intelligence</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Monitor organic search volatility, isolate likely causes, and prioritize technical or
            content fixes using Search Console-backed intelligence.
          </p>
        </div>
      </header>

      {!searchConsoleConnected && (
        <IntegrationEmptyState
          providerLabel="Search Console"
          status={searchConsoleStatus}
          title="Connect Search Console to unlock SEO Intelligence"
          description="Track organic trend shifts, query volatility, page-level losses, and action recommendations once Search Console is connected and a site is selected."
        />
      )}

      {searchConsoleConnected && (
        <>
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <DateRangePicker value={dateRange} onChange={setDateRange} />
            </div>
          </section>

          {overviewQuery.isLoading && <LoadingSkeleton rows={4} />}

          {overviewQuery.error && (
            <ErrorState
              description={
                overviewQuery.error instanceof Error
                  ? overviewQuery.error.message
                  : "Failed to load SEO Intelligence."
              }
              onRetry={() => overviewQuery.refetch()}
            />
          )}

          {overviewQuery.data && (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SeoKpiCard
                  label="Organic Clicks"
                  current={overviewQuery.data.summary.clicks.current}
                  previous={overviewQuery.data.summary.clicks.previous}
                  deltaPercent={overviewQuery.data.summary.clicks.deltaPercent}
                  mode="number"
                />
                <SeoKpiCard
                  label="Impressions"
                  current={overviewQuery.data.summary.impressions.current}
                  previous={overviewQuery.data.summary.impressions.previous}
                  deltaPercent={overviewQuery.data.summary.impressions.deltaPercent}
                  mode="number"
                />
                <SeoKpiCard
                  label="CTR"
                  current={overviewQuery.data.summary.ctr.current}
                  previous={overviewQuery.data.summary.ctr.previous}
                  deltaPercent={overviewQuery.data.summary.ctr.deltaPercent}
                  mode="percent"
                />
                <SeoKpiCard
                  label="Average Position"
                  current={overviewQuery.data.summary.position.current}
                  previous={overviewQuery.data.summary.position.previous}
                  deltaPercent={overviewQuery.data.summary.position.deltaPercent}
                  mode="position"
                  invertDelta
                />
              </div>

              <AiBriefCard brief={overviewQuery.data.aiBrief} />

              <div className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1 shadow-sm">
                {SEO_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
                      activeTab === tab.id
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
                {activeTab === "overview" && (
                  <>
                    <SectionIntro
                      title="Root cause candidates"
                      description="These are the strongest patterns behind recent organic search movement based on clicks, impressions, CTR, and average position."
                    />
                    <CauseCards causes={overviewQuery.data.causes} />
                  </>
                )}

                {activeTab === "traffic" && (
                  <>
                    <SectionIntro
                      title="Traffic changes"
                      description="Focus first on the biggest losing queries and pages, then protect the strongest improving clusters."
                    />
                    <div className="grid gap-4 xl:grid-cols-2">
                      <EntityTable
                        title="Biggest declining queries"
                        rows={overviewQuery.data.movers.decliningQueries}
                        emptyLabel="No declining queries in this period."
                      />
                      <EntityTable
                        title="Biggest declining pages"
                        rows={overviewQuery.data.movers.decliningPages}
                        emptyLabel="No declining pages in this period."
                      />
                      <EntityTable
                        title="Improving queries"
                        rows={overviewQuery.data.movers.improvingQueries}
                        emptyLabel="No improving queries in this period."
                      />
                      <EntityTable
                        title="Improving pages"
                        rows={overviewQuery.data.movers.improvingPages}
                        emptyLabel="No improving pages in this period."
                      />
                    </div>
                  </>
                )}

                {activeTab === "queries" && (
                  <>
                    <SectionIntro
                      title="Query leaders"
                      description="These queries currently anchor your organic search visibility and should be monitored first when performance shifts."
                    />
                    <EntityTable
                      title="Top queries by clicks"
                      rows={overviewQuery.data.leaders.queries}
                      emptyLabel="No query data available for this period."
                    />
                  </>
                )}

                {activeTab === "pages" && (
                  <>
                    <SectionIntro
                      title="Page leaders"
                      description="These landing pages carry the most organic search value and are the best starting point for technical or snippet-level analysis."
                    />
                    <EntityTable
                      title="Top pages by clicks"
                      rows={overviewQuery.data.leaders.pages}
                      emptyLabel="No page data available for this period."
                    />
                  </>
                )}

                {activeTab === "actions" && (
                  <>
                    <SectionIntro
                      title="Recommended actions"
                      description="Start with the lowest-effort, highest-impact fixes tied to the strongest decline patterns."
                    />
                    <RecommendationsList recommendations={overviewQuery.data.recommendations} />
                  </>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
