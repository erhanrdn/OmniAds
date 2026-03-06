"use client";

import { useEffect, useMemo, useState } from "react";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { useAppStore } from "@/store/app-store";
import { useIntegrationsStore } from "@/store/integrations-store";
import { IntegrationEmptyState } from "@/components/states/IntegrationEmptyState";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Status = "active" | "paused";
type Impact = "High" | "Medium" | "Low";

interface Metrics {
  spend: number;
  purchases: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpm: number;
}

interface CampaignRow extends Metrics {
  id: string;
  name: string;
  status: Status;
}

interface AdSetRow extends Metrics {
  id: string;
  campaignId: string;
  name: string;
  status: Status;
}

interface AdRow extends Metrics {
  id: string;
  adSetId: string;
  name: string;
  status: Status;
}

interface Creative {
  id: string;
  name: string;
  previewUrl: string;
  spend: number;
  revenue: number;
  roas: number;
  ctr: number;
  purchases: number;
}

interface InsightCard {
  id: string;
  title: string;
  description: string;
  impact: Impact;
  summary: string[];
  evidence: Array<{ label: string; value: string }>;
  actions: string[];
}

const CAMPAIGNS: CampaignRow[] = [
  {
    id: "cmp-1",
    name: "Spring Retargeting",
    status: "active",
    spend: 1960,
    purchases: 98,
    revenue: 7080,
    roas: 3.61,
    cpa: 20,
    ctr: 2.84,
    cpm: 18.3,
  },
  {
    id: "cmp-2",
    name: "Prospecting Lookalike",
    status: "paused",
    spend: 1490,
    purchases: 80,
    revenue: 5520,
    roas: 3.7,
    cpa: 18.63,
    ctr: 2.29,
    cpm: 16.7,
  },
];

const AD_SETS: AdSetRow[] = [
  {
    id: "as-1",
    campaignId: "cmp-1",
    name: "7D Site Visitors",
    status: "active",
    spend: 980,
    purchases: 52,
    revenue: 3760,
    roas: 3.84,
    cpa: 18.85,
    ctr: 3.01,
    cpm: 17.5,
  },
  {
    id: "as-2",
    campaignId: "cmp-1",
    name: "ATC 14D",
    status: "active",
    spend: 940,
    purchases: 46,
    revenue: 3320,
    roas: 3.53,
    cpa: 20.43,
    ctr: 2.62,
    cpm: 18.9,
  },
  {
    id: "as-3",
    campaignId: "cmp-2",
    name: "LAL Purchasers 1%",
    status: "paused",
    spend: 780,
    purchases: 38,
    revenue: 2810,
    roas: 3.6,
    cpa: 20.53,
    ctr: 2.11,
    cpm: 15.8,
  },
];

const ADS: AdRow[] = [
  {
    id: "ad-1",
    adSetId: "as-1",
    name: "UGC Reel - Testimonial",
    status: "active",
    spend: 520,
    purchases: 29,
    revenue: 2110,
    roas: 4.06,
    cpa: 17.93,
    ctr: 3.31,
    cpm: 17.1,
  },
  {
    id: "ad-2",
    adSetId: "as-1",
    name: "Static Promo - 20% Off",
    status: "active",
    spend: 460,
    purchases: 23,
    revenue: 1650,
    roas: 3.59,
    cpa: 20,
    ctr: 2.71,
    cpm: 17.9,
  },
  {
    id: "ad-3",
    adSetId: "as-3",
    name: "Lifestyle Variant B",
    status: "paused",
    spend: 390,
    purchases: 16,
    revenue: 1090,
    roas: 2.79,
    cpa: 24.38,
    ctr: 1.78,
    cpm: 15.1,
  },
];

