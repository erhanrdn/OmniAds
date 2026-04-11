"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type {
  MetaAdSetDecision,
  MetaCampaignDecision,
  MetaDecisionOsV1Response,
  MetaGeoDecision,
  MetaPlacementAnomaly,
} from "@/lib/meta/decision-os";

function formatActionLabel(value: string) {
  return value.replaceAll("_", " ");
}

function confidenceTone(confidence: number) {
  if (confidence >= 0.82) return "text-emerald-700";
  if (confidence >= 0.68) return "text-amber-700";
  return "text-slate-600";
}

function actionTone(action: string) {
  if (action === "pause" || action === "cut") return "bg-red-500/10 text-red-700";
  if (action === "scale_budget" || action === "scale" || action === "recover" || action === "isolate") {
    return "bg-emerald-500/10 text-emerald-700";
  }
  if (action === "rebuild" || action === "exception_review") return "bg-amber-500/10 text-amber-700";
  return "bg-slate-500/10 text-slate-700";
}

function EvidenceChips({
  evidence,
}: {
  evidence: Array<{ label: string; value: string; impact?: string }>;
}) {
  if (evidence.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {evidence.slice(0, 4).map((item) => (
        <div
          key={`${item.label}:${item.value}`}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm"
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            {item.label}
          </p>
          <p className="text-xs font-semibold text-slate-800">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function DecisionListCard({
  title,
  testId,
  empty,
  children,
}: {
  title: string;
  testId: string;
  empty: string;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid={testId}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {title}
      </p>
      <div className="mt-3">{children ?? <p className="text-xs text-slate-500">{empty}</p>}</div>
    </div>
  );
}

function AdSetDecisionRow({ decision }: { decision: MetaAdSetDecision }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{decision.adSetName}</p>
          <p className="mt-0.5 text-xs text-slate-500">{decision.campaignName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
              actionTone(decision.actionType),
            )}
          >
            {formatActionLabel(decision.actionType)}
          </span>
          {decision.noTouch ? (
            <span className="rounded-full bg-blue-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
              no-touch
            </span>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">{decision.reasons[0]}</p>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
        <span>ROAS {decision.supportingMetrics.roas.toFixed(2)}x</span>
        <span>Spend ${decision.supportingMetrics.spend.toFixed(0)}</span>
        <span className={confidenceTone(decision.confidence)}>
          Confidence {(decision.confidence * 100).toFixed(0)}%
        </span>
      </div>
      {decision.guardrails.length > 0 ? (
        <p className="mt-2 text-[11px] text-slate-500">{decision.guardrails[0]}</p>
      ) : null}
    </div>
  );
}

function GeoDecisionRow({ decision }: { decision: MetaGeoDecision }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{decision.label}</p>
          <p className="text-xs text-slate-500">{decision.countryCode}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
            actionTone(decision.action),
          )}
        >
          {decision.action}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-600">{decision.why}</p>
      <div className="mt-2 text-[11px] text-slate-500">
        Confidence {(decision.confidence * 100).toFixed(0)}%
      </div>
    </div>
  );
}

function PlacementAnomalyRow({ anomaly }: { anomaly: MetaPlacementAnomaly }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{anomaly.label}</p>
        <span
          className={cn(
            "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
            actionTone(anomaly.action),
          )}
        >
          {formatActionLabel(anomaly.action)}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-600">{anomaly.note}</p>
    </div>
  );
}

export function MetaDecisionOsOverview({
  decisionOs,
  isLoading,
}: {
  decisionOs: MetaDecisionOsV1Response | null | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="meta-decision-os-loading">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    );
  }

  if (!decisionOs) return null;

  return (
    <div className="space-y-4" data-testid="meta-decision-os-overview">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Today&apos;s Plan
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">
              {decisionOs.summary.todayPlanHeadline}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Decisions use live windows. Selected period affects analysis only.
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Decision as of {decisionOs.decisionAsOf} · primary window {decisionOs.decisionWindows.primary30d.startDate} to {decisionOs.decisionWindows.primary30d.endDate}
            </p>
          </div>
          {decisionOs.summary.operatingMode ? (
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Operating Mode
              </p>
              <p className="text-sm font-semibold text-slate-900">
                {decisionOs.summary.operatingMode.recommendedMode}
              </p>
              <p className="text-[11px] text-slate-500">
                {(decisionOs.summary.operatingMode.confidence * 100).toFixed(0)}% confidence
              </p>
            </div>
          ) : null}
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {decisionOs.summary.todayPlan.slice(0, 6).map((item) => (
            <div
              key={item}
              className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-sm text-slate-700"
            >
              {item}
            </div>
          ))}
        </div>
      </div>

      <DecisionListCard
        title="Budget Shift Board"
        testId="meta-budget-shift-board"
        empty="No clean budget shift pair is ready."
      >
        {decisionOs.budgetShifts.length === 0 ? (
          <p className="text-xs text-slate-500">No clean budget shift pair is ready.</p>
        ) : (
          <div className="space-y-3">
            {decisionOs.budgetShifts.map((shift) => (
              <div key={`${shift.fromCampaignId}:${shift.toCampaignId}`} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {shift.from} -&gt; {shift.to}
                    </p>
                    <p className="text-xs text-slate-500">{shift.whyNow}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Move Band
                    </p>
                    <p className="text-sm font-semibold text-slate-900">{shift.suggestedMoveBand}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DecisionListCard>

      <DecisionListCard
        title="Top Ad Set Actions"
        testId="meta-top-adset-actions"
        empty="No ad set actions are available."
      >
        {decisionOs.adSets.length === 0 ? (
          <p className="text-xs text-slate-500">No ad set actions are available.</p>
        ) : (
          <div className="space-y-3">
            {decisionOs.adSets.slice(0, 5).map((decision) => (
              <AdSetDecisionRow key={decision.decisionId} decision={decision} />
            ))}
          </div>
        )}
      </DecisionListCard>

      <DecisionListCard title="GEO OS" testId="meta-geo-board" empty="No GEO actions are available.">
        {decisionOs.geoDecisions.length === 0 ? (
          <p className="text-xs text-slate-500">No GEO actions are available.</p>
        ) : (
          <div className="space-y-3">
            {decisionOs.geoDecisions.slice(0, 5).map((decision) => (
              <GeoDecisionRow key={decision.geoKey} decision={decision} />
            ))}
          </div>
        )}
      </DecisionListCard>

      <DecisionListCard
        title="Placement Anomalies"
        testId="meta-placement-anomalies"
        empty="No placement anomaly needs exception review."
      >
        {decisionOs.placementAnomalies.length === 0 ? (
          <p className="text-xs text-slate-500">
            Advantage+ placements should stay on. No exception review is justified right now.
          </p>
        ) : (
          <div className="space-y-3">
            {decisionOs.placementAnomalies.map((anomaly) => (
              <PlacementAnomalyRow key={anomaly.placementKey} anomaly={anomaly} />
            ))}
          </div>
        )}
      </DecisionListCard>

      <DecisionListCard title="No-Touch List" testId="meta-no-touch-list" empty="No protected winner path is active.">
        {decisionOs.noTouchList.length === 0 ? (
          <p className="text-xs text-slate-500">No protected winner path is active.</p>
        ) : (
          <div className="space-y-3">
            {decisionOs.noTouchList.map((item) => (
              <div key={`${item.entityType}:${item.entityId}`} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                  <span className="rounded-full bg-blue-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                    {item.entityType}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600">{item.reason}</p>
              </div>
            ))}
          </div>
        )}
      </DecisionListCard>
    </div>
  );
}

export function MetaCampaignDecisionPanel({
  campaignDecision,
  adSetDecisions,
}: {
  campaignDecision: MetaCampaignDecision | null;
  adSetDecisions: MetaAdSetDecision[];
}) {
  if (!campaignDecision) return null;

  return (
    <div className="space-y-4" data-testid="meta-campaign-decision-panel">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Campaign Role
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">{campaignDecision.role}</h3>
            <p className="mt-1 text-sm text-slate-600">{campaignDecision.why}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                actionTone(campaignDecision.primaryAction),
              )}
            >
              {formatActionLabel(campaignDecision.primaryAction)}
            </span>
            {campaignDecision.noTouch ? (
              <span className="rounded-full bg-blue-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                no-touch
              </span>
            ) : null}
          </div>
        </div>
        <div className="mt-3 text-[11px] text-slate-500">
          Confidence {(campaignDecision.confidence * 100).toFixed(0)}%
        </div>
        <EvidenceChips evidence={campaignDecision.evidence} />
        {campaignDecision.guardrails.length > 0 ? (
          <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs text-slate-600">
            {campaignDecision.guardrails[0]}
          </div>
        ) : null}
      </div>

      <DecisionListCard
        title="Ad Set Actions"
        testId="meta-campaign-adset-actions"
        empty="No ad set actions are available for this campaign."
      >
        {adSetDecisions.length === 0 ? (
          <p className="text-xs text-slate-500">No ad set actions are available for this campaign.</p>
        ) : (
          <div className="space-y-3">
            {adSetDecisions.map((decision) => (
              <AdSetDecisionRow key={decision.decisionId} decision={decision} />
            ))}
          </div>
        )}
      </DecisionListCard>
    </div>
  );
}
