"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  GoogleAdvisorResponse,
  GoogleAdvisorRecommendation,
} from "@/src/services/google";

type QueueLane = "review" | "test" | "watch" | "suppressed";

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function familyLabel(family: GoogleAdvisorRecommendation["decisionFamily"]) {
  switch (family) {
    case "waste_control":
      return "Waste Control";
    case "brand_governance":
      return "Brand Governance";
    case "growth_unlock":
      return "Growth Unlock";
    case "structure_repair":
      return "Structure Repair";
    case "commercial_constraint":
      return "Commercial Constraint";
    default:
      return "Experimentation";
  }
}

function laneLabel(lane: QueueLane) {
  switch (lane) {
    case "review":
      return "Review";
    case "test":
      return "Test";
    case "watch":
      return "Watch";
    case "suppressed":
      return "Suppressed";
  }
}

function laneDescription(lane: QueueLane) {
  switch (lane) {
    case "review":
      return "Operator-reviewed decisions that are complete enough to act on manually now.";
    case "test":
      return "Decisions that need a constrained test or prerequisite check before wider action.";
    case "watch":
      return "Signals worth monitoring, but not strong enough for immediate change.";
    case "suppressed":
      return "Decisions the engine is deliberately holding back, with explicit reasons.";
  }
}

function laneTone(lane: QueueLane) {
  switch (lane) {
    case "review":
      return "border-emerald-200 bg-emerald-50/40 text-emerald-800";
    case "test":
      return "border-amber-200 bg-amber-50/40 text-amber-800";
    case "watch":
      return "border-slate-200 bg-slate-50/60 text-slate-700";
    case "suppressed":
      return "border-rose-200 bg-rose-50/40 text-rose-800";
  }
}

function riskTone(level?: GoogleAdvisorRecommendation["decision"]["riskLevel"]) {
  if (level === "high") return "text-rose-700";
  if (level === "medium") return "text-amber-700";
  return "text-emerald-700";
}

function blastRadiusTone(radius?: GoogleAdvisorRecommendation["decision"]["blastRadius"]) {
  if (radius === "account") return "text-rose-700";
  if (radius === "campaign") return "text-amber-700";
  return "text-emerald-700";
}

function confidencePct(confidence?: number | null) {
  if (typeof confidence !== "number") return null;
  return `${Math.round(confidence * 100)}%`;
}

function deriveQueueLane(recommendation: GoogleAdvisorRecommendation): QueueLane {
  const lane = recommendation.decision?.lane;
  if (lane === "review" || lane === "test" || lane === "watch" || lane === "suppressed") {
    return lane;
  }
  if (recommendation.integrityState === "suppressed") return "suppressed";
  if (recommendation.decisionState === "test" || recommendation.doBucket === "do_next") return "test";
  if (recommendation.decisionState === "watch" || recommendation.doBucket === "do_later") return "watch";
  return "review";
}

function buildWindowLabelMap(advisor: GoogleAdvisorResponse) {
  const metadata = advisor.metadata;
  const map = new Map<string, string>();
  if (!metadata) return map;
  for (const window of metadata.analysisWindows.healthAlarmWindows) {
    map.set(window.key, window.label);
  }
  map.set(metadata.analysisWindows.operationalWindow.key, metadata.analysisWindows.operationalWindow.label);
  map.set(metadata.analysisWindows.queryGovernanceWindow.key, metadata.analysisWindows.queryGovernanceWindow.label);
  map.set(metadata.analysisWindows.baselineWindow.key, metadata.analysisWindows.baselineWindow.label);
  return map;
}

function renderWindowLabel(key: string | undefined, labelMap: Map<string, string>) {
  if (!key) return null;
  return labelMap.get(key) ?? labelize(key);
}

function fallbackNarrative(recommendation: GoogleAdvisorRecommendation) {
  return {
    whatHappened: recommendation.decisionNarrative?.whatHappened ?? recommendation.summary,
    whyItHappened: recommendation.decisionNarrative?.whyItHappened ?? recommendation.why,
    whatToDo: recommendation.decisionNarrative?.whatToDo ?? recommendation.recommendedAction,
    risk:
      recommendation.decisionNarrative?.risk ??
      recommendation.blockers?.join(" ") ??
      "No explicit decision narrative is available for this payload. Keep this in operator review.",
    howToValidate:
      recommendation.decisionNarrative?.howToValidate ??
      recommendation.validationChecklist ??
      [],
    howToRollBack:
      recommendation.decisionNarrative?.howToRollBack ??
      recommendation.rollbackGuidance ??
      "No verified write-back rollback exists in V1. Reverse manually in Google Ads if needed.",
  };
}

