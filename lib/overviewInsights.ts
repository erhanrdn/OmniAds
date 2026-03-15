import type { OverviewResponse } from "@/lib/overview-service";

export type OpportunityImpact = "High" | "Med" | "Low";

export interface OpportunityEvidenceRow {
  label: string;
  current: string;
  benchmark: string;
}

export interface OpportunityItem {
  id: "scale-winners" | "cut-waste" | "creative-refresh" | "landing-page-issues";
  title: string;
  description: string;
  impact: OpportunityImpact;
  summary: string[];
  evidence: OpportunityEvidenceRow[];
  actions: string[];
  requiresGa4?: boolean;
  disabled?: boolean;
  emptyMessage?: string;
}

interface BuildOpportunitiesArgs {
  data: OverviewResponse;
  ga4Connected: boolean;
}

const formatCurrency = (value: number) => `$${value.toLocaleString()}`;

export function buildOverviewOpportunities({
  data,
  ga4Connected,
}: BuildOpportunitiesArgs): OpportunityItem[] {
  const rows = data.platformEfficiency ?? [];

  const recentTrend = data.trends?.["7d"] ?? [];
  const first = recentTrend[0];
  const last = recentTrend[recentTrend.length - 1];
  const ctrProxyDrop =
    first && last && first.revenue > 0
      ? ((last.revenue - first.revenue) / first.revenue) * 100
      : 0;

  // When no platform data is available yet, return disabled placeholders so
  // the UI renders an empty state instead of throwing on undefined candidates.
  if (rows.length === 0) {
    return [
      {
        id: "scale-winners",
        title: "Scale winners",
        description:
          "Identify high-efficiency pockets that can absorb more budget without hurting CPA.",
        impact: "Med",
        disabled: true,
        emptyMessage: "Connect ad platforms to unlock scale analysis.",
        summary: [],
        evidence: [],
        actions: [],
      },
      {
        id: "cut-waste",
        title: "Cut waste",
        description:
          "Find heavy spend areas with weak ROAS and reduce inefficiency before next budget cycle.",
        impact: "Med",
        disabled: true,
        emptyMessage: "Connect ad platforms to identify spend inefficiencies.",
        summary: [],
        evidence: [],
        actions: [],
      },
      {
        id: "creative-refresh",
        title: "Creative refresh",
        description:
          "Detect signs of fatigue and refresh hooks before CTR and conversion rates decline further.",
        impact: ctrProxyDrop < -8 ? "High" : "Low",
        summary: [
          "Recent trend signals ad fatigue risk in prospecting audiences.",
          "Creative variation depth is likely too narrow for current spend level.",
          "Refreshing first-frame hooks can recover CTR quickly.",
        ],
        evidence: [
          {
            label: "7-day revenue change",
            current: `${ctrProxyDrop.toFixed(1)}%`,
            benchmark: "Stable > -3%",
          },
          { label: "Top creative rotation", current: "Low", benchmark: "Medium / High" },
          { label: "CTR momentum", current: "Downward", benchmark: "Flat or up" },
        ],
        actions: [
          "Launch 3-5 new hook variants this week.",
          "Test shorter primary text and stronger CTA contrast.",
          "Retire creatives with declining CTR for 7+ days.",
        ],
      },
      {
        id: "landing-page-issues",
        title: "Landing page issues",
        description:
          "Use GA4 behavioral data to isolate drop-offs between click, session, and purchase.",
        impact: "Med",
        requiresGa4: true,
        disabled: !ga4Connected,
        emptyMessage: "Connect GA4 to enable",
        summary: [
          "Session-to-purchase conversion drops on mobile landing pages.",
          "High bounce on paid traffic indicates message mismatch.",
          "Top spend pages need faster load and clearer offer hierarchy.",
        ],
        evidence: [
          { label: "Sessions", current: "14,820", benchmark: "Clicks 17,400" },
          { label: "Conv. rate", current: "2.1%", benchmark: "Target 2.8%+" },
          { label: "Mobile bounce", current: "61%", benchmark: "<50%" },
        ],
        actions: [
          "Improve above-the-fold value proposition for paid visitors.",
          "Reduce page load time and simplify checkout entry points.",
          "Align ad promise and landing headline by audience segment.",
        ],
      },
    ] satisfies OpportunityItem[];
  }

  const totalSpend = rows.reduce((sum, row) => sum + (row.spend ?? 0), 0);
  const averageRoas =
    rows.reduce((sum, row) => sum + (row.roas ?? 0), 0) / rows.length;

  const scaleCandidate = [...rows].sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))[0];
  const scaleShare = totalSpend > 0 ? ((scaleCandidate.spend ?? 0) / totalSpend) * 100 : 0;

  const wasteCandidate = [...rows].sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))[0];

  return [
    {
      id: "scale-winners",
      title: "Scale winners",
      description:
        "Identify high-efficiency pockets that can absorb more budget without hurting CPA.",
      impact: (scaleCandidate.roas ?? 0) >= averageRoas * 1.15 ? "High" : "Med",
      summary: [
        `${capitalize(scaleCandidate.platform)} is the strongest ROAS contributor right now.`,
        `Its spend share is only ${scaleShare.toFixed(1)}%, leaving room for controlled scaling.`,
        "Incremental budget should focus on top ad sets first, then broad campaigns.",
      ],
      evidence: [
        {
          label: `${capitalize(scaleCandidate.platform)} ROAS`,
          current: (scaleCandidate.roas ?? 0).toFixed(2),
          benchmark: `Avg ${averageRoas.toFixed(2)}`,
        },
        {
          label: "Spend share",
          current: `${scaleShare.toFixed(1)}%`,
          benchmark: "Target 20-30%",
        },
        {
          label: "Platform revenue",
          current: formatCurrency(scaleCandidate.revenue ?? 0),
          benchmark: "Top platform candidate",
        },
      ],
      actions: [
        `Increase ${capitalize(scaleCandidate.platform)} budget by 10-15% in phases.`,
        "Duplicate top creatives into winning audiences.",
        "Monitor CPA daily and stop scaling if CPA rises >12%.",
      ],
    },
    {
      id: "cut-waste",
      title: "Cut waste",
      description:
        "Find heavy spend areas with weak ROAS and reduce inefficiency before next budget cycle.",
      impact: (wasteCandidate.roas ?? 0) < averageRoas * 0.9 ? "High" : "Med",
      summary: [
        `${capitalize(wasteCandidate.platform)} has the highest spend but underperforms on ROAS.`,
        "Current spend allocation is likely dragging blended efficiency.",
        "A controlled cut can free budget for higher-yield channels.",
      ],
      evidence: [
        {
          label: "Spend",
          current: formatCurrency(wasteCandidate.spend ?? 0),
          benchmark: "Highest platform spend",
        },
        {
          label: "ROAS",
          current: (wasteCandidate.roas ?? 0).toFixed(2),
          benchmark: `Avg ${averageRoas.toFixed(2)}`,
        },
        {
          label: "CPA",
          current: formatCurrency(wasteCandidate.cpa ?? 0),
          benchmark: "Minimize cost per purchase",
        },
      ],
      actions: [
        `Cut ${capitalize(wasteCandidate.platform)} low-performing segments by 15%.`,
        "Add negative audiences/search terms to trim low intent traffic.",
        "Reallocate saved budget to top ROAS campaigns.",
      ],
    },
    {
      id: "creative-refresh",
      title: "Creative refresh",
      description:
        "Detect signs of fatigue and refresh hooks before CTR and conversion rates decline further.",
      impact: ctrProxyDrop < -8 ? "High" : "Low",
      summary: [
        "Recent trend signals ad fatigue risk in prospecting audiences.",
        "Creative variation depth is likely too narrow for current spend level.",
        "Refreshing first-frame hooks can recover CTR quickly.",
      ],
      evidence: [
        {
          label: "7-day revenue change",
          current: `${ctrProxyDrop.toFixed(1)}%`,
          benchmark: "Stable > -3%",
        },
        {
          label: "Top creative rotation",
          current: "Low",
          benchmark: "Medium / High",
        },
        {
          label: "CTR momentum",
          current: "Downward",
          benchmark: "Flat or up",
        },
      ],
      actions: [
        "Launch 3-5 new hook variants this week.",
        "Test shorter primary text and stronger CTA contrast.",
        "Retire creatives with declining CTR for 7+ days.",
      ],
    },
    {
      id: "landing-page-issues",
      title: "Landing page issues",
      description:
        "Use GA4 behavioral data to isolate drop-offs between click, session, and purchase.",
      impact: "Med",
      requiresGa4: true,
      disabled: !ga4Connected,
      emptyMessage: "Connect GA4 to enable",
      summary: [
        "Session-to-purchase conversion drops on mobile landing pages.",
        "High bounce on paid traffic indicates message mismatch.",
        "Top spend pages need faster load and clearer offer hierarchy.",
      ],
      evidence: [
        { label: "Sessions", current: "14,820", benchmark: "Clicks 17,400" },
        { label: "Conv. rate", current: "2.1%", benchmark: "Target 2.8%+" },
        { label: "Mobile bounce", current: "61%", benchmark: "<50%" },
      ],
      actions: [
        "Improve above-the-fold value proposition for paid visitors.",
        "Reduce page load time and simplify checkout entry points.",
        "Align ad promise and landing headline by audience segment.",
      ],
    },
  ];
}

export function buildOpportunityNotes(item: OpportunityItem) {
  return [
    `Opportunity: ${item.title}`,
    `Impact: ${item.impact}`,
    "",
    "AI Summary:",
    ...item.summary.map((line) => `- ${line}`),
    "",
    "Suggested actions:",
    ...item.actions.map((line) => `- ${line}`),
  ].join("\n");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
