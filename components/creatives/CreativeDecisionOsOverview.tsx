"use client";

import { cn } from "@/lib/utils";
import type {
  CreativeDecisionOperatorQueue,
  CreativeDecisionOsFamily,
  CreativeDecisionOsPattern,
  CreativeDecisionOsV1Response,
} from "@/lib/creative-decision-os";

function formatLifecycleLabel(value: string) {
  return value.replaceAll("_", " ");
}

function queueTone(queue: CreativeDecisionOperatorQueue["key"]) {
  if (queue === "promotion") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (queue === "keep_testing") return "border-sky-200 bg-sky-50 text-sky-900";
  if (queue === "fatigued_blocked") return "border-orange-200 bg-orange-50 text-orange-900";
  return "border-violet-200 bg-violet-50 text-violet-900";
}

function familyTone(family: CreativeDecisionOsFamily) {
  if (family.primaryAction === "promote_to_scaling") {
    return "border-emerald-200 bg-emerald-50";
  }
  if (family.primaryAction === "refresh_replace") {
    return "border-orange-200 bg-orange-50";
  }
  if (family.primaryAction === "block_deploy") {
    return "border-rose-200 bg-rose-50";
  }
  return "border-slate-200 bg-white";
}

function patternTone(pattern: CreativeDecisionOsPattern) {
  if (pattern.lifecycleState === "stable_winner" || pattern.lifecycleState === "scale_ready") {
    return "border-emerald-200 bg-emerald-50";
  }
  if (pattern.lifecycleState === "fatigued_winner") {
    return "border-orange-200 bg-orange-50";
  }
  if (pattern.lifecycleState === "blocked") {
    return "border-rose-200 bg-rose-50";
  }
  return "border-slate-200 bg-white";
}

function supplyTone(kind: CreativeDecisionOsV1Response["supplyPlan"][number]["kind"]) {
  if (kind === "refresh_existing_winner") return "border-orange-200 bg-orange-50";
  if (kind === "expand_angle_family") return "border-emerald-200 bg-emerald-50";
  if (kind === "revive_comeback") return "border-violet-200 bg-violet-50";
  return "border-sky-200 bg-sky-50";
}

function formatShareOfSpend(value: number) {
  return `${Math.round(value * 100)}%`;
}

function HistoricalBucketList({
  title,
  buckets,
  emptyCopy,
}: {
  title: string;
  buckets: CreativeDecisionOsV1Response["historicalAnalysis"]["winningFormats"];
  emptyCopy: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        <span className="text-[11px] text-slate-500">selected period</span>
      </div>
      <div className="space-y-2">
        {buckets.map((bucket) => (
          <div
            key={`${title}-${bucket.label}`}
            className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">{bucket.label}</p>
                <p className="mt-1 text-xs text-slate-600">{bucket.summary}</p>
              </div>
              <div className="text-right text-xs text-slate-700">
                <p>{formatShareOfSpend(bucket.shareOfSpend)} spend share</p>
                <p>{bucket.creativeCount} creatives</p>
              </div>
            </div>
          </div>
        ))}
        {buckets.length === 0 ? (
          <p className="text-sm text-slate-500">{emptyCopy}</p>
        ) : null}
      </div>
    </div>
  );
}

