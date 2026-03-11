"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { SortableTable, type ColumnDef } from "@/components/analytics/SortableTable";

interface GeoPage {
  path: string;
  aiSessions: number;
  engagementRate: number;
  purchases: number;
  purchaseCvr: number;
  geoScore: number;
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

const columns: ColumnDef<GeoPage>[] = [
  {
    key: "path",
    header: "Landing Page",
    accessor: (r) => r.path,
    sticky: true,
    render: (r) => (
      <span className="font-mono text-xs max-w-[200px] truncate block" title={r.path}>
        {r.path}
      </span>
    ),
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
    header: "Engagement Rate",
    accessor: (r) => r.engagementRate,
    align: "right",
    heatmap: true,
    render: (r) => fmt(r.engagementRate, "percent"),
  },
  {
    key: "purchases",
    header: "Purchases",
    accessor: (r) => r.purchases,
    align: "right",
    render: (r) => fmt(r.purchases),
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
    key: "geoScore",
    header: "GEO Score",
    accessor: (r) => r.geoScore,
    align: "right",
    render: (r) => <GeoScoreBadge score={r.geoScore} />,
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
        Pages receiving AI-origin traffic, ranked by GEO Score. High score = strong AI
        discovery asset. Action column flags improvement opportunities.
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
