"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { useAppStore } from "@/store/app-store";
import { useIntegrationsStore } from "@/store/integrations-store";
import { IntegrationEmptyState } from "@/components/states/IntegrationEmptyState";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { DataEmptyState } from "@/components/states/DataEmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useRouter } from "next/navigation";
import type { MetaCampaignRow } from "@/app/api/meta/campaigns/route";
import type { MetaBreakdownsResponse } from "@/app/api/meta/breakdowns/route";
import {
  DateRangePicker,
  DateRangeValue,
  DEFAULT_DATE_RANGE,
  getPresetDates,
} from "@/components/date-range/DateRangePicker";

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchMetaCampaigns(
  businessId: string,
  startDate: string,
  endDate: string
): Promise<{ status?: string; rows: MetaCampaignRow[] }> {
  const params = new URLSearchParams({ businessId, startDate, endDate });
  const res = await fetch(`/api/meta/campaigns?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return payload as { status?: string; rows: MetaCampaignRow[] };
}

async function fetchMetaBreakdowns(
  businessId: string,
  startDate: string,
  endDate: string
): Promise<MetaBreakdownsResponse> {
  const params = new URLSearchParams({ businessId, startDate, endDate });
  const res = await fetch(`/api/meta/breakdowns?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return payload as MetaBreakdownsResponse;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NoAccountsAssigned() {
  const router = useRouter();
  return (
    <div className="rounded-xl border border-dashed p-8 text-center">
      <p className="text-sm font-medium">No Meta ad accounts assigned</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Assign one or more Meta ad accounts to this business to view campaign performance.
      </p>
      <Button className="mt-4" variant="outline" onClick={() => router.push("/integrations")}>
        Open Integrations
      </Button>
    </div>
  );
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm font-medium text-destructive">Could not load data</p>
      <p className="mt-1 text-xs text-destructive/80">{message}</p>
      <Button className="mt-3" variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

// ── Campaign Performance ──────────────────────────────────────────────────────

function CampaignTable({
  rows,
  onRowClick,
}: {
  rows: MetaCampaignRow[];
  onRowClick: (row: MetaCampaignRow) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/45 text-left">
          <tr>
            <th className="px-3 py-3 font-medium">Campaign</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="px-3 py-3 font-medium">Spend</th>
            <th className="px-3 py-3 font-medium">Purchases</th>
            <th className="px-3 py-3 font-medium">Revenue</th>
            <th className="px-3 py-3 font-medium">ROAS</th>
            <th className="px-3 py-3 font-medium">CPA</th>
            <th className="px-3 py-3 font-medium">CTR</th>
            <th className="px-3 py-3 font-medium">CPM</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer border-t hover:bg-muted/25"
              onClick={() => onRowClick(row)}
            >
              <td className="px-3 py-3 font-medium">{row.name}</td>
              <td className="px-3 py-3">
                <CampaignStatusBadge status={row.status} />
              </td>
              <td className="px-3 py-3">{fmt$(row.spend)}</td>
              <td className="px-3 py-3">{row.purchases.toLocaleString()}</td>
              <td className="px-3 py-3">{fmt$(row.revenue)}</td>
              <td className="px-3 py-3">{row.roas.toFixed(2)}</td>
              <td className="px-3 py-3">{fmt$(row.cpa)}</td>
              <td className="px-3 py-3">{row.ctr.toFixed(2)}%</td>
              <td className="px-3 py-3">{fmt$(row.cpm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CampaignStatusBadge({ status }: { status: string }) {
  const lower = status.toLowerCase();
  if (lower === "active") return <Badge>active</Badge>;
  if (lower === "paused") return <Badge variant="secondary">paused</Badge>;
  if (lower === "archived") return <Badge variant="outline">archived</Badge>;
  return <Badge variant="outline">{status.toLowerCase()}</Badge>;
}

// ── Performance Breakdowns ───────────────────────────────────────────────────

function pct(part: number, whole: number): string {
  if (whole <= 0) return "0.0%";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function BreakdownCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function BreakdownTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<string>>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/45 text-left">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row[0]}_${idx}`} className="border-t">
              {row.map((cell, cellIdx) => (
                <td key={`${row[0]}_${cellIdx}`} className={cellIdx === 0 ? "px-3 py-2 font-medium" : "px-3 py-2"}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BreakdownUnavailable({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

// ── Drawer ────────────────────────────────────────────────────────────────────

type DrawerPayload =
  | { type: "campaign"; data: MetaCampaignRow }
  | null;

function MetaDrawer({ payload, onClose }: { payload: DrawerPayload; onClose: () => void }) {
  return (
    <Sheet open={Boolean(payload)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        {payload?.type === "campaign" && (
          <>
            <SheetHeader className="mb-4">
              <SheetTitle>{payload.data.name}</SheetTitle>
              <SheetDescription>Campaign performance detail</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 pb-6">
              <section className="rounded-xl border p-4">
                <h3 className="text-sm font-semibold">Metrics</h3>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div><dt className="text-muted-foreground">Spend</dt><dd>{fmt$(payload.data.spend)}</dd></div>
                  <div><dt className="text-muted-foreground">Revenue</dt><dd>{fmt$(payload.data.revenue)}</dd></div>
                  <div><dt className="text-muted-foreground">ROAS</dt><dd>{payload.data.roas.toFixed(2)}</dd></div>
                  <div><dt className="text-muted-foreground">Purchases</dt><dd>{payload.data.purchases.toLocaleString()}</dd></div>
                  <div><dt className="text-muted-foreground">CPA</dt><dd>{fmt$(payload.data.cpa)}</dd></div>
                  <div><dt className="text-muted-foreground">CTR</dt><dd>{payload.data.ctr.toFixed(2)}%</dd></div>
                  <div><dt className="text-muted-foreground">CPM</dt><dd>{fmt$(payload.data.cpm)}</dd></div>
                  <div><dt className="text-muted-foreground">Impressions</dt><dd>{payload.data.impressions.toLocaleString()}</dd></div>
                  <div><dt className="text-muted-foreground">Clicks</dt><dd>{payload.data.clicks.toLocaleString()}</dd></div>
                  <div><dt className="text-muted-foreground">Status</dt><dd><CampaignStatusBadge status={payload.data.status} /></dd></div>
                </dl>
              </section>
            </div>
          </>
        )}

      </SheetContent>
    </Sheet>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MetaPage() {
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businessId = selectedBusinessId ?? "";

  const ensureBusiness = useIntegrationsStore((state) => state.ensureBusiness);
  const byBusinessId = useIntegrationsStore((state) => state.byBusinessId);

  useEffect(() => {
    if (!selectedBusinessId) return;
    ensureBusiness(businessId);
  }, [businessId, ensureBusiness, selectedBusinessId]);

  const [drawer, setDrawer] = useState<DrawerPayload>(null);
  const [dateRange, setDateRange] = useState<DateRangeValue>(DEFAULT_DATE_RANGE);

  if (!selectedBusinessId) return <BusinessEmptyState />;

  const metaStatus = byBusinessId[businessId]?.meta?.status;
  const metaConnected = metaStatus === "connected";

  const { start: startDate, end: endDate } = getPresetDates(
    dateRange.rangePreset,
    dateRange.customStart,
    dateRange.customEnd
  );

  const campaignsQuery = useQuery({
    queryKey: ["meta-campaigns", businessId, startDate, endDate],
    enabled: metaConnected,
    queryFn: () => fetchMetaCampaigns(businessId, startDate, endDate),
  });

  const breakdownsQuery = useQuery({
    queryKey: ["meta-breakdowns", businessId, startDate, endDate],
    enabled: metaConnected,
    queryFn: () => fetchMetaBreakdowns(businessId, startDate, endDate),
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Meta Ads</h1>
        <p className="text-sm text-muted-foreground">
          Campaign analytics and top ad performance from connected Meta accounts.
        </p>
      </div>

      {/* Integration gate */}
      {metaStatus === "connecting" && <LoadingSkeleton rows={4} />}

      {!metaConnected && metaStatus !== "connecting" && (
        <IntegrationEmptyState
          providerLabel="Meta"
          status={metaStatus}
          description="View campaigns, ad sets, and creative insights once your Meta account is connected."
        />
      )}

      {metaConnected && (
        <>
          {/* Date range picker */}
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </section>

          {/* ── AI Insights ─────────────────────────────────────────────── */}
          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold">AI Insights</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              OmniAds will surface creative, audience, and budget signals once enough synced
              Meta performance data is available.
            </p>
          </section>

          {/* ── Campaign Performance ─────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Campaign Performance</h2>
            </div>

            {campaignsQuery.isLoading && <LoadingSkeleton rows={4} />}

            {campaignsQuery.isError && (
              <SectionError
                message={
                  campaignsQuery.error instanceof Error
                    ? campaignsQuery.error.message
                    : "Could not load campaign data."
                }
                onRetry={() => campaignsQuery.refetch()}
              />
            )}

            {!campaignsQuery.isLoading && !campaignsQuery.isError && (() => {
              const status = campaignsQuery.data?.status;
              const rows = campaignsQuery.data?.rows ?? [];

              if (status === "no_accounts_assigned") {
                return <NoAccountsAssigned />;
              }

              if (rows.length === 0) {
                return (
                  <DataEmptyState
                    title="No campaign data found"
                    description="No campaigns ran in the selected date range for the assigned Meta ad accounts."
                  />
                );
              }

              return (
                <CampaignTable
                  rows={rows}
                  onRowClick={(row) => setDrawer({ type: "campaign", data: row })}
                />
              );
            })()}
          </section>

          {/* ── Performance Breakdowns ───────────────────────────────────── */}
          <section className="space-y-3">
            <div>
              <h2 className="text-base font-semibold">Performance Breakdowns</h2>
              <p className="text-sm text-muted-foreground">
                Break down Meta performance by audience, geography, placements and catalog products.
              </p>
            </div>

            {breakdownsQuery.isLoading && <LoadingSkeleton rows={5} />}

            {breakdownsQuery.isError && (
              <SectionError
                message={
                  breakdownsQuery.error instanceof Error
                    ? breakdownsQuery.error.message
                    : "Could not load breakdown data."
                }
                onRetry={() => breakdownsQuery.refetch()}
              />
            )}

            {!breakdownsQuery.isLoading && !breakdownsQuery.isError && (() => {
              const breakdowns = breakdownsQuery.data;
              const status = breakdowns?.status;

              if (status === "no_accounts_assigned") return <NoAccountsAssigned />;
              if (status === "no_connection" || status === "no_access_token") {
                return (
                  <BreakdownUnavailable message="Breakdowns unavailable: Meta connection or token is not available." />
                );
              }

              const ageRows = breakdowns?.age ?? [];
              const locationRows = breakdowns?.location ?? [];
              const placementRows = breakdowns?.placement ?? [];
              const campaignBudgetRows = breakdowns?.budget.campaign ?? [];
              const adsetBudgetRows = breakdowns?.budget.adset ?? [];
              const totalAgeSpend = ageRows.reduce((acc, row) => acc + row.spend, 0);
              const totalLocationSpend = locationRows.reduce((acc, row) => acc + row.spend, 0);
              const totalPlacementSpend = placementRows.reduce((acc, row) => acc + row.spend, 0);
              const totalCampaignBudgetSpend = campaignBudgetRows.reduce((acc, row) => acc + row.spend, 0);
              const totalAdsetBudgetSpend = adsetBudgetRows.reduce((acc, row) => acc + row.spend, 0);

              return (
                <div className="grid gap-4 xl:grid-cols-2">
                  <BreakdownCard title="ROAS by Age Range" description="Spend-weighted performance by age cohort.">
                    {ageRows.length > 0 ? (
                      <BreakdownTable
                        headers={["Age Range", "Spend", "Purchases", "Revenue", "ROAS", "Budget %"]}
                        rows={ageRows.map((row) => [
                          row.label,
                          fmt$(row.spend),
                          Math.round(row.purchases).toLocaleString(),
                          fmt$(row.revenue),
                          row.spend > 0 ? (row.revenue / row.spend).toFixed(2) : "0.00",
                          pct(row.spend, totalAgeSpend),
                        ])}
                      />
                    ) : (
                      <BreakdownUnavailable message="No age breakdown data available for the selected range." />
                    )}
                  </BreakdownCard>

                  <BreakdownCard title="ROAS by Location" description="Geography-level budget and return distribution.">
                    {locationRows.length > 0 ? (
                      <BreakdownTable
                        headers={["Location", "Spend", "Revenue", "Purchases", "ROAS", "Budget %"]}
                        rows={locationRows.map((row) => [
                          row.label,
                          fmt$(row.spend),
                          fmt$(row.revenue),
                          Math.round(row.purchases).toLocaleString(),
                          row.spend > 0 ? (row.revenue / row.spend).toFixed(2) : "0.00",
                          pct(row.spend, totalLocationSpend),
                        ])}
                      />
                    ) : (
                      <BreakdownUnavailable message="Location breakdown unavailable for the selected range." />
                    )}
                  </BreakdownCard>

                  <BreakdownCard title="Performance by Placement" description="Spend, return and delivery efficiency by placement.">
                    {placementRows.length > 0 ? (
                      <BreakdownTable
                        headers={["Placement", "Spend", "Purchases", "ROAS", "CTR", "CPM", "Budget %"]}
                        rows={placementRows.map((row) => [
                          row.label,
                          fmt$(row.spend),
                          Math.round(row.purchases).toLocaleString(),
                          row.spend > 0 ? (row.revenue / row.spend).toFixed(2) : "0.00",
                          row.impressions > 0 ? `${((row.clicks / row.impressions) * 100).toFixed(2)}%` : "0.00%",
                          row.impressions > 0 ? fmt$((row.spend / row.impressions) * 1000) : fmt$(0),
                          pct(row.spend, totalPlacementSpend),
                        ])}
                      />
                    ) : (
                      <BreakdownUnavailable message="Placement breakdown unavailable for the selected range." />
                    )}
                  </BreakdownCard>

                  <BreakdownCard title="Audience Performance" description="Prospecting vs retargeting vs existing customer spend quality.">
                    <BreakdownUnavailable
                      message={
                        breakdowns?.audience.reason ??
                        "Audience performance unavailable."
                      }
                    />
                  </BreakdownCard>

                  <BreakdownCard title="Top Products by Spend" description="Catalog-level spend concentration and product performance.">
                    <BreakdownUnavailable
                      message={
                        breakdowns?.products.reason ??
                        "Catalog product data unavailable for the selected account setup."
                      }
                    />
                  </BreakdownCard>

                  <BreakdownCard title="Budget Distribution" description="Share of spend by campaign and ad set.">
                    <div className="space-y-4">
                      {campaignBudgetRows.length > 0 ? (
                        <BreakdownTable
                          headers={["Campaign", "Spend", "Budget %"]}
                          rows={campaignBudgetRows
                            .slice(0, 10)
                            .map((row) => [row.label, fmt$(row.spend), pct(row.spend, totalCampaignBudgetSpend)])}
                        />
                      ) : (
                        <BreakdownUnavailable message="Campaign budget distribution unavailable." />
                      )}
                      {adsetBudgetRows.length > 0 ? (
                        <BreakdownTable
                          headers={["Ad Set", "Spend", "Budget %"]}
                          rows={adsetBudgetRows
                            .slice(0, 10)
                            .map((row) => [row.label, fmt$(row.spend), pct(row.spend, totalAdsetBudgetSpend)])}
                        />
                      ) : (
                        <BreakdownUnavailable message="Ad set budget distribution unavailable." />
                      )}
                    </div>
                  </BreakdownCard>
                </div>
              );
            })()}
          </section>

          <MetaDrawer payload={drawer} onClose={() => setDrawer(null)} />
        </>
      )}
    </div>
  );
}
