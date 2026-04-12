"use client";

import type { ReactNode } from "react";
import { DecisionAuthorityPanel } from "@/components/decision-trust/DecisionAuthorityPanel";
import { DecisionPolicyExplanationPanel } from "@/components/decision-trust/DecisionPolicyExplanationPanel";
import { cn } from "@/lib/utils";
import type {
  MetaAdSetDecision,
  MetaCampaignDecision,
  MetaDecisionPolicy,
  MetaDecisionOsV1Response,
  MetaGeoDecision,
  MetaOpportunityBoardItem,
  MetaPlacementAnomaly,
  MetaWinnerScaleCandidate,
} from "@/lib/meta/decision-os";

function formatActionLabel(value: string) {
  return value.replaceAll("_", " ");
}

function formatPolicyLabel(value: string) {
  return value.replaceAll("_", " ");
}

function formatTimestampLabel(value: string | null) {
  if (!value) return "Unavailable";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 16).replace("T", " ");
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

function trustTone(
  disposition: MetaAdSetDecision["trust"]["operatorDisposition"],
) {
  if (disposition === "protected_watchlist") return "bg-blue-500/10 text-blue-700";
  if (disposition === "archive_only") return "bg-slate-500/10 text-slate-700";
  if (disposition === "degraded_no_scale") return "bg-orange-500/10 text-orange-700";
  if (disposition === "review_hold" || disposition === "review_reduce") {
    return "bg-amber-500/10 text-amber-700";
  }
  if (disposition === "monitor_low_truth") return "bg-sky-500/10 text-sky-700";
  return "bg-slate-500/10 text-slate-700";
}

function laneTone(lane: MetaAdSetDecision["trust"]["surfaceLane"]) {
  if (lane === "action_core") return "bg-emerald-500/10 text-emerald-700";
  if (lane === "watchlist") return "bg-blue-500/10 text-blue-700";
  return "bg-slate-500/10 text-slate-700";
}

function PolicyChips({
  policy,
}: {
  policy: MetaDecisionPolicy;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-wide">
      <span className="rounded-full bg-violet-500/10 px-2 py-1 text-violet-700">
        strategy {formatPolicyLabel(policy.strategyClass)}
      </span>
      <span className="rounded-full bg-slate-500/10 px-2 py-1 text-slate-700">
        objective {formatPolicyLabel(policy.objectiveFamily)}
      </span>
      <span className="rounded-full bg-slate-500/10 px-2 py-1 text-slate-700">
        bid {formatPolicyLabel(policy.bidRegime)}
      </span>
      <span className="rounded-full bg-amber-500/10 px-2 py-1 text-amber-700">
        driver {formatPolicyLabel(policy.primaryDriver)}
      </span>
    </div>
  );
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
          {decision.trust.operatorDisposition !== "standard" ? (
            <span
              className={cn(
                "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                trustTone(decision.trust.operatorDisposition),
              )}
            >
              {formatActionLabel(decision.trust.operatorDisposition)}
            </span>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">{decision.reasons[0]}</p>
      <PolicyChips policy={decision.policy} />
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
        <span>ROAS {decision.supportingMetrics.roas.toFixed(2)}x</span>
        <span>Spend ${decision.supportingMetrics.spend.toFixed(0)}</span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 capitalize",
            laneTone(decision.trust.surfaceLane),
          )}
        >
          {decision.trust.surfaceLane.replaceAll("_", " ")}
        </span>
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

function WinnerScaleCandidateRow({
  candidate,
}: {
  candidate: MetaWinnerScaleCandidate;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{candidate.adSetName}</p>
          <p className="mt-0.5 text-xs text-slate-500">{candidate.campaignName}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Move band
          </p>
          <p className="text-sm font-semibold text-slate-900">{candidate.suggestedMoveBand}</p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">{candidate.why}</p>
      <PolicyChips policy={candidate.policy} />
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
        <span>ROAS {candidate.supportingMetrics.roas.toFixed(2)}x</span>
        <span>Spend ${candidate.supportingMetrics.spend.toFixed(0)}</span>
        <span>Purchases {candidate.supportingMetrics.purchases}</span>
        <span className={confidenceTone(candidate.confidence)}>
          Confidence {(candidate.confidence * 100).toFixed(0)}%
        </span>
      </div>
      {candidate.guardrails.length > 0 ? (
        <p className="mt-2 text-[11px] text-slate-500">{candidate.guardrails[0]}</p>
      ) : null}
    </div>
  );
}

function OpportunityBoardRow({
  item,
}: {
  item: MetaOpportunityBoardItem;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
          <p className="mt-1 text-xs text-slate-600">{item.summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
              item.queue.eligible
                ? "bg-emerald-500/10 text-emerald-700"
                : "bg-slate-500/10 text-slate-700",
            )}
          >
            {item.queue.eligible ? "queue-ready" : "board-only"}
          </span>
          <span className="rounded-full bg-slate-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
            {formatActionLabel(item.kind)}
          </span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
        <span>{formatActionLabel(item.recommendedAction)}</span>
        <span className={confidenceTone(item.confidence)}>
          Confidence {(item.confidence * 100).toFixed(0)}%
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {item.evidenceFloors.slice(0, 3).map((floor) => (
          <span
            key={`${item.opportunityId}:${floor.key}`}
            className={cn(
              "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
              floor.status === "met"
                ? "bg-emerald-500/10 text-emerald-700"
                : floor.status === "watch"
                  ? "bg-amber-500/10 text-amber-700"
                  : "bg-slate-500/10 text-slate-700",
            )}
          >
            {floor.label}: {floor.current}
          </span>
        ))}
      </div>
    </div>
  );
}

