"use client";

import { useEffect, useState } from "react";
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
import type { MetaCreativeRow } from "@/app/api/meta/top-creatives/route";

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

async function fetchMetaTopCreatives(
  businessId: string,
  startDate: string,
  endDate: string
): Promise<{ status?: string; rows: MetaCreativeRow[] }> {
  const params = new URLSearchParams({ businessId, startDate, endDate, limit: "6" });
  const res = await fetch(`/api/meta/top-creatives?${params.toString()}`, {
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
  return payload as { status?: string; rows: MetaCreativeRow[] };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function nDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

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

// ── Top Creatives ─────────────────────────────────────────────────────────────

/**
 * Three distinct preview states:
 * A) is_catalog = true  → Catalog ad (dynamic product ad, no static preview)
 * B) is_catalog = false + preview_url  → Real thumbnail / image
 * C) is_catalog = false + no preview_url  → Preview unavailable
 */
function CreativePreview({
  creative,
  className = "",
}: {
  creative: MetaCreativeRow;
  className?: string;
}) {
  // A) Catalog / DPA ad
  if (creative.is_catalog) {
    return (
      <div
        className={`flex aspect-square w-full flex-col items-center justify-center gap-1.5 bg-muted/60 ${className}`}
      >
        <Badge variant="secondary" className="text-[10px]">
          Catalog ad
        </Badge>
        <span className="text-xs text-muted-foreground">Dynamic product creative</span>
      </div>
    );
  }

  // B) Real preview
  if (creative.preview_url) {
    return (
      <div className={`aspect-square w-full overflow-hidden ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={creative.preview_url}
          alt={creative.name}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  // C) Preview unavailable (non-catalog, but no image/thumbnail returned)
  return (
    <div
      className={`flex aspect-square w-full items-center justify-center bg-muted/40 ${className}`}
    >
      <span className="text-xs text-muted-foreground">Preview unavailable</span>
    </div>
  );
}

function CreativeCard({
  creative,
  onClick,
}: {
  creative: MetaCreativeRow;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="overflow-hidden rounded-xl border bg-card text-left transition-shadow hover:shadow-sm max-h-[360px]"
    >
      <CreativePreview creative={creative} />
      <div className="space-y-1.5 p-3">
        <p className="truncate text-sm font-medium">{creative.name}</p>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          <MiniMetric label="Spend" value={fmt$(creative.spend)} />
          <MiniMetric label="Revenue" value={fmt$(creative.revenue)} />
          <MiniMetric label="ROAS" value={creative.roas.toFixed(2)} />
          <MiniMetric label="CTR" value={`${creative.ctr.toFixed(2)}%`} />
          <MiniMetric label="Purchases" value={creative.purchases.toLocaleString()} />
        </div>
      </div>
    </button>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/15 px-1.5 py-1">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

// ── Drawer ────────────────────────────────────────────────────────────────────

type DrawerPayload = { type: "campaign"; data: MetaCampaignRow } | { type: "creative"; data: MetaCreativeRow } | null;

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

        {payload?.type === "creative" && (
          <>
            <SheetHeader className="mb-4">
              <SheetTitle>{payload.data.name}</SheetTitle>
              <SheetDescription>
                {payload.data.is_catalog ? "Catalog ad · " : ""}Ad performance detail
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-4 pb-6">
              <CreativePreview creative={payload.data} className="rounded-xl" />
              <section className="rounded-xl border p-4">
                <h3 className="text-sm font-semibold">Metrics</h3>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div><dt className="text-muted-foreground">Spend</dt><dd>{fmt$(payload.data.spend)}</dd></div>
                  <div><dt className="text-muted-foreground">Revenue</dt><dd>{fmt$(payload.data.revenue)}</dd></div>
                  <div><dt className="text-muted-foreground">ROAS</dt><dd>{payload.data.roas.toFixed(2)}</dd></div>
                  <div><dt className="text-muted-foreground">CTR</dt><dd>{payload.data.ctr.toFixed(2)}%</dd></div>
                  <div><dt className="text-muted-foreground">Purchases</dt><dd>{payload.data.purchases.toLocaleString()}</dd></div>
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

  if (!selectedBusinessId) return <BusinessEmptyState />;

  const metaStatus = byBusinessId[businessId]?.meta?.status;
  const metaConnected = metaStatus === "connected";

  // Default date range: last 30 days
  const endDate = toISODate(new Date());
  const startDate = toISODate(nDaysAgo(29));

  const campaignsQuery = useQuery({
    queryKey: ["meta-campaigns", businessId, startDate, endDate],
    enabled: metaConnected,
    queryFn: () => fetchMetaCampaigns(businessId, startDate, endDate),
  });

  const creativesQuery = useQuery({
    queryKey: ["meta-top-creatives", businessId, startDate, endDate],
    enabled: metaConnected,
    queryFn: () => fetchMetaTopCreatives(businessId, startDate, endDate),
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
              <span className="text-xs text-muted-foreground">Last 30 days</span>
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
                    description="No campaigns ran in the last 30 days for the assigned Meta ad accounts."
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

          {/* ── Top Performing Creatives ─────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Top Performing Creatives</h2>
              <span className="text-xs text-muted-foreground">Last 30 days · by ROAS</span>
            </div>

            {creativesQuery.isLoading && <LoadingSkeleton rows={3} />}

            {creativesQuery.isError && (
              <SectionError
                message={
                  creativesQuery.error instanceof Error
                    ? creativesQuery.error.message
                    : "Could not load creative data."
                }
                onRetry={() => creativesQuery.refetch()}
              />
            )}

            {!creativesQuery.isLoading && !creativesQuery.isError && (() => {
              const status = creativesQuery.data?.status;
              const rows = creativesQuery.data?.rows ?? [];

              if (status === "no_accounts_assigned") {
                return <NoAccountsAssigned />;
              }

              if (rows.length === 0) {
                return (
                  <DataEmptyState
                    title="No top creatives yet"
                    description="Sync campaign and ad-level performance to view leading creatives."
                  />
                );
              }

              return (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {rows.map((creative) => (
                    <CreativeCard
                      key={creative.creative_id}
                      creative={creative}
                      onClick={() => setDrawer({ type: "creative", data: creative })}
                    />
                  ))}
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
