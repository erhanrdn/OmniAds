"use client";

import { useMemo } from "react";
import { CalendarRange, Copy, Rows3 } from "lucide-react";
import { CreativeRenderSurface } from "@/components/creatives/CreativeRenderSurface";
import {
  SHARE_TABLE_COLUMNS,
  buildShareDistributions,
  buildShareTableCalcContext,
  evaluateShareMetricCell,
  isShareMetricApplicable,
  toShareHeatColor,
} from "@/components/creatives/shareTableEngine";
import { ShareMetricKey, SharePayload, SharedCreative } from "./shareCreativeTypes";

type TopMetricLabelMap = Record<ShareMetricKey, string>;

type PublicShareCreative = SharedCreative & {
  cardPreviewUrl?: string | null;
  tableThumbnailUrl?: string | null;
  cachedThumbnailUrl?: string | null;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  previewUrl?: string | null;
};

const TOP_METRIC_LABELS: TopMetricLabelMap = {
  spend: "Spend",
  purchaseValue: "Purchase value",
  roas: "ROAS",
  cpa: "CPA",
  ctrAll: "CTR",
  purchases: "Purchases",
};

function formatTopMetric(key: ShareMetricKey, value: number): string {
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

function topMetricValue(creative: SharedCreative, key: ShareMetricKey): number {
  return creative[key];
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
    benchmarkCreatives,
    includeNotes,
    note,
    groupBy,
    filters,
    selectedRowIds,
    totalRows,
    createdAt,
  } = payload;

  const displayRows = creatives as PublicShareCreative[];
  const benchmarkRows = useMemo(
    () => ((benchmarkCreatives && benchmarkCreatives.length > 0 ? benchmarkCreatives : creatives) as PublicShareCreative[]),
    [benchmarkCreatives, creatives]
  );

  const benchmarkCtx = useMemo(() => buildShareTableCalcContext(benchmarkRows), [benchmarkRows]);
  const displayCtx = useMemo(() => buildShareTableCalcContext(displayRows), [displayRows]);

  const distributions = useMemo(
    () =>
      buildShareDistributions({
        benchmarkRows,
        benchmarkCtx,
      }),
    [benchmarkCtx, benchmarkRows]
  );

  const roasDistribution = distributions.value.roas;

  const tableMinWidth = useMemo(() => {
    const staticWidth = 300;
    return staticWidth + SHARE_TABLE_COLUMNS.reduce((sum, column) => sum + column.minWidth, 0);
  }, []);

  const createdAtLabel = useMemo(() => new Date(createdAt).toLocaleString(), [createdAt]);

  const copyLink = async () => {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // no-op
    }
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
              {displayRows.length} creatives
            </span>
            {typeof totalRows === "number" ? <span>{totalRows} rows in snapshot</span> : null}
            <span>{benchmarkRows.length} rows in benchmark</span>
            {groupBy ? <span>Group by: {groupBy}</span> : null}
            {selectedRowIds && selectedRowIds.length > 0 ? <span>Selection: {selectedRowIds.length}</span> : null}
            <span>Generated: {createdAtLabel}</span>
          </div>

          {filters && filters.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {filters.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-[#E5E7EB] bg-[#F9FAFB] px-2 py-0.5 text-[11px] text-[#6B7280]"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </header>

        <section className="space-y-2">
          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2.5">
              {displayRows.map((creative) => (
                <article
                  key={creative.id}
                  className="w-[190px] shrink-0 overflow-hidden rounded-lg border border-[#E5E7EB] bg-white"
                >
                  <CreativeRenderSurface
                    id={creative.id}
                    name={creative.name}
                    preview={creative.preview}
                    size="card"
                    mode="asset"
                    assetFallbacks={[
                      creative.cardPreviewUrl,
                      creative.imageUrl,
                      creative.preview?.image_url,
                      creative.preview?.poster_url,
                      creative.previewUrl,
                      creative.cachedThumbnailUrl,
                      creative.thumbnailUrl,
                    ]}
                  />
                  <div className="space-y-1 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="line-clamp-1 text-[12px] font-medium text-[#111827]">{creative.name}</p>
                      <span className="rounded border border-[#E5E7EB] bg-[#F9FAFB] px-1.5 py-0.5 text-[10px] text-[#6B7280]">
                        {creative.format === "video" ? "Video" : creative.format === "catalog" ? "Catalog" : "Image"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                      {metrics.slice(0, 4).map((metric) => (
                        <div key={`${creative.id}_${metric}`}>
                          <p className="text-[10px] text-[#9CA3AF]">{TOP_METRIC_LABELS[metric]}</p>
                          <p className="text-[11px] font-semibold tabular-nums text-[#111827]">
                            {formatTopMetric(metric, topMetricValue(creative, metric))}
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
            <table className="text-[12px]" style={{ minWidth: tableMinWidth }}>
              <thead className="bg-[#F9FAFB]">
                <tr className="border-b border-[#E5E7EB]">
                  <th className="px-3 py-2 text-left font-medium text-[#6B7280]">Creative</th>
                  {SHARE_TABLE_COLUMNS.map((column) => (
                    <th key={column.key} className="whitespace-nowrap px-3 py-2 text-right font-medium text-[#6B7280]">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((creative) => (
                  <tr key={`table_${creative.id}`} className="border-b border-[#F0F2F5]">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <CreativeRenderSurface
                          id={creative.id}
                          name={creative.name}
                          preview={creative.preview}
                          size="thumb"
                          mode="asset"
                          className="h-8 w-14 rounded"
                          assetFallbacks={[
                            creative.tableThumbnailUrl,
                            creative.cachedThumbnailUrl,
                            creative.thumbnailUrl,
                            creative.imageUrl,
                            creative.preview?.image_url,
                            creative.preview?.poster_url,
                            creative.previewUrl,
                          ]}
                        />
                        <span className="line-clamp-2 text-[11px] text-[#111827]">{creative.name}</span>
                      </div>
                    </td>
                    {SHARE_TABLE_COLUMNS.map((column) => {
                      const value = column.getValue(creative, displayCtx);
                      const distribution = distributions.value[column.key];
                      const spendDistribution = distributions.spend[column.key];

                      if (!distribution || !spendDistribution || !roasDistribution) {
                        return (
                          <td
                            key={`cell_${creative.id}_${column.key}`}
                            className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-[#111827]"
                          >
                            {column.format(value, creative)}
                          </td>
                        );
                      }

                      const evaluation = evaluateShareMetricCell({
                        key: column.key,
                        row: creative,
                        value,
                        distribution,
                        roasDistribution,
                        spendDistribution,
                      });

                      return (
                        <td
                          key={`cell_${creative.id}_${column.key}`}
                          className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-[#111827]"
                          style={{
                            backgroundColor: evaluation.applicable
                              ? toShareHeatColor(evaluation.tone, evaluation.intensity)
                              : "transparent",
                          }}
                          title={evaluation.reason}
                        >
                          {isShareMetricApplicable(column.key, creative) ? (
                            column.format(value, creative)
                          ) : (
                            <span className="text-[#9CA3AF]">—</span>
                          )}
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
