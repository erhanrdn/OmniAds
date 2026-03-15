/**
 * app/(dashboard)/meta/page.tsx
 *
 * Server Component entry point for the Meta Ads dashboard.
 *
 * Architecture summary:
 *  - This file is a pure async Server Component (no "use client" directive).
 *  - Campaign data is fetched on the server before the page streams to the
 *    browser, so the table appears immediately with no client waterfall.
 *  - The three breakdown sections (Age, Location, Placement) are wrapped in
 *    independent <Suspense> boundaries backed by async Server Components.
 *    Each boundary streams in as its underlying Meta API call resolves —
 *    a slow age breakdown does not block the location breakdown from
 *    rendering.
 *  - The campaign accordion (MetaCampaignTable) is a Client Component that
 *    receives campaigns as a serialized prop. Ad set data is fetched lazily
 *    on demand, never on page load.
 *
 * businessId routing:
 *  The server cannot read Zustand (localStorage). Pass businessId via the URL:
 *    /meta?businessId=<id>&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *  The existing sidebar / app-store can be extended with a useEffect that
 *  mirrors selectedBusinessId into the URL (see the commented pattern below).
 */

import { Suspense } from "react";
import { IntegrationEmptyState } from "@/components/states/IntegrationEmptyState";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { MetaCampaignTable } from "@/components/meta/meta-campaign-table";
import {
  resolveMetaCredentials,
  getCampaigns,
  getAgeBreakdown,
  getLocationBreakdown,
  getPlacementBreakdown,
} from "@/lib/api/meta";
import type { MetaBreakdownRow } from "@/lib/api/meta";
import { PlacementBreakdownChart } from "@/components/meta/placement-breakdown-chart";

// ── Date helpers ──────────────────────────────────────────────────────────────

function defaultStartDate(): string {
  return new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
}

function defaultEndDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Breakdown display ─────────────────────────────────────────────────────────

