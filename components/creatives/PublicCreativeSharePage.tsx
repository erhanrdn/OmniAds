"use client";

import { SharePayload, SharedCreative, ShareMetricKey } from "./shareCreativeTypes";

const METRIC_LABELS: Record<ShareMetricKey, string> = {
  spend: "Spend",
  purchaseValue: "Purchase value",
  roas: "ROAS",
  cpa: "CPA",
  ctrAll: "CTR",
  purchases: "Purchases",
};

function formatMetric(key: ShareMetricKey, value: number): string {
  switch (key) {
    case "spend":
    case "purchaseValue":
      return `$${value.toLocaleString()}`;
    case "roas":
      return value.toFixed(2);
    case "cpa":
      return `$${value.toFixed(2)}`;
    case "ctrAll":
      return `${value.toFixed(2)}%`;
    case "purchases":
      return value.toLocaleString();
    default:
      return String(value);
  }
}

function sumMetric(creatives: SharedCreative[], key: ShareMetricKey): number {
  if (key === "roas" || key === "cpa" || key === "ctrAll") {
    const avg = creatives.reduce((sum, c) => sum + c[key], 0) / creatives.length;
    return avg;
  }
  return creatives.reduce((sum, c) => sum + c[key], 0);
}

interface PublicCreativeSharePageProps {
  payload: SharePayload;
}

export function PublicCreativeSharePage({ payload }: PublicCreativeSharePageProps) {
  const {
    title,
    dateRange,
    metrics,
    creatives,
    note,
    includeNotes,
    groupBy,
    filters,
    selectedRowIds,
    totalRows,
  } = payload;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-5">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-white/40 mb-1">
              Creative Report
            </p>
            <h1 className="text-xl font-semibold">{title || "Selected Creatives"}</h1>
            <p className="text-sm text-white/50 mt-0.5">{dateRange}</p>
          </div>
          <div className="hidden sm:block text-right">
            <p className="text-[11px] text-white/30">{creatives.length} creatives</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-10">
        <section className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/60">
          <div className="flex flex-wrap items-center gap-3">
            {groupBy ? <span>Group by: {groupBy}</span> : null}
            {typeof totalRows === "number" ? <span>Rows: {totalRows}</span> : null}
            {selectedRowIds && selectedRowIds.length > 0 ? (
              <span>Selected creatives: {selectedRowIds.length}</span>
            ) : null}
          </div>
          {filters && filters.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {filters.map((item) => (
                <span key={item} className="rounded-full border border-white/20 px-2 py-0.5 text-[11px]">
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        {/* KPI Summary row */}
        <section>
          <h2 className="text-xs uppercase tracking-widest text-white/40 mb-4">Summary</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {metrics.map((key) => (
              <div
                key={key}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <p className="text-[11px] text-white/40 mb-1">{METRIC_LABELS[key]}</p>
                <p className="text-lg font-semibold tabular-nums">
                  {formatMetric(key, sumMetric(creatives, key))}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Creative cards grid */}
        <section>
          <h2 className="text-xs uppercase tracking-widest text-white/40 mb-4">Creatives</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {creatives.map((creative) => (
              <CreativeCard key={creative.id} creative={creative} metrics={metrics} />
            ))}
          </div>
        </section>

        {/* Performance table */}
        <section>
          <h2 className="text-xs uppercase tracking-widest text-white/40 mb-4">
            Performance breakdown
          </h2>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/5">
                  <th className="px-4 py-3 text-left text-xs font-medium text-white/50">
                    Creative
                  </th>
                  {metrics.map((key) => (
                    <th
                      key={key}
                      className="px-4 py-3 text-right text-xs font-medium text-white/50"
                    >
                      {METRIC_LABELS[key]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {creatives.map((creative, idx) => (
                  <tr
                    key={creative.id}
                    className={`border-b border-white/5 ${
                      idx % 2 === 0 ? "" : "bg-white/[0.02]"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={creative.thumbnailUrl}
                          alt={creative.name}
                          className="h-8 w-14 rounded object-cover"
                        />
                        <span className="line-clamp-2 text-xs text-white/80">
                          {creative.name}
                        </span>
                      </div>
                    </td>
                    {metrics.map((key) => (
                      <td
                        key={key}
                        className="px-4 py-3 text-right text-xs tabular-nums text-white/70"
                      >
                        {formatMetric(key, creative[key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Note */}
        {includeNotes && note && (
          <section>
            <h2 className="text-xs uppercase tracking-widest text-white/40 mb-3">Notes</h2>
            <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/60 leading-relaxed">
              {note}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-4 text-center">
        <p className="text-[11px] text-white/20">
          This report is shared for viewing only. Do not distribute beyond the intended recipient.
        </p>
      </footer>
    </div>
  );
}

function CreativeCard({
  creative,
  metrics,
}: {
  creative: SharedCreative;
  metrics: ShareMetricKey[];
}) {
  const primaryMetrics = metrics.slice(0, 4);

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <img
        src={creative.thumbnailUrl}
        alt={creative.name}
        className="aspect-video w-full object-cover"
      />
      <div className="p-3">
        <p className="line-clamp-2 text-xs font-medium text-white/90 mb-2">
          {creative.name}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {primaryMetrics.map((key) => (
            <div key={key}>
              <p className="text-[10px] text-white/40">{METRIC_LABELS[key]}</p>
              <p className="text-xs font-semibold tabular-nums">
                {formatMetric(key, creative[key])}
              </p>
            </div>
          ))}
        </div>
        {creative.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {creative.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/40"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
