"use client";

import { cn } from "@/lib/utils";
import { SectionLabel } from "./shared";

// ── Types ──────────────────────────────────────────────────────────────

interface FailedQuery {
  query: string;
  message: string;
  customerId: string;
}

interface TabMeta {
  label: string;
  partial?: boolean;
  warnings?: string[];
  failed_queries?: FailedQuery[];
  unavailable_metrics?: string[];
}

interface DiagnosticsTabProps {
  tabMetas: TabMeta[];
  isLoading?: boolean;
}

// ── Section ────────────────────────────────────────────────────────────

function MetaSection({ meta }: { meta: TabMeta }) {
  const hasIssues =
    (meta.failed_queries?.length ?? 0) > 0 ||
    (meta.warnings?.length ?? 0) > 0 ||
    (meta.unavailable_metrics?.length ?? 0) > 0;

  if (!hasIssues) return null;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className={cn("flex items-center gap-2 px-4 py-3 border-b", meta.partial ? "bg-amber-50 dark:bg-amber-950/30" : "")}>
        <span className={cn("h-2 w-2 rounded-full shrink-0", (meta.failed_queries?.length ?? 0) > 0 ? "bg-rose-500" : meta.partial ? "bg-amber-400" : "bg-emerald-500")} />
        <p className="text-xs font-semibold">{meta.label}</p>
        {meta.partial && (
          <span className="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 text-[9px] font-semibold ml-auto">
            Partial data
          </span>
        )}
      </div>

      <div className="divide-y">
        {meta.failed_queries && meta.failed_queries.length > 0 && (
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400 mb-2">
              Failed Queries ({meta.failed_queries.length})
            </p>
            <div className="space-y-1.5">
              {meta.failed_queries.map((fq, i) => (
                <div key={i} className="rounded bg-rose-50 dark:bg-rose-950/30 px-3 py-2">
                  <p className="text-xs font-mono text-rose-800 dark:text-rose-200">{fq.query}</p>
                  <p className="text-[10px] text-rose-700 dark:text-rose-300 mt-0.5">{fq.message}</p>
                  {fq.customerId && (
                    <p className="text-[10px] text-rose-600/70 dark:text-rose-400/70 mt-0.5">
                      Customer: {fq.customerId}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {meta.warnings && meta.warnings.length > 0 && (
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-2">
              Warnings ({meta.warnings.length})
            </p>
            <div className="space-y-1">
              {meta.warnings.map((w, i) => (
                <p key={i} className="text-xs text-muted-foreground">△ {w}</p>
              ))}
            </div>
          </div>
        )}

        {meta.unavailable_metrics && meta.unavailable_metrics.length > 0 && (
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              Unavailable Metrics ({meta.unavailable_metrics.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {meta.unavailable_metrics.map((m, i) => (
                <span key={i} className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground font-mono">
                  {m.replaceAll("_", " ")}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── API limitations note ───────────────────────────────────────────────

function ApiLimitationsNote() {
  const limitations = [
    "Shopping performance data requires active Shopping or Performance Max campaigns with product feeds.",
    "Audience names and segment details may be limited by Google Ads API privacy thresholds.",
    "Quality Score metrics (quality_score, expected_ctr, ad_relevance) are sampled — not always available for all keywords.",
    "Asset-level conversion attribution within Performance Max is not exposed by the API.",
    "Impression share metrics require the search_impression_share field which may be unavailable for some campaign types.",
    "Search term data is available only for Search and Shopping campaigns with minimum impression thresholds met.",
  ];

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs font-semibold mb-3">Google Ads API Limitations</p>
      <p className="text-xs text-muted-foreground mb-3">
        These are known structural limitations of the Google Ads API. They are not errors — they reflect what data the platform exposes.
      </p>
      <ul className="space-y-1.5">
        {limitations.map((l, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="text-slate-400 shrink-0 mt-0.5">—</span>
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Health summary ─────────────────────────────────────────────────────

function HealthSummary({ tabMetas }: { tabMetas: TabMeta[] }) {
  const total = tabMetas.length;
  const withFailures = tabMetas.filter((m) => (m.failed_queries?.length ?? 0) > 0).length;
  const withWarnings = tabMetas.filter((m) => (m.warnings?.length ?? 0) > 0).length;
  const healthy = total - withFailures - withWarnings;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-card p-3">
        <p className="text-xs text-muted-foreground">Healthy</p>
        <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{healthy}</p>
        <p className="text-[10px] text-muted-foreground">queries clean</p>
      </div>
      <div className={cn("rounded-xl border p-3", withWarnings > 0 ? "border-amber-200 dark:border-amber-900/50" : "bg-card")}>
        <p className="text-xs text-muted-foreground">Warnings</p>
        <p className={cn("text-2xl font-bold", withWarnings > 0 ? "text-amber-600 dark:text-amber-400" : "")}>{withWarnings}</p>
        <p className="text-[10px] text-muted-foreground">data sources</p>
      </div>
      <div className={cn("rounded-xl border p-3", withFailures > 0 ? "border-rose-200 dark:border-rose-900/50" : "bg-card")}>
        <p className="text-xs text-muted-foreground">Failed</p>
        <p className={cn("text-2xl font-bold", withFailures > 0 ? "text-rose-600 dark:text-rose-400" : "")}>{withFailures}</p>
        <p className="text-[10px] text-muted-foreground">query failures</p>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export function DiagnosticsTab({ tabMetas, isLoading }: DiagnosticsTabProps) {
  if (isLoading) return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-20 rounded-xl border bg-muted animate-pulse" />
      ))}
    </div>
  );

  const hasAnyIssue = tabMetas.some(
    (m) => (m.failed_queries?.length ?? 0) > 0 || (m.warnings?.length ?? 0) > 0
  );

  const sectionsWithIssues = tabMetas.filter(
    (m) => (m.failed_queries?.length ?? 0) > 0 || (m.warnings?.length ?? 0) > 0 || (m.unavailable_metrics?.length ?? 0) > 0
  );

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Diagnostics</SectionLabel>
        <p className="text-xs text-muted-foreground mt-0.5">
          Technical health of your Google Ads data. Understand what is available, what failed, and what is structurally limited by the API.
        </p>
      </div>

      <HealthSummary tabMetas={tabMetas} />

      {!hasAnyIssue && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-6 text-center">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">All loaded data sources are clean</p>
          <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
            No query failures or warnings detected. Navigate to other tabs to load their data.
          </p>
        </div>
      )}

      {sectionsWithIssues.length > 0 && (
        <div className="space-y-3">
          <SectionLabel>Issues by Section</SectionLabel>
          {sectionsWithIssues.map((meta, i) => (
            <MetaSection key={i} meta={meta} />
          ))}
        </div>
      )}

      <ApiLimitationsNote />
    </div>
  );
}
