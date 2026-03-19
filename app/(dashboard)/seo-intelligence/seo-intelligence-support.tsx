"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  SeoAiBrief,
  SeoCauseCandidate,
  SeoEntityChange,
  SeoOverviewPayload,
  SeoRecommendation,
} from "@/lib/seo/intelligence";

export type SeoTab = "overview" | "traffic" | "queries" | "pages" | "actions";

export const SEO_TABS: Array<{ id: SeoTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "traffic", label: "Traffic Changes" },
  { id: "queries", label: "Queries" },
  { id: "pages", label: "Pages" },
  { id: "actions", label: "Recommendations" },
];

export type SeoOverviewResponse = SeoOverviewPayload;

export function formatMetric(value: number, mode: "number" | "percent" | "position") {
  if (mode === "percent") return `${(value * 100).toFixed(1)}%`;
  if (mode === "position") return value > 0 ? value.toFixed(1) : "0.0";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function formatDeltaPercent(value: number | null, invert = false) {
  if (value === null) return "New";
  const effective = invert ? -value : value;
  const prefix = effective > 0 ? "+" : "";
  return `${prefix}${(effective * 100).toFixed(0)}%`;
}

export function getDeltaTone(value: number | null, invert = false) {
  if (value === null) return "text-sky-600";
  const effective = invert ? -value : value;
  if (effective > 0.02) return "text-emerald-600";
  if (effective < -0.02) return "text-rose-600";
  return "text-muted-foreground";
}

export function SeoKpiCard(props: {
  label: string;
  current: number;
  previous: number;
  deltaPercent: number | null;
  mode: "number" | "percent" | "position";
  invertDelta?: boolean;
}) {
  const deltaLabel = formatDeltaPercent(props.deltaPercent, props.invertDelta);
  const deltaTone = getDeltaTone(props.deltaPercent, props.invertDelta);

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {props.label}
      </p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold tracking-tight">
            {formatMetric(props.current, props.mode)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Previous: {formatMetric(props.previous, props.mode)}
          </p>
        </div>
        <p className={cn("text-sm font-medium", deltaTone)}>{deltaLabel}</p>
      </div>
    </div>
  );
}

export function SectionIntro(props: { title: string; description: string }) {
  return (
    <div className="mb-4 space-y-1">
      <h2 className="text-lg font-semibold tracking-tight">{props.title}</h2>
      <p className="text-sm text-muted-foreground">{props.description}</p>
    </div>
  );
}

export function AiBriefCard({ brief }: { brief: SeoAiBrief }) {
  return (
    <div className="rounded-2xl border bg-gradient-to-r from-sky-50 to-indigo-50 p-5 shadow-sm dark:from-sky-950/20 dark:to-indigo-950/20">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
            SEO Intelligence Brief
          </p>
          <h3 className="mt-1 text-lg font-semibold">What changed and what to do next</h3>
        </div>
        <Badge variant="secondary">{brief.source === "ai" ? "AI" : "Rules"}</Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <BriefBlock label="Summary" value={brief.summary} />
        <BriefBlock label="Likely Cause" value={brief.likelyCause} />
        <BriefBlock label="Next Step" value={brief.nextStep} />
      </div>
    </div>
  );
}

function BriefBlock(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background/70 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {props.label}
      </p>
      <p className="mt-2 text-sm leading-6">{props.value}</p>
    </div>
  );
}

export function CauseCards({ causes }: { causes: SeoCauseCandidate[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {causes.map((cause) => (
        <div key={cause.key} className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{cause.title}</h3>
            <div className="flex items-center gap-2">
              <ToneBadge label={cause.confidence} />
              <ToneBadge label={cause.severity} />
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{cause.explanation}</p>
        </div>
      ))}
    </div>
  );
}

function ToneBadge({ label }: { label: string }) {
  const tone =
    label === "high"
      ? "bg-rose-100 text-rose-700"
      : label === "medium"
        ? "bg-amber-100 text-amber-700"
        : "bg-muted text-muted-foreground";
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", tone)}>{label}</span>;
}

export function RecommendationsList({
  recommendations,
}: {
  recommendations: SeoRecommendation[];
}) {
  return (
    <div className="space-y-3">
      {recommendations.map((item) => (
        <div key={item.title} className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{item.title}</h3>
            <Badge variant="outline">Effort: {item.effort}</Badge>
            <Badge variant="outline">Impact: {item.impact}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{item.rationale}</p>
        </div>
      ))}
    </div>
  );
}

export function EntityTable(props: {
  title: string;
  rows: SeoEntityChange[];
  emptyLabel: string;
}) {
  if (!props.rows.length) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">
        {props.emptyLabel}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{props.title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Clicks</th>
              <th className="px-4 py-3 font-medium">Impr.</th>
              <th className="px-4 py-3 font-medium">CTR</th>
              <th className="px-4 py-3 font-medium">Pos.</th>
              <th className="px-4 py-3 font-medium">Click delta</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => (
              <tr key={row.key} className="border-t">
                <td className="max-w-[320px] px-4 py-3 align-top">
                  <div className="line-clamp-2 font-medium">{row.label}</div>
                </td>
                <td className="px-4 py-3">{formatMetric(row.clicks, "number")}</td>
                <td className="px-4 py-3">{formatMetric(row.impressions, "number")}</td>
                <td className="px-4 py-3">{formatMetric(row.ctr, "percent")}</td>
                <td className="px-4 py-3">{formatMetric(row.position, "position")}</td>
                <td className={cn("px-4 py-3 font-medium", getDeltaTone(row.clicksDeltaPercent))}>
                  {formatDeltaPercent(row.clicksDeltaPercent)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