function pct(part: number, whole: number): string {
  if (whole <= 0) return "0.0%";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function fmt$(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface BreakdownCardProps {
  title: string;
  description: string;
  headers: string[];
  rows: MetaBreakdownRow[];
  renderRow: (row: MetaBreakdownRow, totalSpend: number) => React.ReactNode[];
  emptyMessage: string;
}

function BreakdownCard({
  title,
  description,
  headers,
  rows,
  renderRow,
  emptyMessage,
}: BreakdownCardProps) {
  const totalSpend = rows.reduce((acc, r) => acc + r.spend, 0);

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <div className="mt-3">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-xs">
              <thead className="bg-muted/45 text-left">
                <tr>
                  {headers.map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const cells = renderRow(row, totalSpend);
                  return (
                    <tr key={`${row.key}_${idx}`} className="border-t">
                      {cells.map((cell, cellIdx) => (
                        <td
                          key={cellIdx}
                          className={
                            cellIdx === 0
                              ? "px-3 py-2 font-medium"
                              : "px-3 py-2"
                          }
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Async breakdown Server Components ─────────────────────────────────────────
// Each is an independent async Server Component. Suspense wraps each one so
// they stream in parallel — no breakdown blocks another.

interface BreakdownSectionProps {
  businessId: string;
  since: string;
  until: string;
}

async function AgeBreakdownSection({
  businessId,
  since,
  until,
}: BreakdownSectionProps) {
  const credentials = await resolveMetaCredentials(businessId);
  if (!credentials) {
    return (
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-semibold">ROAS by Age Range</h3>
        <p className="mt-2 text-xs text-muted-foreground">
          No Meta credentials available.
        </p>
      </div>
    );
  }

  const rows = await getAgeBreakdown(credentials, since, until);

  return (
    <BreakdownCard
      title="ROAS by Age Range"
      description="Spend-weighted performance by age cohort."
      headers={["Age Range", "Spend", "Purchases", "Revenue", "ROAS", "Budget %"]}
      rows={rows}
      emptyMessage="No age breakdown data for the selected range."
      renderRow={(row, totalSpend) => [
        row.label,
        fmt$(row.spend),
        row.purchases.toLocaleString(),
        fmt$(row.revenue),
        row.roas.toFixed(2),
        pct(row.spend, totalSpend),
      ]}
    />
  );
}

async function LocationBreakdownSection({
  businessId,
  since,
  until,
}: BreakdownSectionProps) {
  const credentials = await resolveMetaCredentials(businessId);
  if (!credentials) {
    return (
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-semibold">ROAS by Location</h3>
        <p className="mt-2 text-xs text-muted-foreground">
          No Meta credentials available.
        </p>
      </div>
    );
  }

  const rows = await getLocationBreakdown(credentials, since, until);

  return (
    <BreakdownCard
      title="ROAS by Location"
      description="Geography-level budget and return distribution."
      headers={["Country", "Spend", "Revenue", "Purchases", "ROAS", "Budget %"]}
      rows={rows}
      emptyMessage="Location breakdown unavailable for the selected range."
      renderRow={(row, totalSpend) => [
        row.label,
        fmt$(row.spend),
        fmt$(row.revenue),
        row.purchases.toLocaleString(),
        row.roas.toFixed(2),
        pct(row.spend, totalSpend),
      ]}
    />
  );
}

async function PlacementBreakdownSection({
  businessId,
  since,
  until,
}: BreakdownSectionProps) {
  const credentials = await resolveMetaCredentials(businessId);
  if (!credentials) {
    return (
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-semibold">Performance by Placement</h3>
        <p className="mt-2 text-xs text-muted-foreground">
          No Meta credentials available.
        </p>
      </div>
    );
  }

  const rows = await getPlacementBreakdown(credentials, since, until);

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold">Performance by Placement</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Spend share and ROAS by platform placement.
      </p>
      <div className="mt-4">
        <PlacementBreakdownChart rows={rows} />
      </div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface MetaPageProps {
  searchParams: {
    businessId?: string;
    startDate?: string;
    endDate?: string;
  };
}

export default async function MetaPage({ searchParams }: MetaPageProps) {
  const businessId = searchParams.businessId;
  const since = searchParams.startDate ?? defaultStartDate();
  const until = searchParams.endDate ?? defaultEndDate();

  // Guard: businessId must be present in the URL.
  // The sidebar/nav layer is responsible for appending ?businessId=<selected>.
  if (!businessId) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Meta Ads</h1>
          <p className="text-sm text-muted-foreground">
            Select a business from the sidebar to view Meta Ads data.
          </p>
        </div>
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No business selected. Navigate here with{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            ?businessId=&lt;id&gt;
          </code>{" "}
          in the URL.
        </div>
      </div>
    );
  }

  // Resolve Meta credentials server-side. No round-trip from the browser.
  const credentials = await resolveMetaCredentials(businessId);

  if (!credentials) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Meta Ads</h1>
          <p className="text-sm text-muted-foreground">
            Campaign analytics and top ad performance from connected Meta
            accounts.
          </p>
        </div>
        <IntegrationEmptyState
          providerLabel="Meta"
          description="View campaigns, ad sets, and creative insights once your Meta account is connected."
        />
      </div>
    );
  }

  // Fetch campaigns server-side. The MetaCampaignTable receives these as a
  // serialized prop — no client-side fetch needed for the initial render.
  const campaigns = await getCampaigns(credentials, since, until);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Meta Ads</h1>
        <p className="text-sm text-muted-foreground">
          Campaign analytics and demographic breakdowns —{" "}
          <span className="font-medium">
            {since} → {until}
          </span>
        </p>
      </div>

      {/* ── Campaign Performance (server-fetched, accordion is client) ─────── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Campaign Performance</h2>
        {/*
          MetaCampaignTable is a "use client" component.
          campaigns is serialized as JSON props — no refetch on client.
          Ad sets are fetched lazily when a row is expanded.
        */}
        <MetaCampaignTable
          campaigns={campaigns}
          businessId={businessId}
          since={since}
          until={until}
        />
      </section>

      {/* ── Performance Breakdowns (independent Suspense boundaries) ─────────
          Each <Suspense> boundary streams independently. A slow location API
          response does not hold up the age breakdown from rendering.
      */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Performance Breakdowns</h2>
          <p className="text-sm text-muted-foreground">
            Age, geography, and placement insights — each section loads
            independently.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Suspense fallback={<LoadingSkeleton rows={5} />}>
            <AgeBreakdownSection
              businessId={businessId}
              since={since}
              until={until}
            />
          </Suspense>

          <Suspense fallback={<LoadingSkeleton rows={5} />}>
            <LocationBreakdownSection
              businessId={businessId}
              since={since}
              until={until}
            />
          </Suspense>

          <Suspense fallback={<LoadingSkeleton rows={5} />}>
            <PlacementBreakdownSection
              businessId={businessId}
              since={since}
              until={until}
            />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
