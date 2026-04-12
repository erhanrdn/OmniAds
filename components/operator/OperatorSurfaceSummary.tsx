import { cn } from "@/lib/utils";
import {
  operatorStateLabel,
  type OperatorAuthorityState,
  type OperatorSurfaceItem,
  type OperatorSurfaceModel,
} from "@/lib/operator-surface";

function toneClasses(state: OperatorAuthorityState) {
  if (state === "act_now") {
    return {
      panel: "border-emerald-200 bg-emerald-50/70",
      pill: "border-emerald-200 bg-emerald-100 text-emerald-900",
      action: "bg-emerald-600 text-white",
    };
  }
  if (state === "needs_truth") {
    return {
      panel: "border-amber-200 bg-amber-50/80",
      pill: "border-amber-200 bg-amber-100 text-amber-900",
      action: "bg-amber-600 text-white",
    };
  }
  if (state === "blocked") {
    return {
      panel: "border-orange-200 bg-orange-50/80",
      pill: "border-orange-200 bg-orange-100 text-orange-900",
      action: "bg-orange-600 text-white",
    };
  }
  if (state === "watch") {
    return {
      panel: "border-sky-200 bg-sky-50/80",
      pill: "border-sky-200 bg-sky-100 text-sky-900",
      action: "bg-sky-600 text-white",
    };
  }
  return {
    panel: "border-slate-200 bg-slate-50/80",
    pill: "border-slate-200 bg-slate-100 text-slate-800",
    action: "bg-slate-700 text-white",
  };
}

function confidenceTone(confidence: OperatorSurfaceItem["confidence"]) {
  if (confidence === "High") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (confidence === "Medium") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function OperatorRowCard({ item }: { item: OperatorSurfaceItem }) {
  const tones = toneClasses(item.authorityState);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-950">{item.title}</p>
          {item.subtitle ? <p className="mt-0.5 truncate text-xs text-slate-500">{item.subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
              tones.action,
            )}
          >
            {item.primaryAction}
          </span>
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
              tones.pill,
            )}
          >
            {operatorStateLabel(item.authorityState)}
          </span>
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
              confidenceTone(item.confidence),
            )}
          >
            {item.confidence}
          </span>
        </div>
      </div>

      {item.secondaryLabels && item.secondaryLabels.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.secondaryLabels.slice(0, 3).map((label) => (
            <span
              key={`${item.id}:${label}`}
              className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-700"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}

      <p className="mt-2 text-sm leading-relaxed text-slate-800">{item.reason}</p>
      {item.blocker ? (
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          Blocker: {item.blocker}
        </p>
      ) : null}
      {item.metrics.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.metrics.map((metric) => (
            <span
              key={`${item.id}:${metric.label}`}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-700"
            >
              <span className="font-semibold text-slate-900">{metric.label}</span> {metric.value}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OperatorSurfaceSummary({
  model,
  className,
  maxRowsPerBucket = 3,
}: {
  model: OperatorSurfaceModel | null;
  className?: string;
  maxRowsPerBucket?: number;
}) {
  if (!model) return null;

  const tones = toneClasses(model.emphasis);

  return (
    <section className={cn("space-y-4", className)} data-testid={`${model.surfaceLabel.toLowerCase()}-operator-surface`}>
      <div
        className={cn(
          "rounded-2xl border p-4 shadow-sm",
          tones.panel,
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              {model.surfaceLabel} {model.heading}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">{model.headline}</h3>
            <p className="mt-1 text-sm text-slate-700">{model.note}</p>
            {model.blocker ? <p className="mt-2 text-xs text-slate-600">{model.blocker}</p> : null}
          </div>
          <span
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide",
              tones.pill,
            )}
          >
            {operatorStateLabel(model.emphasis)}
          </span>
        </div>
        {model.hiddenSummary ? (
          <p className="mt-3 text-xs text-slate-600">{model.hiddenSummary}</p>
        ) : null}
      </div>

      {model.buckets.map((bucket) => (
        <div key={bucket.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {bucket.label}
              </p>
              <p className="mt-1 text-sm text-slate-600">{bucket.summary}</p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-800">
              {bucket.rows.length}
            </span>
          </div>
          {bucket.rows.length > 0 ? (
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              {bucket.rows.slice(0, maxRowsPerBucket).map((item) => (
                <OperatorRowCard key={item.id} item={item} />
              ))}
            </div>
          ) : null}
          {bucket.rows.length > maxRowsPerBucket ? (
            <p className="mt-3 text-xs text-slate-500">
              +{bucket.rows.length - maxRowsPerBucket} more {bucket.rows.length - maxRowsPerBucket === 1 ? "row" : "rows"} in this bucket.
            </p>
          ) : null}
          {bucket.mutedCount > 0 ? (
            <p className="mt-3 text-xs text-slate-500">
              {bucket.mutedCount} thin-signal or inactive {bucket.mutedCount === 1 ? "row stays" : "rows stay"} out of the headline stack.
            </p>
          ) : null}
        </div>
      ))}
    </section>
  );
}
