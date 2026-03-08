"use client";

import { useMemo } from "react";
import { Copy, CalendarRange, Rows3 } from "lucide-react";
import { CreativePreview } from "@/components/creatives/CreativePreview";
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
      return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
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

function metricValue(creative: SharedCreative, key: ShareMetricKey): number {
  return creative[key];
}

function heatColor(value: number, min: number, max: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return "transparent";
  const ratio = (value - min) / (max - min);
  const alpha = 0.05 + ratio * 0.12;
  const green = ratio >= 0.5;
  return green
    ? `rgba(16, 185, 129, ${alpha.toFixed(3)})`
    : `rgba(244, 63, 94, ${alpha.toFixed(3)})`;
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
    includeNotes,
    note,
    groupBy,
    filters,
    selectedRowIds,
    totalRows,
    createdAt,
  } = payload;

  const extremes = useMemo(
    () =>
      metrics.reduce<Record<string, { min: number; max: number }>>((acc, key) => {
        const values = creatives.map((item) => metricValue(item, key));
        acc[key] = {
          min: values.length > 0 ? Math.min(...values) : 0,
          max: values.length > 0 ? Math.max(...values) : 0,
        };
        return acc;
      }, {}),
    [creatives, metrics]
  );

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] px-3 py-4 sm:px-5 sm:py-5">
      <main className="mx-auto w-full max-w-[1320px] rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-sm sm:p-4">
        <header className="mb-3 border-b border-[#ECEFF3] pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-[#111827]">{title || "Top Creatives"}</h1>
              <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-[#6B7280]">
                <CalendarRange className="h-3.5 w-3.5" />
                {dateRange}
              </p>
            </div>
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#D1D5DB] px-2.5 py-1.5 text-xs text-[#374151] hover:bg-[#F9FAFB]"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy link
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[#6B7280]">
            <span className="inline-flex items-center gap-1">
              <Rows3 className="h-3.5 w-3.5" />
              {creatives.length} creatives
            </span>
            {typeof totalRows === "number" ? <span>{totalRows} rows in snapshot</span> : null}
            {groupBy ? <span>Group by: {groupBy}</span> : null}
            {selectedRowIds && selectedRowIds.length > 0 ? <span>Selection: {selectedRowIds.length}</span> : null}
            <span>Generated: {new Date(createdAt).toLocaleString()}</span>
          </div>

          {filters && filters.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {filters.map((item) => (
                <span key={item} className="rounded-full border border-[#E5E7EB] bg-[#F9FAFB] px-2 py-0.5 text-[11px] text-[#6B7280]">
                  {item}
                </span>
              ))}
            </div>
          )}
        </header>

        <section className="space-y-2">
          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2.5">
              {creatives.map((creative) => (
                <article key={creative.id} className="w-[190px] shrink-0 overflow-hidden rounded-lg border border-[#E5E7EB] bg-white">
                  <CreativePreview
                    creative={{
                      name: creative.name,
                      isCatalog: creative.isCatalog,
                      previewState: creative.previewState,
                      previewUrl: creative.previewUrl,
                      imageUrl: creative.imageUrl,
                      thumbnailUrl: creative.thumbnailUrl,
                    }}
                    aspectRatio="square"
                  />
                  <div className="space-y-1 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="line-clamp-1 text-[12px] font-medium text-[#111827]">{creative.name}</p>
                      <span className="rounded border border-[#E5E7EB] bg-[#F9FAFB] px-1.5 py-0.5 text-[10px] text-[#6B7280]">
                        {creative.format === "video" ? "Video" : "Image"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                      {metrics.slice(0, 4).map((metric) => (
                        <div key={`${creative.id}_${metric}`}>
                          <p className="text-[10px] text-[#9CA3AF]">{METRIC_LABELS[metric]}</p>
                          <p className="text-[11px] font-semibold tabular-nums text-[#111827]">
                            {formatMetric(metric, metricValue(creative, metric))}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[#E5E7EB]">
            <table className="min-w-full text-[12px]">
              <thead className="bg-[#F9FAFB]">
                <tr className="border-b border-[#E5E7EB]">
                  <th className="px-3 py-2 text-left font-medium text-[#6B7280]">Creative</th>
                  {metrics.map((metric) => (
                    <th key={metric} className="px-3 py-2 text-right font-medium text-[#6B7280]">
                      {METRIC_LABELS[metric]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {creatives.map((creative) => (
                  <tr key={`table_${creative.id}`} className="border-b border-[#F0F2F5]">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <CreativePreview
                          creative={{
                            name: creative.name,
                            isCatalog: creative.isCatalog,
                            previewState: creative.previewState,
                            previewUrl: creative.previewUrl,
                            imageUrl: creative.imageUrl,
                            thumbnailUrl: creative.thumbnailUrl,
                          }}
                          aspectRatio="video"
                          className="h-8 w-14 rounded"
                        />
                        <span className="line-clamp-2 text-[11px] text-[#111827]">{creative.name}</span>
                      </div>
                    </td>
                    {metrics.map((metric) => {
                      const ext = extremes[metric];
                      const value = metricValue(creative, metric);
                      return (
                        <td
                          key={`cell_${creative.id}_${metric}`}
                          className="px-3 py-2 text-right tabular-nums text-[#111827]"
                          style={{ backgroundColor: heatColor(value, ext?.min ?? value, ext?.max ?? value) }}
                        >
                          {formatMetric(metric, value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {includeNotes && note ? (
          <section className="mt-2 rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] px-3 py-2 text-[12px] text-[#4B5563]">
            {note}
          </section>
        ) : null}

        <footer className="mt-3 border-t border-[#ECEFF3] pt-2 text-[11px] text-[#9CA3AF]">
          Read-only shared report.
        </footer>
      </main>
    </div>
  );
}