const TOP_CREATIVES: Creative[] = [
  {
    id: "cr-1",
    name: "UGC Reel - Morning Hook",
    previewUrl: "https://picsum.photos/seed/meta-cr1/640/360",
    spend: 1260,
    revenue: 4410,
    roas: 3.5,
    ctr: 2.88,
    purchases: 74,
  },
  {
    id: "cr-2",
    name: "Static Offer Card",
    previewUrl: "https://picsum.photos/seed/meta-cr2/640/360",
    spend: 880,
    revenue: 2410,
    roas: 2.74,
    ctr: 2.11,
    purchases: 39,
  },
  {
    id: "cr-3",
    name: "Founder Story Cut",
    previewUrl: "https://picsum.photos/seed/meta-cr3/640/360",
    spend: 970,
    revenue: 3620,
    roas: 3.73,
    ctr: 2.45,
    purchases: 56,
  },
];

const INSIGHTS: InsightCard[] = [
  {
    id: "ins-1",
    title: "Creative fatigue detected",
    description: "Frequency is rising while CTR drops in retargeting ad sets.",
    impact: "High",
    summary: [
      "Frequency crossed 3.2 in two ad sets.",
      "CTR declined 18% week-over-week.",
      "Fresh variants are required to maintain efficient CPA.",
    ],
    evidence: [
      { label: "Affected ad sets", value: "2" },
      { label: "CTR change", value: "-18%" },
      { label: "Spend at risk", value: "$620" },
    ],
    actions: [
      "Rotate 2 new hooks this week",
      "Cap frequency at ad set level",
      "Shift 15% budget to fresher creatives",
    ],
  },
  {
    id: "ins-2",
    title: "Top performing audience",
    description: "ATC 14D audience continues to outperform broad prospecting.",
    impact: "Medium",
    summary: [
      "ATC 14D delivers 32% higher ROAS than account average.",
      "Purchase rate remains stable despite spend growth.",
      "Audience quality supports moderate scaling.",
    ],
    evidence: [
      { label: "Audience ROAS", value: "4.01" },
      { label: "CPA delta", value: "-$4.20" },
      { label: "Spend share", value: "21%" },
    ],
    actions: [
      "Increase ATC 14D budget by 10%",
      "Clone winning ads into this audience",
      "Refresh exclusions weekly",
    ],
  },
  {
    id: "ins-3",
    title: "Budget scaling opportunity",
    description: "Winning campaigns show headroom without major CPA increase.",
    impact: "High",
    summary: [
      "Spring Retargeting maintains ROAS > 3.5 at current budget.",
      "Auction overlap risk remains limited.",
      "Scale can be tested with conservative step increases.",
    ],
    evidence: [
      { label: "Target campaign", value: "Spring Retargeting" },
      { label: "ROAS", value: "3.61" },
      { label: "Suggested scale", value: "+15%" },
    ],
    actions: [
      "Increase daily budget by 15%",
      "Monitor CPA threshold every 48h",
      "Pause scale if ROAS drops below 3.2",
    ],
  },
  {
    id: "ins-4",
    title: "Low CTR creatives",
    description: "Several static variants underperform baseline click intent.",
    impact: "Low",
    summary: [
      "Three ads have CTR below 1.9%.",
      "These ads pull average CTR down in prospecting.",
      "Hook and offer clarity likely need improvement.",
    ],
    evidence: [
      { label: "Low CTR ads", value: "3" },
      { label: "Avg CTR (low set)", value: "1.73%" },
      { label: "Baseline CTR", value: "2.34%" },
    ],
    actions: [
      "Rewrite first-line hook",
      "Add stronger value claim in headline",
      "Test UGC variant against static card",
    ],
  },
];

type DrawerPayload =
  | { type: "creative"; data: Creative }
  | { type: "insight"; data: InsightCard }
  | null;