function GeoDecisionRow({ decision }: { decision: MetaGeoDecision }) {
  const supportingMetrics = decision.supportingMetrics ?? {
    roas: 0,
    spend: 0,
  };
  const commercialContext = decision.commercialContext ?? {
    serviceability: null,
    scaleOverride: null,
  };
  const freshness = decision.freshness ?? {
    dataState: "syncing",
    isPartial: false,
    lastSyncedAt: null,
  };
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
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
        <span>ROAS {supportingMetrics.roas.toFixed(2)}x</span>
        <span>Spend ${supportingMetrics.spend.toFixed(0)}</span>
        <span>
          {commercialContext.serviceability ?? "unknown"} / {commercialContext.scaleOverride ?? "default"}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 capitalize",
            laneTone(decision.trust.surfaceLane),
          )}
        >
          {decision.trust.surfaceLane.replaceAll("_", " ")}
        </span>
        {decision.trust.operatorDisposition !== "standard" ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 capitalize",
              trustTone(decision.trust.operatorDisposition),
            )}
          >
            {formatActionLabel(decision.trust.operatorDisposition)}
          </span>
        ) : null}
        Confidence {(decision.confidence * 100).toFixed(0)}%
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Source {freshness.dataState}
        {freshness.isPartial ? " · partial" : ""}
        {freshness.lastSyncedAt ? ` · updated ${formatTimestampLabel(freshness.lastSyncedAt)}` : ""}
      </p>
    </div>
  );
}