export function CreativeDecisionOsOverview({
  decisionOs,
  isLoading,
  activeFamilyId,
  activeQueueKey,
  onSelectFamily,
  onSelectQueue,
  onClearFilters,
  showHeader = true,
  className,
}: {
  decisionOs: CreativeDecisionOsV1Response | null;
  isLoading: boolean;
  activeFamilyId: string | null;
  activeQueueKey: CreativeDecisionOperatorQueue["key"] | null;
  onSelectFamily: (familyId: string | null) => void;
  onSelectQueue: (queueKey: CreativeDecisionOperatorQueue["key"] | null) => void;
  onClearFilters?: () => void;
  showHeader?: boolean;
  className?: string;
}) {
  if (isLoading) {
    return (
      <section
        className={cn("rounded-2xl border border-slate-200 bg-white p-5", className)}
        data-testid="creative-decision-os-overview"
      >
        <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl border border-slate-100 bg-slate-50" />
          ))}
        </div>
      </section>
    );
  }

  if (!decisionOs) return null;

  const configuredSectionCount = Object.values(
    decisionOs.commercialTruthCoverage.configuredSections,
  ).filter(Boolean).length;

  return (
    <>
      <section
        className={cn(
          "space-y-4 rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#fcfdff_0%,#f8fbff_100%)] p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]",
          className,
        )}
        data-testid="creative-decision-os-overview"
      >
      {showHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Recommendations
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">
              Creative Decision OS
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              {decisionOs.summary.message}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Decisions use live windows. Selected period affects analysis only.
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Decision as of {decisionOs.decisionAsOf} · primary window {decisionOs.decisionWindows.primary30d.startDate} to {decisionOs.decisionWindows.primary30d.endDate}
            </p>
          </div>
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
            Operating Mode:{" "}
            <span className="font-semibold text-slate-900">
              {decisionOs.summary.operatingMode ?? "Unavailable"}
            </span>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-6">
        {[
          ["Total creatives", decisionOs.summary.totalCreatives],
          ["Scale-ready", decisionOs.summary.scaleReadyCount],
          ["Keep testing", decisionOs.summary.keepTestingCount],
          ["Fatigued", decisionOs.summary.fatiguedCount],
          ["Blocked", decisionOs.summary.blockedCount],
          ["Comeback", decisionOs.summary.comebackCount],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["Action core", decisionOs.summary.surfaceSummary.actionCoreCount],
          ["Watchlist", decisionOs.summary.surfaceSummary.watchlistCount],
          ["Archive", decisionOs.summary.surfaceSummary.archiveCount],
          ["Degraded", decisionOs.summary.surfaceSummary.degradedCount],
          ["Protected winners", decisionOs.summary.protectedWinnerCount],
          ["Supply plan", decisionOs.summary.supplyPlanCount],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      {(decisionOs.summary.surfaceSummary.degradedCount > 0 ||
        decisionOs.commercialTruthCoverage.missingInputs.length > 0) ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Degraded commercial truth</p>
          <p className="mt-1">
            {decisionOs.summary.surfaceSummary.degradedCount} deterministic rows are
            trust-capped. Action-core queues exclude watchlist and archive lanes by
            default.
          </p>
          <p className="mt-2 text-xs text-amber-800">
            Configured sections: {configuredSectionCount}/4. Missing inputs:{" "}
            {decisionOs.commercialTruthCoverage.missingInputs.length > 0
              ? decisionOs.commercialTruthCoverage.missingInputs.join(", ")
              : "none"}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div
          className="rounded-2xl border border-slate-200 bg-white p-4"
          data-testid="creative-lifecycle-board"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-950">Lifecycle Board</h3>
            <span className="text-[11px] text-slate-500">
              deterministic state only
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {decisionOs.lifecycleBoard.map((item) => (
              <div key={item.state} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  {formatLifecycleLabel(item.label)}
                </p>
                <p className="mt-1 text-xl font-semibold text-slate-950">{item.count}</p>
              </div>
            ))}
          </div>
        </div>

        <div
          className="rounded-2xl border border-slate-200 bg-white p-4"
          data-testid="creative-operator-queues"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-950">Operator Queues</h3>
            {(activeFamilyId || activeQueueKey) && (
              <button
                type="button"
                onClick={() => {
                  onClearFilters?.();
                  onSelectFamily(null);
                  onSelectQueue(null);
                }}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>
          <div className="space-y-2">
            {decisionOs.operatorQueues.map((queue) => {
              const active = activeQueueKey === queue.key;
              return (
                <button
                  key={queue.key}
                  type="button"
                  onClick={() => onSelectQueue(active ? null : queue.key)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition-colors",
                    queueTone(queue.key),
                    active && "ring-2 ring-slate-300",
                  )}
                  data-testid={`creative-queue-${queue.key}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{queue.label}</p>
                      <p className="mt-1 text-xs opacity-80">{queue.summary}</p>
                    </div>
                    <span className="text-2xl font-semibold">{queue.count}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div
          className="rounded-2xl border border-slate-200 bg-white p-4"
          data-testid="creative-family-board"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-950">Concept Families</h3>
            <span className="text-[11px] text-slate-500">
              click to focus the table
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {decisionOs.families.slice(0, 6).map((family) => {
              const active = activeFamilyId === family.familyId;
              return (
                <button
                  key={family.familyId}
                  type="button"
                  onClick={() => onSelectFamily(active ? null : family.familyId)}
                  className={cn(
                    "rounded-2xl border p-3 text-left transition-colors",
                    familyTone(family),
                    active && "ring-2 ring-slate-300",
                  )}
                  data-testid={`creative-family-${family.familyId}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{family.familyLabel}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {family.metaFamilyLabel} • {family.familySource.replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Provenance {family.provenance.confidence} confidence • {family.provenance.overGroupingRisk} over-grouping risk
                      </p>
                    </div>
                    <span className="rounded-full border border-white/60 bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      {family.lifecycleState.replaceAll("_", " ")}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span>{family.creativeIds.length} creatives</span>
                    <span>${family.totalSpend.toFixed(0)} spend</span>
                    <span>{family.totalPurchases} purchases</span>
                  </div>
                  {family.provenance.evidence[0] ? (
                    <p className="mt-2 text-[11px] text-slate-600">{family.provenance.evidence[0]}</p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div
          className="rounded-2xl border border-slate-200 bg-white p-4"
          data-testid="creative-pattern-board"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-950">Pattern Board</h3>
            <span className="text-[11px] text-slate-500">
              hook / angle / format
            </span>
          </div>
          <div className="space-y-2">
            {decisionOs.patterns.slice(0, 6).map((pattern) => (
              <div
                key={pattern.patternKey}
                className={cn("rounded-xl border p-3", patternTone(pattern))}
              >
                <p className="text-sm font-semibold text-slate-950">
                  {pattern.hook}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {pattern.angle} • {pattern.format}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                  <span>{pattern.creativeIds.length} creatives</span>
                  <span>${pattern.spend.toFixed(0)} spend</span>
                  <span>{pattern.roas.toFixed(2)}x ROAS</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]">
        <div
          className="rounded-2xl border border-slate-200 bg-white p-4"
          data-testid="creative-protected-winners"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-950">Protected Winners</h3>
            <span className="text-[11px] text-slate-500">
              not queued for promotion
            </span>
          </div>
          <div className="space-y-2">
            {decisionOs.protectedWinners.slice(0, 6).map((winner) => (
              <div
                key={winner.creativeId}
                className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{winner.creativeName}</p>
                    <p className="mt-1 text-xs text-slate-600">{winner.familyLabel}</p>
                  </div>
                  <div className="text-right text-xs text-slate-700">
                    <p>{winner.roas.toFixed(2)}x ROAS</p>
                    <p>${winner.spend.toFixed(0)} spend</p>
                  </div>
                </div>
                {winner.reasons[0] ? (
                  <p className="mt-2 text-[11px] text-slate-600">{winner.reasons[0]}</p>
                ) : null}
              </div>
            ))}
            {decisionOs.protectedWinners.length === 0 ? (
              <p className="text-sm text-slate-500">No protected winners are active in the live decision window.</p>
            ) : null}
          </div>
        </div>

        <div
          className="rounded-2xl border border-slate-200 bg-white p-4"
          data-testid="creative-supply-plan"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-950">Supply Planning</h3>
            <span className="text-[11px] text-slate-500">
              deterministic backlog
            </span>
          </div>
          <div className="space-y-2">
            {decisionOs.supplyPlan.slice(0, 6).map((item) => (
              <div
                key={`${item.kind}-${item.familyId}`}
                className={cn("rounded-xl border p-3", supplyTone(item.kind))}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{item.familyLabel}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {item.kind.replaceAll("_", " ")}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/60 bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                    {item.priority}
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-slate-700">{item.summary}</p>
                {item.reasons[0] ? (
                  <p className="mt-2 text-[11px] text-slate-600">{item.reasons[0]}</p>
                ) : null}
              </div>
            ))}
            {decisionOs.supplyPlan.length === 0 ? (
              <p className="text-sm text-slate-500">No supply-planning actions are currently queued.</p>
            ) : null}
          </div>
        </div>
      </div>
      </section>

      <section
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
        data-testid="creative-historical-analysis"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Historical Analysis
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">
              Selected-period format and family patterns
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              {decisionOs.historicalAnalysis.summary}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Selected period {decisionOs.historicalAnalysis.selectedWindow.startDate} to{" "}
              {decisionOs.historicalAnalysis.selectedWindow.endDate}.{" "}
              {decisionOs.historicalAnalysis.selectedWindow.note}
            </p>
          </div>
          <div className="grid gap-2 text-right text-xs text-slate-600">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Rows
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-950">
                {decisionOs.historicalAnalysis.selectedWindow.materialRowCount}/
                {decisionOs.historicalAnalysis.selectedWindow.rowCount}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr_1fr]">
          <HistoricalBucketList
            title="Winning formats"
            buckets={decisionOs.historicalAnalysis.winningFormats}
            emptyCopy="No material selected-period format trend is available."
          />
          <HistoricalBucketList
            title="Hook trends"
            buckets={decisionOs.historicalAnalysis.hookTrends}
            emptyCopy="No hook trend is visible in the selected period."
          />
          <HistoricalBucketList
            title="Angle trends"
            buckets={decisionOs.historicalAnalysis.angleTrends}
            emptyCopy="No messaging-angle trend is visible in the selected period."
          />
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-950">
              Family performance
            </h3>
            <span className="text-[11px] text-slate-500">
              descriptive, not decision-authoritative
            </span>
          </div>
          <div className="space-y-2">
            {decisionOs.historicalAnalysis.familyPerformance.map((family) => (
              <div
                key={family.familyId}
                className="rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      {family.familyLabel}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">{family.summary}</p>
                  </div>
                  <div className="text-right text-xs text-slate-700">
                    <p>{family.dominantFormat} dominant</p>
                    <p>{family.creativeCount} creatives</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                  {family.topHook ? <span>Hook {family.topHook}</span> : null}
                  {family.topAngle ? <span>Angle {family.topAngle}</span> : null}
                  <span>{family.roas.toFixed(2)}x ROAS</span>
                  <span>{family.purchases} purchases</span>
                </div>
              </div>
            ))}
            {decisionOs.historicalAnalysis.familyPerformance.length === 0 ? (
              <p className="text-sm text-slate-500">
                No selected-period family trend is visible yet.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
