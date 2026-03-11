"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { SortableTable, type ColumnDef } from "@/components/analytics/SortableTable";
import { cn } from "@/lib/utils";

interface GeoPage {
  path: string;
  aiSessions: number;
  engagementRate: number;
  purchases: number;
  purchaseCvr: number;
  geoScore: number;
  priority: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  confidence: "high" | "medium" | "low";
  strongestSignal: string;
  recommendation: string | null;
}

function fmt(n: number, type: "number" | "percent" = "number"): string {
  if (isNaN(n) || n === undefined) return "—";
  if (type === "percent") return `${(n * 100).toFixed(1)}%`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(0);
}

function GeoScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 60
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : score >= 30
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
      : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {score}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: "high" | "medium" | "low" }) {
  const cls = {
    high: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    low: "bg-muted text-muted-foreground",
  }[priority];
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", cls)}>
      {priority}
    </span>
  );
}

const columns: ColumnDef<GeoPage>[] = [
  {
    key: "path",
    header: "Landing Page",
    accessor: (r) => r.path,
    sticky: true,
    render: (r) => (
      <span className="font-mono text-xs max-w-[180px] truncate block" title={r.path}>
        {r.path}
      </span>
    ),
  },
  {
    key: "geoScore",
    header: "GEO Score",
    accessor: (r) => r.geoScore,
    align: "right",
    render: (r) => <GeoScoreBadge score={r.geoScore} />,
  },
  {
    key: "priority",
    header: "Priority",
    accessor: (r) => ({ high: 0, medium: 1, low: 2 }[r.priority]),
    align: "right",
    render: (r) => <PriorityBadge priority={r.priority} />,
  },
  {
    key: "aiSessions",
    header: "AI Sessions",
    accessor: (r) => r.aiSessions,
    align: "right",
    render: (r) => fmt(r.aiSessions),
  },
  {
    key: "engagementRate",
    header: "Engagement",
    accessor: (r) => r.engagementRate,
    align: "right",
    heatmap: true,
    render: (r) => fmt(r.engagementRate, "percent"),
  },
  {
    key: "purchaseCvr",
    header: "Purchase CVR",
    accessor: (r) => r.purchaseCvr,
    align: "right",
    heatmap: true,
    render: (r) => fmt(r.purchaseCvr, "percent"),
  },
  {
    key: "strongestSignal",
    header: "Strongest Signal",
    accessor: (r) => r.strongestSignal,
    sortable: false,
    render: (r) => (
      <span className="text-xs text-muted-foreground">{r.strongestSignal}</span>
    ),
  },
  {
    key: "recommendation",
    header: "Action",
    accessor: (r) => r.recommendation ?? "",
    sortable: false,
    render: (r) =>
      r.recommendation ? (
        <span className="text-xs text-muted-foreground">{r.recommendation}</span>
      ) : null,
  },
];

interface GeoPagesSectionProps {
  pages?: GeoPage[];
  isLoading: boolean;
}

export function GeoPagesSection({ pages, isLoading }: GeoPagesSectionProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Pages receiving AI-origin traffic, scored by GEO readiness. High score = strong AI
        discovery asset. Priority reflects urgency based on traffic magnitude and CVR gap.
      </p>
      <SortableTable
        columns={columns}
        rows={pages ?? []}
        defaultSortKey="geoScore"
        emptyText="No page-level AI traffic data found. Connect GA4 and ensure a property is selected."
      />
    </div>
  );
}