function GeoWatchlistClusterRow({ decision }: { decision: MetaGeoDecision }) {
  const commercialContext = decision.commercialContext ?? {
    priorityTier: null,
    serviceability: null,
  };
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            {decision.clusterLabel ?? decision.label}
          </p>
          <p className="mt-1 text-xs text-slate-600">{decision.why}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
              actionTone(decision.action),
            )}
          >
            {formatActionLabel(decision.action)}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
              trustTone(decision.trust.operatorDisposition),
            )}
          >
            {formatActionLabel(decision.trust.operatorDisposition)}
          </span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
        <span>{decision.groupMemberCount} GEOs</span>
        <span>{commercialContext.priorityTier ?? "unconfigured"}</span>
        <span>{commercialContext.serviceability ?? "unknown serviceability"}</span>
        <span className={confidenceTone(decision.confidence)}>
          Confidence {(decision.confidence * 100).toFixed(0)}%
        </span>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Members {decision.groupMemberLabels.slice(0, 5).join(", ")}
        {decision.groupMemberLabels.length > 5
          ? ` +${decision.groupMemberLabels.length - 5} more`
          : ""}
      </p>
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

  const actionCoreAdSets = decisionOs.adSets.filter(
    (decision) => decision.trust.surfaceLane === "action_core",
  );
  const actionCoreGeos = decisionOs.geoDecisions.filter(
    (decision) => decision.trust.surfaceLane === "action_core",
  );
  const winnerScaleSummary = decisionOs.summary.winnerScaleSummary ?? {
    candidateCount: decisionOs.winnerScaleCandidates.length,
    protectedCount: decisionOs.noTouchList.length,
    headline:
      decisionOs.winnerScaleCandidates.length > 0
        ? `${decisionOs.winnerScaleCandidates.length} active winner scale candidate${decisionOs.winnerScaleCandidates.length > 1 ? "s are" : " is"} ready for controlled growth.`
        : "No clean winner scale candidate is ready yet.",
  };
  const geoSummary = decisionOs.summary.geoSummary ?? {
    actionCoreCount: actionCoreGeos.length,
    watchlistCount: decisionOs.geoDecisions.filter(
      (decision) => decision.trust.surfaceLane === "watchlist",
    ).length,
    queuedCount: decisionOs.geoDecisions.filter((decision) => decision.queueEligible).length,
    pooledClusterCount: 0,
    sourceFreshness: {
      dataState: "syncing" as const,
      isPartial: false,
      lastSyncedAt: null,
      verificationState: null,
      reason: null,
    },
    countryEconomics: {
      configured: false,
      updatedAt: null,
      sourceLabel: null,
    },
  };
  const opportunitySummary = decisionOs.summary.opportunitySummary ?? {
    totalCount: decisionOs.opportunityBoard.length,
    queueEligibleCount: decisionOs.opportunityBoard.filter((item) => item.queue.eligible).length,
    geoCount: decisionOs.opportunityBoard.filter((item) => item.kind === "geo").length,
    winnerScaleCount: decisionOs.opportunityBoard.filter(
      (item) =>
        item.kind === "campaign_winner_scale" || item.kind === "adset_winner_scale",
    ).length,
    protectedCount: decisionOs.opportunityBoard.filter(
      (item) => item.kind === "protected_winner",
    ).length,
    headline:
      decisionOs.opportunityBoard.length > 0
        ? "Opportunity board is populated."
        : "Opportunity board is empty.",
  };
  const topOpportunityRows = decisionOs.opportunityBoard.slice(0, 5);
  const policyRows = actionCoreAdSets
    .filter((decision) => decision.policy.explanation)
    .slice(0, 3);
  const watchlistGeoClusters = Array.from(
    new Map(
      decisionOs.geoDecisions
        .filter((decision) => decision.trust.surfaceLane === "watchlist")
        .map((decision) => [decision.clusterKey ?? decision.geoKey, decision]),
    ).values(),
  );

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
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-sm text-slate-700">
            Action core {decisionOs.summary.surfaceSummary.actionCoreCount}
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-sm text-slate-700">
            Watchlist {decisionOs.summary.surfaceSummary.watchlistCount}
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-sm text-slate-700">
            Archive {decisionOs.summary.surfaceSummary.archiveCount}
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-sm text-slate-700">
            Degraded {decisionOs.summary.surfaceSummary.degradedCount}
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-sm text-slate-700">
            Winner candidates {winnerScaleSummary.candidateCount}
          </div>
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

      <DecisionAuthorityPanel
        authority={decisionOs.authority}
        commercialSummary={decisionOs.commercialTruthCoverage.summary}
        title="Meta Authority"
      />

      {policyRows.length > 0 ? (
        <DecisionListCard
          title="Policy Review"
          testId="meta-policy-review"
          empty="No policy review is available."
        >
          <div className="space-y-3">
            {policyRows.map((decision) => (
              <DecisionPolicyExplanationPanel
                key={`policy:${decision.decisionId}`}
                explanation={decision.policy.explanation}
                title={decision.adSetName}
              />
            ))}
          </div>
        </DecisionListCard>
      ) : null}

      <DecisionListCard
        title="Opportunity Board"
        testId="meta-opportunity-board"
        empty="No opportunity-board item is available."
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
            <p className="text-xs text-slate-600">{opportunitySummary.headline}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
              <span>Total {opportunitySummary.totalCount}</span>
              <span>Queue-ready {opportunitySummary.queueEligibleCount}</span>
              <span>Winner-scale {opportunitySummary.winnerScaleCount}</span>
              <span>Protected {opportunitySummary.protectedCount}</span>
              <span>GEO {opportunitySummary.geoCount}</span>
            </div>
          </div>
          {topOpportunityRows.length === 0 ? (
            <p className="text-xs text-slate-500">No opportunity-board item is available.</p>
          ) : (
            <div className="space-y-3">
              {topOpportunityRows.map((item) => (
                <OpportunityBoardRow key={item.opportunityId} item={item} />
              ))}
            </div>
          )}
        </div>
      </DecisionListCard>

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
        title="Winner Scale Candidates"
        testId="meta-winner-scale-candidates"
        empty="No clean winner scale candidate is ready."
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">{winnerScaleSummary.headline}</p>
          {decisionOs.winnerScaleCandidates.length === 0 ? (
            <p className="text-xs text-slate-500">No clean winner scale candidate is ready.</p>
          ) : (
            <div className="space-y-3">
              {decisionOs.winnerScaleCandidates.slice(0, 5).map((candidate) => (
                <WinnerScaleCandidateRow
                  key={candidate.candidateId}
                  candidate={candidate}
                />
              ))}
            </div>
          )}
        </div>
      </DecisionListCard>

      <DecisionListCard
        title="Top Ad Set Actions"
        testId="meta-top-adset-actions"
        empty="No ad set actions are available."
      >
        {actionCoreAdSets.length === 0 ? (
          <p className="text-xs text-slate-500">No ad set actions are available.</p>
        ) : (
          <div className="space-y-3">
            {actionCoreAdSets.slice(0, 5).map((decision) => (
              <AdSetDecisionRow key={decision.decisionId} decision={decision} />
            ))}
          </div>
        )}
      </DecisionListCard>

      <DecisionListCard title="GEO OS" testId="meta-geo-board" empty="No GEO actions are available.">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
            <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
              <span>
                GEO source {geoSummary.sourceFreshness.dataState}
                {geoSummary.sourceFreshness.isPartial ? " · partial" : ""}
              </span>
              <span>
                action-core {geoSummary.actionCoreCount}
              </span>
              <span>
                watchlist {geoSummary.watchlistCount}
              </span>
              <span>
                pooled clusters {geoSummary.pooledClusterCount}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Country economics{" "}
              {geoSummary.countryEconomics.configured
                ? `configured · updated ${formatTimestampLabel(
                    geoSummary.countryEconomics.updatedAt,
                  )}`
                : "not configured"}
            </p>
            {geoSummary.sourceFreshness.reason ? (
              <p className="mt-2 text-[11px] text-slate-500">
                {geoSummary.sourceFreshness.reason}
              </p>
            ) : null}
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Action Core GEOs
            </p>
            {actionCoreGeos.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No material GEO actions are in the action core.</p>
            ) : (
              <div className="mt-2 space-y-3">
                {actionCoreGeos.slice(0, 5).map((decision) => (
                  <GeoDecisionRow key={decision.geoKey} decision={decision} />
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Watchlist / Pooled Validation
            </p>
            {watchlistGeoClusters.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No pooled or watchlist GEO cluster is active.</p>
            ) : (
              <div className="mt-2 space-y-3">
                {watchlistGeoClusters.slice(0, 5).map((decision) => (
                  <GeoWatchlistClusterRow
                    key={decision.clusterKey ?? decision.geoKey}
                    decision={decision}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
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
            {campaignDecision.trust.operatorDisposition !== "standard" ? (
              <span
                className={cn(
                  "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                  trustTone(campaignDecision.trust.operatorDisposition),
                )}
              >
                {formatActionLabel(campaignDecision.trust.operatorDisposition)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="mt-3 text-[11px] text-slate-500">
          Confidence {(campaignDecision.confidence * 100).toFixed(0)}%
        </div>
        <PolicyChips policy={campaignDecision.policy} />
        <EvidenceChips evidence={campaignDecision.evidence} />
        <DecisionPolicyExplanationPanel
          explanation={campaignDecision.policy.explanation}
          title="Campaign Policy Review"
          className="mt-3"
        />
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
