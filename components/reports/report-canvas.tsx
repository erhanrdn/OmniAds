"use client";

import type { RenderedReportPayload, RenderedReportWidget } from "@/lib/custom-reports";

function slotStyle(slot: number, widget: RenderedReportWidget) {
  const colStart = (slot % 4) + 1;
  const rowStart = Math.floor(slot / 4) + 1;
  const colSpan = widget.colSpan;
  const rowSpan = widget.rowSpan;

  return {
    gridColumn: `${colStart} / span ${Math.min(colSpan, 5 - colStart)}`,
    gridRow: `${rowStart} / span ${rowSpan}`,
  };
}

function MiniChart({
  points,
  series,
  tone,
}: {
  points: Array<{ label: string; value: number }>;
  series?: Array<{
    key: string;
    label: string;
    color: string;
    points: Array<{ label: string; value: number }>;
  }>;
  tone: "line" | "bar";
}) {
  const activeSeries = series?.length ? series : [{ key: "default", label: "", color: "#2563eb", points }];
  if (!activeSeries.some((item) => item.points.length > 0)) {
    return <div className="text-xs text-muted-foreground">No chart data yet.</div>;
  }
  const flattened = activeSeries.flatMap((item) => item.points.map((point) => point.value));
  const max = Math.max(...flattened, 1);

  if (tone === "bar") {
    return (
      <div className="flex h-28 items-end gap-2">
        {(activeSeries[0]?.points ?? []).map((point) => (
          <div key={point.label} className="flex flex-1 flex-col items-center gap-2">
            <div
              className="w-full rounded-t-lg bg-blue-500/75"
              style={{ height: `${Math.max(6, (point.value / max) * 100)}%` }}
            />
            <span className="text-[10px] text-muted-foreground">{point.label}</span>
          </div>
        ))}
      </div>
    );
  }

  const width = 100;
  const height = 48;

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-full overflow-visible">
        {activeSeries.map((item) => {
          const path = item.points
            .map((point, index) => {
              const x = item.points.length === 1 ? 0 : (index / (item.points.length - 1)) * width;
              const y = height - (point.value / max) * height;
              return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
            })
            .join(" ");
          return (
            <path
              key={item.key}
              d={path}
              fill="none"
              stroke={item.color}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      {activeSeries.length > 1 ? (
        <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
          {activeSeries.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-6 gap-2 text-[10px] text-muted-foreground">
        {(activeSeries[0]?.points ?? []).slice(-6).map((point) => (
          <span key={point.label}>{point.label}</span>
        ))}
      </div>
    </div>
  );
}

function ReportWidgetCard({ widget }: { widget: RenderedReportWidget }) {
  if (widget.type === "section") {
    return (
      <article className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff,#f8fafc)] p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Section
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              {widget.title}
            </h2>
            {widget.subtitle ? (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{widget.subtitle}</p>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{widget.title}</h3>
          {widget.subtitle ? (
            <p className="mt-1 text-xs text-slate-500">{widget.subtitle}</p>
          ) : null}
        </div>
        {widget.warning ? (
          <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700">
            Warning
          </span>
        ) : null}
      </div>

      {widget.type === "metric" ? (
        <div className="mt-6">
          <div className="text-3xl font-semibold tracking-tight text-slate-950">
            {widget.value ?? "-"}
          </div>
          {widget.deltaLabel ? (
            <div className="mt-2 text-xs text-slate-500">{widget.deltaLabel}</div>
          ) : null}
        </div>
      ) : null}

      {(widget.type === "trend" || widget.type === "bar") && widget.points ? (
        <div className="mt-5">
          <MiniChart
            points={widget.points}
            series={widget.series}
            tone={widget.type === "bar" ? "bar" : "line"}
          />
        </div>
      ) : null}

      {widget.type === "table" ? (
        <div className="mt-5 overflow-hidden rounded-2xl border">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {(widget.columns ?? []).map((column) => (
                    <th
                      key={column}
                      className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {column.replace(/_/g, " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(widget.rows ?? []).map((row, index) => (
                  <tr key={index} className="border-t">
                    {(widget.columns ?? []).map((column) => (
                      <td key={column} className="px-3 py-2 text-slate-700">
                        {String(row[column] ?? "-")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {widget.type === "text" ? (
        <div className="mt-5 whitespace-pre-wrap text-sm leading-6 text-slate-700">
          {widget.text || "Add commentary, summary, or next steps here."}
        </div>
      ) : null}

      {widget.emptyMessage && !widget.rows?.length && !widget.points?.length && !widget.value ? (
        <p className="mt-4 text-xs text-slate-400">{widget.emptyMessage}</p>
      ) : null}
      {widget.warning ? <p className="mt-4 text-xs text-amber-700">{widget.warning}</p> : null}
    </article>
  );
}

export function ReportCanvas({ report }: { report: RenderedReportPayload }) {
  return (
    <section
      className="grid gap-4"
      style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gridAutoRows: "minmax(180px, auto)" }}
    >
      {report.widgets.map((widget) => (
        <div key={widget.id} style={slotStyle(widget.slot, widget)}>
          <ReportWidgetCard widget={widget} />
        </div>
      ))}
    </section>
  );
}