export default function MetaPage() {
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businessId = selectedBusinessId ?? "";

  const ensureBusiness = useIntegrationsStore((state) => state.ensureBusiness);
  const byBusinessId = useIntegrationsStore((state) => state.byBusinessId);

  useEffect(() => {
    if (!selectedBusinessId) return;
    ensureBusiness(businessId);
  }, [businessId, ensureBusiness, selectedBusinessId]);

  if (!selectedBusinessId) return <BusinessEmptyState />;

  const metaStatus = byBusinessId[businessId]?.meta?.status;
  const metaConnected = metaStatus === "connected";

  const [expandedCampaignIds, setExpandedCampaignIds] = useState<string[]>([]);
  const [expandedAdSetIds, setExpandedAdSetIds] = useState<string[]>([]);
  const [drawer, setDrawer] = useState<DrawerPayload>(null);

  const adSetsByCampaign = useMemo(
    () =>
      AD_SETS.reduce<Record<string, AdSetRow[]>>((acc, adSet) => {
        acc[adSet.campaignId] = [...(acc[adSet.campaignId] ?? []), adSet];
        return acc;
      }, {}),
    []
  );
  const adsByAdSet = useMemo(
    () =>
      ADS.reduce<Record<string, AdRow[]>>((acc, ad) => {
        acc[ad.adSetId] = [...(acc[ad.adSetId] ?? []), ad];
        return acc;
      }, {}),
    []
  );

  const toggleCampaign = (id: string) => {
    setExpandedCampaignIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleAdSet = (id: string) => {
    setExpandedAdSetIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Meta Ads</h1>
        <p className="text-sm text-muted-foreground">
          Campaign analytics with creative and AI insight drill-down.
        </p>
      </div>

      {metaStatus === "connecting" && <LoadingSkeleton rows={4} />}

      {!metaConnected && metaStatus !== "connecting" && (
        <IntegrationEmptyState
          providerLabel="Meta"
          status={metaStatus}
          description="View campaigns, ad sets, ads, and creative insights once your Meta account is connected."
        />
      )}

      {metaConnected && (<>
      <section className="space-y-2">
        <h2 className="text-base font-semibold">AI Insights</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {INSIGHTS.map((insight) => (
            <div key={insight.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold">{insight.title}</h3>
                <Badge
                  variant={
                    insight.impact === "High"
                      ? "destructive"
                      : insight.impact === "Medium"
                        ? "secondary"
                        : "outline"
                  }
                >
                  {insight.impact}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{insight.description}</p>
              <Button
                className="mt-4"
                variant="outline"
                size="sm"
                onClick={() => setDrawer({ type: "insight", data: insight })}
              >
                View details
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Campaign Performance</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/45 text-left">
              <tr>
                <th className="px-3 py-3 font-medium">Campaign Name</th>
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
              {CAMPAIGNS.map((campaign) => (
                <>
                  <tr
                    key={campaign.id}
                    className="cursor-pointer border-t hover:bg-muted/25"
                    onClick={() => toggleCampaign(campaign.id)}
                  >
                    <td className="px-3 py-3 font-medium">{campaign.name}</td>
                    <StatusCell status={campaign.status} />
                    <MetricCells row={campaign} />
                  </tr>

                  {expandedCampaignIds.includes(campaign.id) &&
                    (adSetsByCampaign[campaign.id] ?? []).map((adSet) => (
                      <>
                        <tr
                          key={adSet.id}
                          className="cursor-pointer border-t bg-muted/15 hover:bg-muted/25"
                          onClick={() => toggleAdSet(adSet.id)}
                        >
                          <td className="px-3 py-3 pl-8">Ad Set: {adSet.name}</td>
                          <StatusCell status={adSet.status} />
                          <MetricCells row={adSet} />
                        </tr>
                        {expandedAdSetIds.includes(adSet.id) &&
                          (adsByAdSet[adSet.id] ?? []).map((ad) => (
                            <tr key={ad.id} className="border-t bg-muted/5">
                              <td className="px-3 py-3 pl-14">Ad: {ad.name}</td>
                              <StatusCell status={ad.status} />
                              <MetricCells row={ad} />
                            </tr>
                          ))}
                      </>
                    ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Top Performing Creatives</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {TOP_CREATIVES.map((creative) => (
            <button
              key={creative.id}
              type="button"
              onClick={() => setDrawer({ type: "creative", data: creative })}
              className="overflow-hidden rounded-xl border bg-card text-left transition-shadow hover:shadow-sm"
            >
              <img
                src={creative.previewUrl}
                alt={creative.name}
                className="aspect-video w-full object-cover"
              />
              <div className="space-y-2 p-3">
                <p className="text-sm font-semibold">{creative.name}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <MiniMetric label="Spend" value={`$${creative.spend.toLocaleString()}`} />
                  <MiniMetric label="Revenue" value={`$${creative.revenue.toLocaleString()}`} />
                  <MiniMetric label="ROAS" value={creative.roas.toFixed(2)} />
                  <MiniMetric label="CTR" value={`${creative.ctr.toFixed(2)}%`} />
                  <MiniMetric label="Purchases" value={creative.purchases.toLocaleString()} />
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <MetaDrawer payload={drawer} onClose={() => setDrawer(null)} />
      </>)}
    </div>
  );
}

function StatusCell({ status }: { status: Status }) {
  return (
    <td className="px-3 py-3">
      <Badge variant={status === "active" ? "default" : "secondary"}>{status}</Badge>
    </td>
  );
}

function MetricCells({ row }: { row: Metrics }) {
  return (
    <>
      <td className="px-3 py-3">${row.spend.toLocaleString()}</td>
      <td className="px-3 py-3">{row.purchases.toLocaleString()}</td>
      <td className="px-3 py-3">${row.revenue.toLocaleString()}</td>
      <td className="px-3 py-3">{row.roas.toFixed(2)}</td>
      <td className="px-3 py-3">${row.cpa.toFixed(2)}</td>
      <td className="px-3 py-3">{row.ctr.toFixed(2)}%</td>
      <td className="px-3 py-3">${row.cpm.toFixed(2)}</td>
    </>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/15 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function MetaDrawer({ payload, onClose }: { payload: DrawerPayload; onClose: () => void }) {
  return (
    <Sheet open={Boolean(payload)} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        {payload && payload.type === "creative" && (
          <>
            <SheetHeader>
              <SheetTitle>{payload.data.name}</SheetTitle>
              <SheetDescription>Creative performance detail</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 overflow-y-auto px-4 pb-6">
              <img
                src={payload.data.previewUrl}
                alt={payload.data.name}
                className="aspect-video w-full rounded-lg object-cover"
              />
              <section className="rounded-xl border p-4">
                <h3 className="text-sm font-semibold">AI Summary</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  <li>- Strong opening hook with stable conversion quality.</li>
                  <li>- ROAS is above account median with scalable CPA.</li>
                  <li>- Creative can be repurposed across additional ad sets.</li>
                </ul>
              </section>
              <section className="rounded-xl border p-4">
                <h3 className="text-sm font-semibold">Performance metrics</h3>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <p>Spend: ${payload.data.spend.toLocaleString()}</p>
                  <p>Revenue: ${payload.data.revenue.toLocaleString()}</p>
                  <p>ROAS: {payload.data.roas.toFixed(2)}</p>
                  <p>CTR: {payload.data.ctr.toFixed(2)}%</p>
                  <p>Purchases: {payload.data.purchases.toLocaleString()}</p>
                </div>
              </section>
              <section className="rounded-xl border p-4">
                <h3 className="text-sm font-semibold">Suggested actions</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  <li>- Test new hook</li>
                  <li>- Duplicate creative</li>
                  <li>- Increase budget</li>
                  <li>- Use in other campaigns</li>
                </ul>
              </section>
            </div>
          </>
        )}

        {payload && payload.type === "insight" && (
          <>
            <SheetHeader>
              <SheetTitle>{payload.data.title}</SheetTitle>
              <SheetDescription>{payload.data.impact} impact insight</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 overflow-y-auto px-4 pb-6">
              <section className="rounded-xl border p-4">
                <h3 className="text-sm font-semibold">AI Summary</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {payload.data.summary.map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </section>
              <section className="rounded-xl border p-4">
                <h3 className="text-sm font-semibold">Evidence</h3>
                <table className="mt-2 min-w-full text-sm">
                  <tbody>
                    {payload.data.evidence.map((row) => (
                      <tr key={row.label} className="border-b last:border-0">
                        <td className="py-2 text-muted-foreground">{row.label}</td>
                        <td className="py-2 text-right">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section className="rounded-xl border p-4">
                <h3 className="text-sm font-semibold">Suggested actions</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {payload.data.actions.map((action) => (
                    <li key={action}>- {action}</li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