function DetailList({
  title,
  items,
  emptyLabel,
  tone = "default",
}: {
  title: string;
  items?: string[];
  emptyLabel: string;
  tone?: "default" | "danger" | "muted";
}) {
  const values = (items ?? []).filter(Boolean);
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        tone === "danger"
          ? "border-rose-200 bg-rose-50/50"
          : tone === "muted"
            ? "border-dashed bg-muted/10"
            : "bg-muted/15"
      )}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</div>
      {values.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm text-slate-800">
          {values.map((item, index) => (
            <li key={`${title}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}

function RecommendationCard({
  advisor,
  recommendation,
  onFocusEntity,
}: {
  advisor: GoogleAdvisorResponse;
  recommendation: GoogleAdvisorRecommendation;
  onFocusEntity?: (recommendation: GoogleAdvisorRecommendation) => void;
}) {
  const lane = deriveQueueLane(recommendation);
  const labelMap = buildWindowLabelMap(advisor);
  const windowsUsed = recommendation.decision?.windowsUsed;
  const whyNot = recommendation.decision?.whyNot ?? recommendation.blockers ?? [];
  const validationPlan = recommendation.decision?.validationPlan ?? recommendation.validationChecklist ?? [];
  const rollbackPlan = recommendation.decision?.rollbackPlan ?? [];
  const evidencePoints = recommendation.decision?.evidencePoints ?? recommendation.evidence ?? [];
  const executionSurface = advisor.metadata?.executionSurface;
  const narrative = fallbackNarrative(recommendation);

  return (
    <article className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap gap-2">
            <Badge className={cn("border", laneTone(lane))} variant="outline">
              {laneLabel(lane)}
            </Badge>
            <Badge variant="outline">{familyLabel(recommendation.decisionFamily)}</Badge>
            <Badge variant="outline">{labelize(recommendation.strategyLayer)}</Badge>
            {executionSurface?.writebackEnabled ? null : <Badge variant="outline">Manual plan only</Badge>}
          </div>
          <h3 className="text-base font-semibold leading-tight">{recommendation.title}</h3>
          <p className="text-xs text-muted-foreground">
            {recommendation.level === "account"
              ? "Account-level decision"
              : recommendation.entityName ?? labelize(recommendation.level)}
          </p>
        </div>
        <div className="grid gap-1 text-right text-xs">
          <div>
            <span className="text-muted-foreground">Confidence:</span>{" "}
            <span className="font-medium">
              {confidencePct(recommendation.decision?.confidence) ?? labelize(recommendation.confidence)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Risk:</span>{" "}
            <span className={cn("font-medium", riskTone(recommendation.decision?.riskLevel))}>
              {labelize(recommendation.decision?.riskLevel ?? "unknown")}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Blast radius:</span>{" "}
            <span className={cn("font-medium", blastRadiusTone(recommendation.decision?.blastRadius))}>
              {labelize(recommendation.decision?.blastRadius ?? "unknown")}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border bg-muted/15 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">What happened</div>
          <p className="mt-2 text-sm text-slate-800">{narrative.whatHappened}</p>
        </div>
        <div className="rounded-lg border bg-muted/15 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Why it happened</div>
          <p className="mt-2 text-sm text-slate-800">{narrative.whyItHappened}</p>
        </div>
        <div className="rounded-lg border bg-muted/15 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">What to do</div>
          <p className="mt-2 text-sm text-slate-800">{narrative.whatToDo}</p>
        </div>
        <div className="rounded-lg border bg-muted/15 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Why now</div>
          <p className="mt-2 text-sm text-slate-800">
            {recommendation.decision?.whyNow ?? recommendation.whyNow ?? "No additional why-now note is available."}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border bg-muted/15 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Windows used</div>
          <div className="mt-2 space-y-1 text-sm text-slate-800">
            <div>Health: {renderWindowLabel(windowsUsed?.healthWindow, labelMap) ?? "Unavailable"}</div>
            <div>Primary: {renderWindowLabel(windowsUsed?.primaryWindow, labelMap) ?? "Unavailable"}</div>
            <div>Query: {renderWindowLabel(windowsUsed?.queryWindow, labelMap) ?? "Not used"}</div>
            <div>Baseline: {renderWindowLabel(windowsUsed?.baselineWindow, labelMap) ?? "Unavailable"}</div>
            <div className="text-xs text-muted-foreground">
              Maturity cutoff: {typeof windowsUsed?.maturityCutoffDays === "number" ? `${windowsUsed.maturityCutoffDays}d` : "Unavailable"}
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-muted/15 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Risk</div>
          <p className="mt-2 text-sm text-slate-800">{narrative.risk}</p>
        </div>
        <div className="rounded-lg border bg-muted/15 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Evidence summary</div>
          <p className="mt-2 text-sm text-slate-800">
            {recommendation.decision?.evidenceSummary ?? recommendation.summary}
          </p>
        </div>
        <div className="rounded-lg border bg-muted/15 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Operator mode</div>
          <p className="mt-2 text-sm text-slate-800">
            {executionSurface?.summary ?? "Operator-first manual plan surface."}
          </p>
        </div>
      </div>

      {evidencePoints.length > 0 ? (
        <div className="grid gap-2 md:grid-cols-3">
          {evidencePoints.map((item) => (
            <div key={item.label} className="rounded-lg border bg-muted/15 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.label}</div>
              <div className="mt-1 text-sm font-medium">{item.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <DetailList
          title="Why not / blockers"
          items={whyNot}
          emptyLabel="No blockers recorded for this decision."
          tone={lane === "suppressed" ? "danger" : "default"}
        />
        <DetailList
          title="Validation plan"
          items={validationPlan.length > 0 ? validationPlan : narrative.howToValidate}
          emptyLabel="No explicit validation plan is available."
        />
        <DetailList
          title="Rollback plan"
          items={rollbackPlan.length > 0 ? rollbackPlan : [narrative.howToRollBack]}
          emptyLabel="No verified write-back rollback exists in V1. Reverse manually in Google Ads if needed."
        />
        <DetailList
          title="Suppression reasons"
          items={recommendation.suppressionReasons?.map(labelize)}
          emptyLabel="No suppression reasons recorded."
          tone={lane === "suppressed" ? "danger" : "muted"}
        />
      </div>

      {(recommendation.negativeQueries?.length ?? 0) > 0 || (recommendation.suppressedQueries?.length ?? 0) > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          <DetailList
            title="Eligible exact-negative queries"
            items={recommendation.negativeQueries}
            emptyLabel="No exact-negative queries are eligible."
          />
          <DetailList
            title="Suppressed queries"
            items={recommendation.suppressedQueries}
            emptyLabel="No suppressed queries are attached to this decision."
            tone="danger"
          />
        </div>
      ) : null}

      {recommendation.deepLinkUrl || (onFocusEntity && recommendation.entityId) ? (
        <div className="flex flex-wrap justify-end gap-2">
          {recommendation.deepLinkUrl ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open(recommendation.deepLinkUrl ?? "", "_blank", "noopener,noreferrer")}
            >
              Open in Google Ads
            </Button>
          ) : null}
          {onFocusEntity && recommendation.entityId ? (
            <Button variant="outline" size="sm" onClick={() => onFocusEntity(recommendation)}>
              Jump to entity
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function QueueSection({
  advisor,
  lane,
  recommendations,
  onFocusEntity,
}: {
  advisor: GoogleAdvisorResponse;
  lane: QueueLane;
  recommendations: GoogleAdvisorRecommendation[];
  onFocusEntity?: (recommendation: GoogleAdvisorRecommendation) => void;
}) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {laneLabel(lane)}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{laneDescription(lane)}</p>
        </div>
        <Badge className={cn("border", laneTone(lane))} variant="outline">
          {recommendations.length}
        </Badge>
      </div>
      {recommendations.length > 0 ? (
        <div className="space-y-4">
          {recommendations.map((recommendation) => (
            <RecommendationCard
              key={recommendation.id}
              advisor={advisor}
              recommendation={recommendation}
              onFocusEntity={onFocusEntity}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground">
          No decisions in this lane right now.
        </div>
      )}
    </section>
  );
}

export function GoogleAdvisorPanel({
  advisor,
  onFocusEntity,
}: {
  advisor: GoogleAdvisorResponse;
  onFocusEntity?: (recommendation: GoogleAdvisorRecommendation) => void;
  businessId?: string;
  accountId?: string | null;
}) {
  const selectedRangeContext =
    advisor.metadata?.selectedRangeContext &&
    advisor.metadata.selectedRangeContext.eligible &&
    advisor.metadata.selectedRangeContext.state !== "hidden"
      ? advisor.metadata.selectedRangeContext
      : null;

  const queueByLane: Record<QueueLane, GoogleAdvisorRecommendation[]> = {
    review: [],
    test: [],
    watch: [],
    suppressed: [],
  };
  for (const recommendation of advisor.recommendations) {
    queueByLane[deriveQueueLane(recommendation)].push(recommendation);
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Account Pulse</p>
              <h2 className="text-lg font-semibold">{advisor.summary.headline}</h2>
              <p className="text-sm text-muted-foreground">{advisor.summary.operatorNote}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{advisor.summary.accountOperatingMode}</Badge>
              {advisor.metadata?.executionSurface?.writebackEnabled ? null : (
                <Badge variant="outline">Write-back disabled</Badge>
              )}
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border bg-muted/15 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Top constraint</div>
              <div className="mt-1 text-sm">{advisor.summary.topConstraint}</div>
            </div>
            <div className="rounded-lg border bg-muted/15 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Top growth lever</div>
              <div className="mt-1 text-sm">{advisor.summary.topGrowthLever}</div>
            </div>
            <div className="rounded-lg border bg-muted/15 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Recommended focus</div>
              <div className="mt-1 text-sm">{advisor.summary.recommendedFocusToday}</div>
            </div>
            <div className="rounded-lg border bg-muted/15 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Queue load</div>
              <div className="mt-1 text-sm">
                {advisor.recommendations.length} decisions · {queueByLane.review.length} review
              </div>
            </div>
          </div>
          <div className="mt-3 rounded-lg border bg-muted/15 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Watchouts</div>
            <p className="mt-1 text-sm text-slate-800">
              {advisor.summary.watchouts.length > 0
                ? advisor.summary.watchouts.join(" · ")
                : "No active watchouts recorded."}
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Decision Snapshot</p>
            <h2 className="text-lg font-semibold">Multi-window analysis</h2>
            <p className="text-sm text-muted-foreground">
              The selected range is context only. Decision priority comes from the anchored decision snapshot.
            </p>
          </div>
          <div className="mt-4 grid gap-3">
            <div className="rounded-lg border bg-muted/15 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Primary decision window</div>
              <div className="mt-1 text-sm">
                {advisor.metadata?.analysisWindows.operationalWindow.label ?? "Unavailable"}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/15 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Query governance window</div>
              <div className="mt-1 text-sm">
                {advisor.metadata?.analysisWindows.queryGovernanceWindow.label ?? "Unavailable"}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/15 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Baseline window</div>
              <div className="mt-1 text-sm">
                {advisor.metadata?.analysisWindows.baselineWindow.label ?? "Unavailable"}
              </div>
            </div>
            {selectedRangeContext ? (
              <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3">
                <div className="text-[10px] uppercase tracking-wide text-sky-700">Selected-range context</div>
                <p className="mt-1 text-sm text-slate-800">{selectedRangeContext.summary}</p>
                <p className="mt-1 text-xs text-sky-800/80">
                  Selected range stays contextual and does not replace the decision snapshot.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-muted/10 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Selected-range context</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  No contextual selected-range note is available for this snapshot.
                </p>
              </div>
            )}
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <div className="text-[10px] uppercase tracking-wide text-amber-700">Operator-first mode</div>
              <p className="mt-1 text-sm text-slate-800">
                {advisor.metadata?.executionSurface?.summary ?? "Adsecute V1 remains operator-first."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Opportunity Queue</p>
          <h2 className="text-lg font-semibold">Decision lanes</h2>
          <p className="text-sm text-muted-foreground">
            Recommendations are grouped by operator lane, not by the selected date range.
          </p>
        </div>
        <div className="space-y-4">
          <QueueSection advisor={advisor} lane="review" recommendations={queueByLane.review} onFocusEntity={onFocusEntity} />
          <QueueSection advisor={advisor} lane="test" recommendations={queueByLane.test} onFocusEntity={onFocusEntity} />
          <QueueSection advisor={advisor} lane="watch" recommendations={queueByLane.watch} onFocusEntity={onFocusEntity} />
          <QueueSection advisor={advisor} lane="suppressed" recommendations={queueByLane.suppressed} onFocusEntity={onFocusEntity} />
        </div>
      </section>
    </div>
  );
}
