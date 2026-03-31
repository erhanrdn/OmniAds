"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GoogleActionCluster } from "@/lib/google-ads/growth-advisor-types";
import { cn } from "@/lib/utils";
import type {
  GoogleAdvisorResponse,
  GoogleAdvisorRecommendation,
} from "@/src/services/google";

function decisionBadgeVariant(decisionState: GoogleAdvisorRecommendation["decisionState"]) {
  if (decisionState === "act") return "default";
  if (decisionState === "test") return "secondary";
  return "outline";
}

function trustTone(dataTrust: GoogleAdvisorRecommendation["dataTrust"]) {
  if (dataTrust === "high") return "text-emerald-700";
  if (dataTrust === "medium") return "text-amber-700";
  return "text-rose-700";
}

function contributionTone(impact: GoogleAdvisorRecommendation["potentialContribution"]["impact"]) {
  if (impact === "high") return "text-emerald-700";
  if (impact === "medium") return "text-amber-700";
  return "text-muted-foreground";
}

function familyLabel(family: GoogleAdvisorRecommendation["decisionFamily"]) {
  switch (family) {
    case "waste_control":
      return "Waste Control";
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

function bucketLabel(bucket: GoogleAdvisorRecommendation["doBucket"]) {
  switch (bucket) {
    case "do_now":
      return "Do Now";
    case "do_next":
      return "Do Next";
    default:
      return "Do Later";
  }
}

function integrityTone(state: GoogleAdvisorRecommendation["integrityState"]) {
  if (state === "ready") return "text-emerald-700";
  if (state === "downgraded") return "text-amber-700";
  if (state === "blocked") return "text-rose-700";
  return "text-muted-foreground";
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function confidenceTone(confidence?: "high" | "medium" | "low" | null) {
  if (confidence === "high") return "text-emerald-700";
  if (confidence === "medium") return "text-amber-700";
  return "text-muted-foreground";
}

function clusterBucketLabel(bucket: GoogleActionCluster["clusterBucket"]) {
  if (bucket === "now") return "Do Now";
  if (bucket === "next") return "Do Next";
  return "Blocked";
}

function clusterReadinessTone(readiness: GoogleActionCluster["clusterReadiness"]) {
  if (readiness === "ready_trusted") return "text-emerald-700";
  if (readiness === "ready_unverified" || readiness === "partially_executable" || readiness === "staging") {
    return "text-amber-700";
  }
  if (readiness === "degraded" || readiness === "blocked") return "text-rose-700";
  return "text-muted-foreground";
}

function stepTypeLabel(type: GoogleActionCluster["steps"][number]["stepType"]) {
  if (type === "batch_mutate") return "Batch";
  if (type === "mutate") return "Mutate";
  return "Handoff";
}

function moveValidityTone(validity: GoogleActionCluster["clusterMoveValidity"]) {
  if (validity === "valid" || validity === "reverted") return "text-emerald-700";
  if (validity === "partially_effective" || validity === "inconclusive") return "text-amber-700";
  return "text-rose-700";
}

function governanceLabel(value?: GoogleActionCluster["sharedStateGovernanceType"] | GoogleAdvisorRecommendation["sharedStateGovernanceType"]) {
  if (!value) return "unknown";
  return labelize(value);
}

function ListBlock({
  title,
  items,
  tone = "default",
}: {
  title: string;
  items?: string[];
  tone?: "default" | "danger" | "muted";
}) {
  if (!items || items.length === 0) return null;
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
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item, index) => (
          <Badge key={`${title}-${item}-${index}`} variant="outline" className="max-w-full truncate">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function RecommendationEvidenceGrid({ recommendation }: { recommendation: GoogleAdvisorRecommendation }) {
  if (recommendation.evidence.length === 0) return null;
  return (
    <div className="grid gap-2 md:grid-cols-3">
      {recommendation.evidence.map((item) => (
        <div key={item.label} className="rounded-lg border bg-muted/20 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {item.label}
          </div>
          <div className="mt-1 text-sm font-medium">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function AiInterpretationCard({ recommendation }: { recommendation: GoogleAdvisorRecommendation }) {
  if (!recommendation.aiCommentary) return null;
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3">
      <div className="text-[10px] uppercase tracking-wide text-sky-700">AI Interpretation</div>
      <p className="mt-1 text-sm text-slate-800">{recommendation.aiCommentary.narrative}</p>
      {recommendation.aiCommentary.limitations.length ? (
        <p className="mt-2 text-xs text-slate-600">
          Limits: {recommendation.aiCommentary.limitations.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

function GoogleDecisionCard({
  recommendation,
  onFocusEntity,
  businessId,
  accountId,
}: {
  recommendation: GoogleAdvisorRecommendation;
  onFocusEntity?: (recommendation: GoogleAdvisorRecommendation) => void;
  businessId?: string;
  accountId?: string | null;
}) {
  const router = useRouter();
  const [isExecuting, setIsExecuting] = useState(false);
  const handoffRelatedEntities = Array.isArray(recommendation.handoffPayload?.relatedEntities)
    ? recommendation.handoffPayload.relatedEntities.filter((value): value is string => typeof value === "string")
    : [];
  async function runAdvisorAction(payload: Record<string, unknown>) {
    if (!businessId) return;
    setIsExecuting(true);
    try {
      const response = await fetch("/api/google-ads/advisor-memory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId,
          accountId,
          recommendationFingerprint: recommendation.recommendationFingerprint,
          ...payload,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? "Advisor execution failed.");
      }
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Advisor execution failed.");
    } finally {
      setIsExecuting(false);
    }
  }
  return (
    <article className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap gap-2">
            <Badge variant={decisionBadgeVariant(recommendation.decisionState)}>
              {recommendation.decisionState.toUpperCase()}
            </Badge>
            <Badge variant="outline">{familyLabel(recommendation.decisionFamily)}</Badge>
            <Badge variant="outline">{bucketLabel(recommendation.doBucket)}</Badge>
            <Badge variant="outline">{labelize(recommendation.integrityState)}</Badge>
            {recommendation.overlapType ? (
              <Badge variant="outline">{labelize(recommendation.overlapType)}</Badge>
            ) : null}
            {recommendation.currentStatus ? (
              <Badge variant="outline">{labelize(recommendation.currentStatus)}</Badge>
            ) : null}
          </div>
          <h3 className="text-base font-semibold leading-tight">{recommendation.title}</h3>
          <p className="text-xs text-muted-foreground">
            {recommendation.level === "account"
              ? "Account-level decision"
              : recommendation.entityName ?? recommendation.level}
          </p>
        </div>
        <div className="text-right text-xs">
          <div className={cn("font-semibold", trustTone(recommendation.dataTrust))}>
            {labelize(recommendation.dataTrust)} data trust
          </div>
          <div className="mt-1 text-muted-foreground">{labelize(recommendation.confidence)} confidence</div>
          <div className={cn("mt-1 font-medium", integrityTone(recommendation.integrityState))}>
            {labelize(recommendation.integrityState)} integrity
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{recommendation.summary}</p>
        <p className="text-sm">
          <span className="font-medium">Why now:</span> {recommendation.whyNow}
        </p>
        {recommendation.whatChanged ? (
          <p className="text-sm">
            <span className="font-medium">What changed:</span> {recommendation.whatChanged}
          </p>
        ) : null}
        <p className="text-sm">
          <span className="font-medium">Recommended action:</span>{" "}
          {recommendation.recommendedAction}
        </p>
        <p className="text-sm">
          <span className="font-medium">Rank rationale:</span> {recommendation.rankExplanation}
        </p>
      </div>

      {recommendation.commerceSignals ? (
        <div className="rounded-lg border bg-emerald-50/40 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Commerce Signals</div>
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge variant="outline">Margin: {labelize(recommendation.commerceSignals.marginBand)}</Badge>
                <Badge variant="outline">Stock: {labelize(recommendation.commerceSignals.stockState)}</Badge>
                <Badge variant="outline">Price: {labelize(recommendation.commerceSignals.discountState)}</Badge>
                {recommendation.commerceSignals.heroSku ? <Badge variant="outline">Hero SKU</Badge> : null}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Commerce Confidence</div>
              <div className={cn("mt-1 text-sm font-medium", confidenceTone(recommendation.commerceConfidence))}>
                {labelize(recommendation.commerceConfidence ?? "low")}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border bg-muted/15 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Confidence
            </div>
            <div className="mt-1 text-sm font-medium">{recommendation.confidenceExplanation}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Effort / Impact
            </div>
            <div className="mt-1 text-sm font-medium">
              {labelize(recommendation.effortScore)} effort · {labelize(recommendation.impactBand)} impact
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {labelize(recommendation.actionability)} · {labelize(recommendation.reversibility)} reversibility
            </div>
          </div>
        </div>
        {recommendation.confidenceDegradationReasons.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {recommendation.confidenceDegradationReasons.map((reason, index) => (
              <Badge key={`${reason}-${index}`} variant="outline">
                {reason}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border bg-muted/15 p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Potential Contribution
        </div>
        <div className={cn("mt-1 text-sm font-medium", contributionTone(recommendation.potentialContribution.impact))}>
          {recommendation.potentialContribution.label}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {recommendation.potentialContribution.summary}
        </div>
      </div>

      <RecommendationEvidenceGrid recommendation={recommendation} />

      <div className="grid gap-3 md:grid-cols-2">
        <ListBlock title="Reason Codes" items={recommendation.reasonCodes} tone="muted" />
        <ListBlock title="Blockers" items={recommendation.blockers} tone="danger" />
        <ListBlock title="Blocked By" items={recommendation.blockedByRecommendationIds} tone="danger" />
        <ListBlock title="Conflicts With" items={recommendation.conflictsWithRecommendationIds} tone="danger" />
        <ListBlock title="Depends On" items={recommendation.dependsOnRecommendationIds} tone="muted" />
        <ListBlock title="Validation Checklist" items={recommendation.validationChecklist} />
        {recommendation.rollbackGuidance ? (
          <div className="rounded-lg border bg-muted/15 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Rollback Guidance
            </div>
            <div className="mt-1 text-sm">{recommendation.rollbackGuidance}</div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <ListBlock title="Promote To Exact" items={recommendation.promoteToExact} />
        <ListBlock title="Promote To Phrase" items={recommendation.promoteToPhrase} />
        <ListBlock title="Broad Discovery Themes" items={recommendation.broadDiscoveryThemes ?? recommendation.seedThemesBroad} />
        <ListBlock title="Negative Queries" items={recommendation.negativeQueries} />
        <ListBlock title="Negative Guardrails" items={recommendation.negativeGuardrails} />
        <ListBlock title="Starting SKU Clusters" items={recommendation.startingSkuClusters} />
        <ListBlock title="Scale SKU Clusters" items={recommendation.scaleSkuClusters} />
        <ListBlock title="Reduce SKU Clusters" items={recommendation.reduceSkuClusters} />
        <ListBlock title="Hidden Winners" items={recommendation.hiddenWinnerSkuClusters} />
        <ListBlock title="Hero SKU Clusters" items={recommendation.heroSkuClusters} />
        <ListBlock title="Scale-Ready Assets" items={recommendation.scaleReadyAssets} />
        <ListBlock title="Test-Only Assets" items={recommendation.testOnlyAssets} />
        <ListBlock title="Replace Assets" items={recommendation.replaceAssets} />
        <ListBlock title="Replacement Angles" items={recommendation.replacementAngles} />
        <ListBlock title="Weak Asset Groups" items={recommendation.weakAssetGroups} />
        <ListBlock title="Keep Separate" items={recommendation.keepSeparateAssetGroups} />
        <ListBlock title="Diagnostic Flags" items={recommendation.diagnosticFlags} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-muted/15 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sequence Stage</div>
          <div className="mt-1 text-sm font-medium">{labelize(recommendation.sequenceStage ?? "stabilize")}</div>
        </div>
        <div className="rounded-lg border bg-muted/15 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Support Strength</div>
          <div className="mt-1 text-sm font-medium">{labelize(recommendation.supportStrength)}</div>
        </div>
        <div className="rounded-lg border bg-muted/15 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Decision Memory</div>
          <div className="mt-1 text-sm font-medium">
            {recommendation.currentStatus ? labelize(recommendation.currentStatus) : "New"}
          </div>
          {recommendation.firstSeenAt ? (
            <div className="mt-1 text-xs text-muted-foreground">First seen: {recommendation.firstSeenAt.slice(0, 10)}</div>
          ) : null}
          {typeof recommendation.seenCount === "number" ? (
            <div className="mt-1 text-xs text-muted-foreground">Seen count: {recommendation.seenCount}</div>
          ) : null}
          {recommendation.priorStatus ? (
            <div className="mt-1 text-xs text-muted-foreground">Prior status: {labelize(recommendation.priorStatus)}</div>
          ) : null}
          {recommendation.outcomeVerdict ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Outcome: {labelize(recommendation.outcomeVerdict)}
              {recommendation.outcomeMetric ? ` via ${labelize(recommendation.outcomeMetric)}` : ""}
              {typeof recommendation.outcomeDelta === "number"
                ? ` (${recommendation.outcomeDelta > 0 ? "+" : ""}${recommendation.outcomeDelta.toFixed(2)})`
                : ""}
            </div>
          ) : null}
          {recommendation.outcomeConfidence ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Outcome confidence: {labelize(recommendation.outcomeConfidence)}
            </div>
          ) : null}
          {recommendation.outcomeVerdictFailReason ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Outcome hold: {labelize(recommendation.outcomeVerdictFailReason)}
            </div>
          ) : null}
          {recommendation.outcomeCheckAt ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Outcome review: {recommendation.outcomeCheckAt.slice(0, 10)}
              {typeof recommendation.outcomeCheckWindowDays === "number"
                ? ` (${recommendation.outcomeCheckWindowDays}d window)`
                : ""}
            </div>
          ) : null}
        </div>
        <div className="rounded-lg border bg-muted/15 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Execution State</div>
          <div className="mt-1 text-sm font-medium">
            {labelize(recommendation.executionStatus ?? "not_started")}
          </div>
          {recommendation.executionMode ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Mode: {labelize(recommendation.executionMode)}
            </div>
          ) : null}
          {recommendation.mutateActionType ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Action: {labelize(recommendation.mutateActionType)}
            </div>
          ) : null}
          {recommendation.budgetAdjustmentPreview ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Budget: {recommendation.budgetAdjustmentPreview.previousAmount.toFixed(2)} to{" "}
              {recommendation.budgetAdjustmentPreview.proposedAmount.toFixed(2)} (
              {recommendation.budgetAdjustmentPreview.deltaPercent > 0 ? "+" : ""}
              {recommendation.budgetAdjustmentPreview.deltaPercent}%)
            </div>
          ) : null}
          {recommendation.executionTrustBand ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Execution trust: {labelize(recommendation.executionTrustBand)}
            </div>
          ) : null}
          {recommendation.executionPolicyReason ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Policy: {recommendation.executionPolicyReason}
            </div>
          ) : null}
          {recommendation.dependencyReadiness ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Dependency readiness: {labelize(recommendation.dependencyReadiness)}
            </div>
          ) : null}
          {recommendation.stabilizationHoldUntil ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Hold until: {recommendation.stabilizationHoldUntil.slice(0, 10)}
            </div>
          ) : null}
          {recommendation.completionMode ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Completion: {labelize(recommendation.completionMode)}
              {typeof recommendation.completedStepCount === "number" &&
              typeof recommendation.totalStepCount === "number"
                ? ` (${recommendation.completedStepCount}/${recommendation.totalStepCount})`
                : ""}
            </div>
          ) : null}
          {recommendation.executedAt ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Executed: {recommendation.executedAt.slice(0, 10)}
            </div>
          ) : null}
          {recommendation.executionError ? (
            <div className="mt-1 text-xs text-rose-700">
              Error: {recommendation.executionError}
            </div>
          ) : null}
          {recommendation.mutateEligibilityReason ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Eligibility: {recommendation.mutateEligibilityReason}
            </div>
          ) : null}
        </div>
      </div>

      {recommendation.handoffUnavailableReason || handoffRelatedEntities.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <div className="text-[10px] uppercase tracking-wide text-amber-700">Execution Handoff</div>
          {recommendation.handoffUnavailableReason ? (
            <p className="mt-1 text-sm text-slate-800">{recommendation.handoffUnavailableReason}</p>
          ) : null}
          {recommendation.handoffPayload?.primaryTarget ? (
            <p className="mt-2 text-sm">
              <span className="font-medium">Primary target:</span>{" "}
              {String(recommendation.handoffPayload.primaryTarget)}
            </p>
          ) : null}
          {handoffRelatedEntities.length > 0 ? (
            <div className="mt-2">
              <div className="text-xs font-medium text-slate-700">Related entities</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {handoffRelatedEntities.map((entity, index) => (
                  <Badge key={`${entity}-${index}`} variant="outline">
                    {entity}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
          {recommendation.orderedHandoffSteps?.length ? (
            <div className="mt-3">
              <div className="text-xs font-medium text-slate-700">Ordered steps</div>
              <div className="mt-1 space-y-1 text-sm text-slate-800">
                {recommendation.orderedHandoffSteps.map((step, index) => (
                  <div key={`${step}-${index}`}>{index + 1}. {step}</div>
                ))}
              </div>
              {typeof recommendation.estimatedOperatorMinutes === "number" ? (
                <div className="mt-2 text-xs text-slate-600">
                  Estimated operator time: {recommendation.estimatedOperatorMinutes} minutes
                </div>
              ) : null}
              {businessId ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isExecuting}
                    onClick={() =>
                      runAdvisorAction({
                        executionAction: "mark_completion",
                        completionMode: "partial",
                        completedStepCount: Math.max(
                          1,
                          Math.floor((recommendation.totalStepCount ?? recommendation.orderedHandoffSteps?.length ?? 1) / 2)
                        ),
                        totalStepCount: recommendation.totalStepCount ?? recommendation.orderedHandoffSteps?.length ?? null,
                        completedStepIds:
                          recommendation.coreStepIds?.slice(
                            0,
                            Math.max(1, Math.floor((recommendation.coreStepIds?.length ?? 1) / 2))
                          ) ?? null,
                        skippedStepIds:
                          recommendation.coreStepIds?.slice(
                            Math.max(1, Math.floor((recommendation.coreStepIds?.length ?? 1) / 2))
                          ) ?? null,
                        coreStepIds: recommendation.coreStepIds ?? null,
                      })
                    }
                  >
                    Mark Partial
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isExecuting}
                    onClick={() =>
                      runAdvisorAction({
                        executionAction: "mark_completion",
                        completionMode: "full",
                        completedStepCount: recommendation.totalStepCount ?? recommendation.orderedHandoffSteps?.length ?? null,
                        totalStepCount: recommendation.totalStepCount ?? recommendation.orderedHandoffSteps?.length ?? null,
                        completedStepIds:
                          recommendation.coreStepIds ??
                          recommendation.orderedHandoffSteps?.map((_, index) => `step_${index + 1}`) ??
                          null,
                        skippedStepIds: [],
                        coreStepIds: recommendation.coreStepIds ?? null,
                      })
                    }
                  >
                    Mark Done
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {recommendation.overlapType ? (
        <div className="rounded-lg border bg-violet-50/40 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Overlap Signal</div>
              <div className="mt-1 text-sm font-medium">{labelize(recommendation.overlapType)}</div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              {recommendation.overlapSeverity ? (
                <div>Severity: {labelize(recommendation.overlapSeverity)}</div>
              ) : null}
              {recommendation.overlapTrend ? (
                <div className="mt-1">Trend: {labelize(recommendation.overlapTrend)}</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {recommendation.sharedStateGovernanceType && recommendation.sharedStateGovernanceType !== "unknown" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-amber-700">Shared-State Awareness</div>
              <div className="mt-1 text-sm font-medium">
                {governanceLabel(recommendation.sharedStateGovernanceType)}
              </div>
              {recommendation.portfolioGovernanceStatus && recommendation.portfolioGovernanceStatus !== "none" ? (
                <div className="mt-1 text-xs text-slate-700">
                  Governance stack: {labelize(recommendation.portfolioGovernanceStatus)}
                </div>
              ) : null}
              {recommendation.sharedStateMutateBlockedReason ? (
                <div className="mt-1 text-xs text-slate-700">{recommendation.sharedStateMutateBlockedReason}</div>
              ) : null}
              {recommendation.portfolioBlockedReason ? (
                <div className="mt-1 text-xs text-amber-800">{recommendation.portfolioBlockedReason}</div>
              ) : null}
              {recommendation.portfolioCautionReason ? (
                <div className="mt-1 text-xs text-slate-700">{recommendation.portfolioCautionReason}</div>
              ) : null}
            </div>
            <div className="text-right text-xs text-slate-600">
              {recommendation.governedEntityCount ? (
                <div>Governed entities: {recommendation.governedEntityCount}</div>
              ) : null}
              {recommendation.sharedStateAwarenessStatus ? (
                <div className="mt-1">Awareness: {labelize(recommendation.sharedStateAwarenessStatus)}</div>
              ) : null}
              {recommendation.allocatorCouplingConfidence ? (
                <div className="mt-1">Coupling confidence: {labelize(recommendation.allocatorCouplingConfidence)}</div>
              ) : null}
              {recommendation.portfolioCouplingStrength ? (
                <div className="mt-1">Portfolio coupling: {labelize(recommendation.portfolioCouplingStrength)}</div>
              ) : null}
              {recommendation.portfolioCampaignShare !== null && recommendation.portfolioCampaignShare !== undefined ? (
                <div className="mt-1">Portfolio share: {recommendation.portfolioCampaignShare}%</div>
              ) : null}
            </div>
          </div>
          {recommendation.coupledCampaignNames?.length ? (
            <div className="mt-2 text-xs text-slate-700">
              Coupled campaigns: {recommendation.coupledCampaignNames.join(" · ")}
            </div>
          ) : null}
          {recommendation.portfolioBidStrategyResourceName ? (
            <div className="mt-2 text-xs text-slate-700">
              Portfolio: {recommendation.portfolioBidStrategyType ?? "Strategy"}
              {recommendation.portfolioTargetType && recommendation.portfolioTargetValue !== null && recommendation.portfolioTargetValue !== undefined
                ? ` · ${recommendation.portfolioTargetType} ${recommendation.portfolioTargetValue}`
                : ""}
              {recommendation.portfolioBidStrategyStatus ? ` · ${labelize(recommendation.portfolioBidStrategyStatus)}` : ""}
            </div>
          ) : null}
          {recommendation.portfolioContaminationSource && recommendation.portfolioContaminationSource !== "none" ? (
            <div className="mt-1 text-xs text-amber-800">
              Portfolio contamination: {labelize(recommendation.portfolioContaminationSource)}
              {recommendation.portfolioContaminationSeverity ? ` · ${labelize(recommendation.portfolioContaminationSeverity)}` : ""}
              {recommendation.portfolioAttributionWindowDays ? ` · window ${recommendation.portfolioAttributionWindowDays}d` : ""}
            </div>
          ) : null}
          {recommendation.portfolioUnlockGuidance ? (
            <div className="mt-1 text-xs text-slate-700">
              Unlock path: {recommendation.portfolioUnlockGuidance}
            </div>
          ) : null}
        </div>
      ) : null}

      {recommendation.sharedBudgetAdjustmentPreview ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-sky-700">Shared Budget Preview</div>
              <div className="mt-1 text-sm font-medium">
                {recommendation.sharedBudgetAdjustmentPreview.previousAmount} →{" "}
                {recommendation.sharedBudgetAdjustmentPreview.proposedAmount}
              </div>
              <div className="mt-1 text-xs text-slate-700">
                This is shared-state mutate, not a local campaign budget change.
              </div>
              {recommendation.sharedBudgetAdjustmentPreview.mixedGovernance ? (
                <div className="mt-1 text-xs text-amber-700">
                  Mixed-governance pool: tighter shared-budget guardrails are active here.
                </div>
              ) : null}
            </div>
            <div className="text-right text-xs text-slate-600">
              <div>Delta: {recommendation.sharedBudgetAdjustmentPreview.deltaPercent}%</div>
              {recommendation.sharedBudgetAdjustmentPreview.deltaCapPercent ? (
                <div className="mt-1">Cap: {recommendation.sharedBudgetAdjustmentPreview.deltaCapPercent}%</div>
              ) : null}
              <div className="mt-1">
                Rollback: {recommendation.rollbackSafetyState ? labelize(recommendation.rollbackSafetyState) : "safe"}
              </div>
              {recommendation.rollbackAvailableUntil ? (
                <div className="mt-1">Window: {recommendation.rollbackAvailableUntil.slice(0, 10)}</div>
              ) : null}
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-700">
            Governed campaigns: {recommendation.sharedBudgetAdjustmentPreview.governedCampaigns.map((campaign) => campaign.name).join(" · ")}
          </div>
          {recommendation.sharedBudgetAdjustmentPreview.zeroSumNote ? (
            <div className="mt-1 text-xs text-slate-600">{recommendation.sharedBudgetAdjustmentPreview.zeroSumNote}</div>
          ) : null}
        </div>
      ) : null}

      {recommendation.portfolioTargetAdjustmentPreview ? (
        <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/40 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-fuchsia-700">Portfolio Target Preview</div>
              <div className="mt-1 text-sm font-medium">
                {recommendation.portfolioTargetAdjustmentPreview.targetType}{" "}
                {recommendation.portfolioTargetAdjustmentPreview.previousValue} →{" "}
                {recommendation.portfolioTargetAdjustmentPreview.proposedValue}
              </div>
              <div className="mt-1 text-xs text-slate-700">
                This is portfolio-target mutate, not a local campaign budget change.
              </div>
              <div className="mt-1 text-xs text-slate-600">
                Allowed now because one governed portfolio target is stable, bounded, and below the shared-budget overlap threshold.
              </div>
            </div>
            <div className="text-right text-xs text-slate-600">
              <div>Delta: {recommendation.portfolioTargetAdjustmentPreview.deltaPercent}%</div>
              <div className="mt-1">
                Rollback: {recommendation.rollbackSafetyState ? labelize(recommendation.rollbackSafetyState) : "caution"}
              </div>
              {recommendation.rollbackAvailableUntil ? (
                <div className="mt-1">Window: {recommendation.rollbackAvailableUntil.slice(0, 10)}</div>
              ) : null}
              {recommendation.portfolioTargetAdjustmentPreview.attributionWindowDays ? (
                <div className="mt-1">Attribution: {recommendation.portfolioTargetAdjustmentPreview.attributionWindowDays}d</div>
              ) : null}
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-700">
            Governed campaigns: {recommendation.portfolioTargetAdjustmentPreview.governedCampaigns.map((campaign) => campaign.name).join(" · ")}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Early outcome may remain inconclusive while the portfolio strategy stabilizes.
          </div>
        </div>
      ) : null}

      {recommendation.jointAllocatorAdjustmentPreview ? (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-indigo-700">Joint Allocator Preview</div>
              <div className="mt-1 text-sm font-medium">
                {labelize(recommendation.jointAllocatorAdjustmentPreview.budgetActionType)} then adjust{" "}
                {recommendation.jointAllocatorAdjustmentPreview.portfolioTargetType}
              </div>
              <div className="mt-1 text-xs text-slate-700">
                Budget {recommendation.jointAllocatorAdjustmentPreview.budgetPreviousAmount} →{" "}
                {recommendation.jointAllocatorAdjustmentPreview.budgetProposedAmount} · Target{" "}
                {recommendation.jointAllocatorAdjustmentPreview.portfolioPreviousValue} →{" "}
                {recommendation.jointAllocatorAdjustmentPreview.portfolioProposedValue}
              </div>
              <div className="mt-1 text-xs text-slate-600">
                One bounded budget surface and one portfolio target surface will execute in this order:{" "}
                {recommendation.jointAllocatorAdjustmentPreview.executionOrder.join(" -> ")}.
              </div>
              {recommendation.jointAllocatorCautionReason ? (
                <div className="mt-1 text-xs text-amber-700">{recommendation.jointAllocatorCautionReason}</div>
              ) : null}
            </div>
            <div className="text-right text-xs text-slate-600">
              <div>Budget delta: {recommendation.jointAllocatorAdjustmentPreview.budgetDeltaPercent}%</div>
              <div className="mt-1">Target delta: {recommendation.jointAllocatorAdjustmentPreview.portfolioDeltaPercent}%</div>
              <div className="mt-1">Combined shock: {recommendation.jointAllocatorAdjustmentPreview.combinedShockPercent}%</div>
              {recommendation.rollbackAvailableUntil ? (
                <div className="mt-1">Rollback window: {recommendation.rollbackAvailableUntil.slice(0, 10)}</div>
              ) : null}
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-700">
            Governed scope: {recommendation.jointAllocatorAdjustmentPreview.governedCampaigns.map((campaign) => campaign.name).join(" · ")}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Dual-allocator moves use stricter guardrails and more conservative attribution than single-surface mutate.
          </div>
        </div>
      ) : null}

      <AiInterpretationCard recommendation={recommendation} />

      {onFocusEntity && recommendation.entityId ? (
        <div className="flex justify-end gap-2">
          {businessId &&
          accountId &&
          recommendation.executionMode === "mutate_ready" &&
          recommendation.mutateActionType !== "adjust_shared_budget" &&
          recommendation.mutateActionType !== "adjust_portfolio_target" &&
          recommendation.mutateActionType &&
          recommendation.mutatePayloadPreview ? (
            <Button
              variant="default"
              size="sm"
              disabled={isExecuting}
              onClick={() =>
                runAdvisorAction({
                  executionAction: "apply_mutate",
                  mutateActionType: recommendation.mutateActionType,
                  mutatePayloadPreview: recommendation.mutatePayloadPreview,
                  executionTrustBand: recommendation.executionTrustBand,
                  dependencyReadiness: recommendation.dependencyReadiness,
                  stabilizationHoldUntil: recommendation.stabilizationHoldUntil,
                  rollbackActionType: recommendation.rollbackActionType,
                  rollbackPayloadPreview: recommendation.rollbackPayloadPreview,
                })
              }
            >
              Apply via Adsecute
            </Button>
          ) : null}
          {businessId &&
          accountId &&
          recommendation.rollbackAvailable &&
          recommendation.rollbackActionType &&
          recommendation.rollbackPayloadPreview ? (
            <Button
              variant="outline"
              size="sm"
              disabled={isExecuting}
              onClick={() =>
                runAdvisorAction({
                  executionAction: "rollback_mutate",
                  rollbackActionType: recommendation.rollbackActionType,
                  rollbackPayloadPreview: recommendation.rollbackPayloadPreview,
                })
              }
            >
              Roll Back
            </Button>
          ) : null}
          {recommendation.deepLinkUrl ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={isExecuting}
              onClick={() => window.open(recommendation.deepLinkUrl ?? "", "_blank", "noopener,noreferrer")}
            >
              Open in Google Ads
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => onFocusEntity(recommendation)}>
            Jump to entity
          </Button>
        </div>
      ) : recommendation.deepLinkUrl ? (
        <div className="flex justify-end">
          {businessId &&
          accountId &&
          recommendation.executionMode === "mutate_ready" &&
          recommendation.mutateActionType !== "adjust_shared_budget" &&
          recommendation.mutateActionType !== "adjust_portfolio_target" &&
          recommendation.mutateActionType &&
          recommendation.mutatePayloadPreview ? (
            <Button
              variant="default"
              size="sm"
              disabled={isExecuting}
              onClick={() =>
                runAdvisorAction({
                  executionAction: "apply_mutate",
                  mutateActionType: recommendation.mutateActionType,
                  mutatePayloadPreview: recommendation.mutatePayloadPreview,
                  executionTrustBand: recommendation.executionTrustBand,
                  dependencyReadiness: recommendation.dependencyReadiness,
                  stabilizationHoldUntil: recommendation.stabilizationHoldUntil,
                  rollbackActionType: recommendation.rollbackActionType,
                  rollbackPayloadPreview: recommendation.rollbackPayloadPreview,
                })
              }
            >
              Apply via Adsecute
            </Button>
          ) : null}
          {businessId &&
          accountId &&
          recommendation.rollbackAvailable &&
          recommendation.rollbackActionType &&
          recommendation.rollbackPayloadPreview ? (
            <Button
              variant="outline"
              size="sm"
              disabled={isExecuting}
              onClick={() =>
                runAdvisorAction({
                  executionAction: "rollback_mutate",
                  rollbackActionType: recommendation.rollbackActionType,
                  rollbackPayloadPreview: recommendation.rollbackPayloadPreview,
                })
              }
            >
              Roll Back
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            disabled={isExecuting}
            onClick={() => window.open(recommendation.deepLinkUrl ?? "", "_blank", "noopener,noreferrer")}
          >
            Open in Google Ads
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function DecisionBucket({
  title,
  subtitle,
  recommendations,
  onFocusEntity,
  businessId,
  accountId,
}: {
  title: string;
  subtitle: string;
  recommendations: GoogleAdvisorRecommendation[];
  onFocusEntity?: (recommendation: GoogleAdvisorRecommendation) => void;
  businessId?: string;
  accountId?: string | null;
}) {
  const router = useRouter();
  const [isExecutingBatch, setIsExecutingBatch] = useState<string | null>(null);
  if (recommendations.length === 0) {
    return (
      <section className="space-y-3 rounded-xl border border-dashed bg-muted/10 p-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <p className="text-sm text-muted-foreground">No decisions in this bucket right now.</p>
      </section>
    );
  }

  const batchGroups = Array.from(
    recommendations.reduce((acc, recommendation) => {
      if (!recommendation.batchEligible || !recommendation.batchGroupKey || !recommendation.mutateActionType || !recommendation.mutatePayloadPreview) {
        return acc;
      }
      const existing = acc.get(recommendation.batchGroupKey) ?? [];
      existing.push(recommendation);
      acc.set(recommendation.batchGroupKey, existing);
      return acc;
    }, new Map<string, GoogleAdvisorRecommendation[]>())
  ).filter(([, entries]) => entries.length > 1);

  async function runBatchAction(input: {
    batchGroupKey: string;
    action: "apply_batch_mutate" | "rollback_batch_mutate";
    recommendations: GoogleAdvisorRecommendation[];
  }) {
    if (!businessId || !accountId) return;
    setIsExecutingBatch(input.batchGroupKey);
    try {
      const response = await fetch("/api/google-ads/advisor-memory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId,
          accountId,
          recommendationFingerprint: input.recommendations[0]?.recommendationFingerprint,
          batchExecutionAction: input.action === "apply_batch_mutate" ? "apply_batch_mutate" : undefined,
          executionAction: input.action === "rollback_batch_mutate" ? "rollback_batch_mutate" : undefined,
          transactionId: input.recommendations[0]?.transactionId ?? null,
          batchItems: input.recommendations.map((recommendation) => ({
            recommendationFingerprint: recommendation.recommendationFingerprint,
            accountId: accountId,
            mutateActionType: recommendation.mutateActionType,
            mutatePayloadPreview: recommendation.mutatePayloadPreview,
            rollbackActionType: recommendation.rollbackActionType,
            rollbackPayloadPreview: recommendation.rollbackPayloadPreview,
            executionTrustBand: recommendation.executionTrustBand,
            batchGroupKey: recommendation.batchGroupKey,
          })),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? "Batch execution failed.");
      }
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Batch execution failed.");
    } finally {
      setIsExecutingBatch(null);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {batchGroups.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-dashed bg-muted/10 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Batch Actions</div>
          {batchGroups.map(([batchGroupKey, entries]) => {
            const canRollbackBatch = entries.every(
              (entry) =>
                entry.transactionId &&
                entry.batchRollbackAvailable &&
                entry.rollbackActionType &&
                entry.rollbackPayloadPreview
            );
            return (
              <div key={batchGroupKey} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/80 p-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    {labelize(entries[0]?.mutateActionType ?? "batch")} batch
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {entries.length} recommendations share one execution group.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={isExecutingBatch === batchGroupKey}
                    onClick={() =>
                      runBatchAction({
                        batchGroupKey,
                        action: "apply_batch_mutate",
                        recommendations: entries,
                      })
                    }
                  >
                    Apply Batch
                  </Button>
                  {canRollbackBatch ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isExecutingBatch === batchGroupKey}
                      onClick={() =>
                        runBatchAction({
                          batchGroupKey,
                          action: "rollback_batch_mutate",
                          recommendations: entries,
                        })
                      }
                    >
                      Roll Back Batch
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="space-y-4">
        {recommendations.map((recommendation) => (
          <GoogleDecisionCard
            key={recommendation.id}
            recommendation={recommendation}
            onFocusEntity={onFocusEntity}
            businessId={businessId}
            accountId={accountId}
          />
        ))}
      </div>
    </section>
  );
}

function ActionClusterCard({
  cluster,
  recommendations,
  businessId,
  accountId,
}: {
  cluster: GoogleActionCluster;
  recommendations: GoogleAdvisorRecommendation[];
  businessId?: string;
  accountId?: string | null;
}) {
  const router = useRouter();
  const [isExecuting, setIsExecuting] = useState(false);
  const canExecute =
    Boolean(businessId) &&
    Boolean(accountId) &&
    accountId !== "all" &&
    !(
      cluster.executionSummary.nextEligibleAt &&
      Date.parse(cluster.executionSummary.nextEligibleAt) > Date.now()
    ) &&
    (cluster.clusterReadiness === "ready_trusted" || cluster.clusterReadiness === "ready_unverified" || cluster.clusterReadiness === "partially_executable");
  const canRollback =
    Boolean(businessId) &&
    Boolean(accountId) &&
    accountId !== "all" &&
    cluster.executionSummary.childTransactionIds.length > 0 &&
    cluster.executionSummary.clusterExecutionStatus !== "rolled_back";

  async function runClusterAction(executionAction: "execute_cluster" | "rollback_cluster") {
    if (!businessId || !accountId || accountId === "all") return;
    setIsExecuting(true);
    try {
      const response = await fetch("/api/google-ads/advisor-memory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId,
          accountId,
          executionAction,
          cluster,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? "Cluster execution failed.");
      }
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Cluster execution failed.");
    } finally {
      setIsExecuting(false);
    }
  }

  return (
    <article className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap gap-2">
            <Badge>{clusterBucketLabel(cluster.clusterBucket)}</Badge>
            <Badge variant="outline">{labelize(cluster.clusterType)}</Badge>
            <Badge variant="outline">{labelize(cluster.clusterStatus)}</Badge>
            {cluster.clusterTrustBand ? (
              <Badge variant="outline">Trust: {labelize(cluster.clusterTrustBand)}</Badge>
            ) : null}
          </div>
          <h3 className="text-base font-semibold leading-tight">{cluster.clusterObjective}</h3>
          <p className="text-sm text-muted-foreground">{cluster.clusterRankReason}</p>
          <p className={cn("text-sm font-medium", moveValidityTone(cluster.clusterMoveValidity))}>
            Move validity: {labelize(cluster.clusterMoveValidity)}
          </p>
        </div>
        <div className="text-right text-xs">
          <div className={cn("font-semibold", clusterReadinessTone(cluster.clusterReadiness))}>
            {labelize(cluster.clusterReadiness)}
          </div>
          <div className="mt-1 text-muted-foreground">
            Rank {cluster.clusterRankScore.toFixed(1)} · {cluster.steps.length} steps
          </div>
          {cluster.executionSummary.stopReason ? (
            <div className="mt-1 max-w-xs text-rose-700">{cluster.executionSummary.stopReason}</div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border bg-muted/15 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Execution Summary</div>
          <div className="mt-1 text-sm font-medium">
            {labelize(cluster.executionSummary.clusterExecutionStatus)}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {cluster.executionSummary.completedChildStepIds.length} completed ·{" "}
            {cluster.executionSummary.failedChildStepIds.length} failed
          </div>
          {cluster.clusterMoveConfidence ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Move confidence: {labelize(cluster.clusterMoveConfidence)}
            </div>
          ) : null}
          {cluster.executionSummary.currentStepId ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Current step: {cluster.executionSummary.currentStepId}
            </div>
          ) : null}
          {cluster.executionSummary.waitingChildStepId ? (
            <div className="mt-1 text-xs text-amber-700">
              Waiting step: {cluster.executionSummary.waitingChildStepId}
            </div>
          ) : null}
          {cluster.executionSummary.nextEligibleAt ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Next eligible: {cluster.executionSummary.nextEligibleAt.slice(0, 16).replace("T", " ")}
            </div>
          ) : null}
          {cluster.lastExecutedAt ? (
            <div className="mt-1 text-xs text-muted-foreground">Last executed: {cluster.lastExecutedAt.slice(0, 10)}</div>
          ) : null}
          {cluster.lastRolledBackAt ? (
            <div className="mt-1 text-xs text-muted-foreground">Last rolled back: {cluster.lastRolledBackAt.slice(0, 10)}</div>
          ) : null}
        </div>
        <div className="rounded-lg border bg-muted/15 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Outcome</div>
          <div className="mt-1 text-sm font-medium">{labelize(cluster.outcomeState.verdict)}</div>
          {cluster.outcomeState.reason ? (
            <div className="mt-1 text-xs text-muted-foreground">{cluster.outcomeState.reason}</div>
          ) : null}
          {cluster.outcomeState.confidence ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Confidence: {labelize(cluster.outcomeState.confidence)}
            </div>
          ) : null}
          {cluster.outcomeState.failReason ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Hold: {labelize(cluster.outcomeState.failReason)}
            </div>
          ) : null}
          {cluster.outcomeState.lastValidationCheckAt ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Last validation: {cluster.outcomeState.lastValidationCheckAt.slice(0, 10)}
            </div>
          ) : null}
          {cluster.outcomeState.contaminationFlags && cluster.outcomeState.contaminationFlags.length > 0 ? (
            <div className="mt-1 text-xs text-amber-700">
              Contamination: {cluster.outcomeState.contaminationFlags.map(labelize).join(" · ")}
            </div>
          ) : null}
          {cluster.outcomeState.reallocationNetImpact ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Net realloc delta: {cluster.outcomeState.reallocationNetImpact.netDelta ?? 0}
            </div>
          ) : null}
        </div>
      </div>

      {(cluster.executionSummary.clusterExecutionStatus === "stabilizing" || cluster.executionSummary.waitingChildStepId) ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <div className="text-[10px] uppercase tracking-wide text-amber-700">Stabilization Hold</div>
          <div className="mt-1 text-sm font-medium">
            Cleanup completed. The allocator step is waiting before execution.
          </div>
          {cluster.executionSummary.stopReason ? (
            <div className="mt-1 text-xs text-slate-700">{cluster.executionSummary.stopReason}</div>
          ) : null}
          {cluster.executionSummary.nextEligibleAt ? (
            <div className="mt-2 text-xs text-slate-700">
              Next step becomes eligible at {cluster.executionSummary.nextEligibleAt.slice(0, 16).replace("T", " ")}.
            </div>
          ) : null}
        </div>
      ) : null}

      {cluster.sharedStateGovernanceType && cluster.sharedStateGovernanceType !== "unknown" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-amber-700">Allocator Context</div>
              <div className="mt-1 text-sm font-medium">{governanceLabel(cluster.sharedStateGovernanceType)}</div>
              {cluster.portfolioGovernanceStatus && cluster.portfolioGovernanceStatus !== "none" ? (
                <div className="mt-1 text-xs text-slate-700">
                  Governance stack: {labelize(cluster.portfolioGovernanceStatus)}
                </div>
              ) : null}
              {cluster.sharedStateMutateBlockedReason ? (
                <div className="mt-1 text-sm text-slate-800">{cluster.sharedStateMutateBlockedReason}</div>
              ) : null}
              {cluster.portfolioBlockedReason ? (
                <div className="mt-1 text-xs text-amber-800">{cluster.portfolioBlockedReason}</div>
              ) : null}
              {cluster.portfolioCautionReason ? (
                <div className="mt-1 text-xs text-slate-700">{cluster.portfolioCautionReason}</div>
              ) : null}
            </div>
            <div className="text-right text-xs text-slate-600">
              {cluster.governedEntityCount ? <div>Governed entities: {cluster.governedEntityCount}</div> : null}
              {cluster.sharedStateAwarenessStatus ? (
                <div className="mt-1">Awareness: {labelize(cluster.sharedStateAwarenessStatus)}</div>
              ) : null}
              {cluster.allocatorCouplingConfidence ? (
                <div className="mt-1">Coupling confidence: {labelize(cluster.allocatorCouplingConfidence)}</div>
              ) : null}
              {cluster.portfolioCouplingStrength ? (
                <div className="mt-1">Portfolio coupling: {labelize(cluster.portfolioCouplingStrength)}</div>
              ) : null}
              {cluster.portfolioAttributionWindowDays ? (
                <div className="mt-1">Attribution window: {cluster.portfolioAttributionWindowDays}d</div>
              ) : null}
            </div>
          </div>
          {cluster.coupledCampaignNames?.length ? (
            <div className="mt-2 text-xs text-slate-700">
              Coupled campaigns: {cluster.coupledCampaignNames.join(" · ")}
            </div>
          ) : null}
          {cluster.portfolioBidStrategyResourceName ? (
            <div className="mt-1 text-xs text-slate-700">
              Portfolio: {cluster.portfolioBidStrategyType ?? "Strategy"}
              {cluster.portfolioTargetType && cluster.portfolioTargetValue !== null && cluster.portfolioTargetValue !== undefined
                ? ` · ${cluster.portfolioTargetType} ${cluster.portfolioTargetValue}`
                : ""}
              {cluster.portfolioBidStrategyStatus ? ` · ${labelize(cluster.portfolioBidStrategyStatus)}` : ""}
            </div>
          ) : null}
          {cluster.portfolioContaminationSource && cluster.portfolioContaminationSource !== "none" ? (
            <div className="mt-1 text-xs text-amber-800">
              Portfolio contamination: {labelize(cluster.portfolioContaminationSource)}
              {cluster.portfolioContaminationSeverity ? ` · ${labelize(cluster.portfolioContaminationSeverity)}` : ""}
            </div>
          ) : null}
          {cluster.portfolioUnlockGuidance ? (
            <div className="mt-1 text-xs text-slate-700">
              Unlock path: {cluster.portfolioUnlockGuidance}
            </div>
          ) : null}
        </div>
      ) : null}

      {recommendations.some((recommendation) => recommendation.sharedBudgetAdjustmentPreview) ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3">
          <div className="text-[10px] uppercase tracking-wide text-sky-700">Blast Radius Preview</div>
          {recommendations
            .filter((recommendation) => recommendation.sharedBudgetAdjustmentPreview)
            .map((recommendation) => (
              <div key={`${cluster.clusterId}-${recommendation.id}-shared-budget`} className="mt-2 rounded-lg border bg-background/80 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">
                      {recommendation.sharedBudgetAdjustmentPreview?.previousAmount} →{" "}
                      {recommendation.sharedBudgetAdjustmentPreview?.proposedAmount}
                    </div>
                    <div className="mt-1 text-xs text-slate-700">
                      {recommendation.sharedBudgetAdjustmentPreview?.governedCampaigns.map((campaign) => campaign.name).join(" · ")}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      This is shared-state mutate, not a local campaign budget change.
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-600">
                    <div>Delta: {recommendation.sharedBudgetAdjustmentPreview?.deltaPercent}%</div>
                    {recommendation.sharedBudgetAdjustmentPreview?.deltaCapPercent ? (
                      <div className="mt-1">Cap: {recommendation.sharedBudgetAdjustmentPreview.deltaCapPercent}%</div>
                    ) : null}
                    {recommendation.rollbackSafetyState ? (
                      <div className="mt-1">Rollback: {labelize(recommendation.rollbackSafetyState)}</div>
                    ) : null}
                    {recommendation.rollbackAvailableUntil ? (
                      <div className="mt-1">Window: {recommendation.rollbackAvailableUntil.slice(0, 10)}</div>
                    ) : null}
                  </div>
                </div>
                {recommendation.sharedBudgetAdjustmentPreview?.zeroSumNote ? (
                  <div className="mt-2 text-xs text-slate-600">
                    {recommendation.sharedBudgetAdjustmentPreview.zeroSumNote}
                  </div>
                ) : null}
                {recommendation.sharedBudgetAdjustmentPreview?.mixedGovernance ? (
                  <div className="mt-1 text-xs text-amber-700">
                    Mixed-governance pool: tighter shared-budget guardrails are active here.
                  </div>
                ) : null}
              </div>
            ))}
        </div>
      ) : null}

      {recommendations.some((recommendation) => recommendation.portfolioTargetAdjustmentPreview) ? (
        <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/40 p-3">
          <div className="text-[10px] uppercase tracking-wide text-fuchsia-700">Portfolio Blast Radius</div>
          {recommendations
            .filter((recommendation) => recommendation.portfolioTargetAdjustmentPreview)
            .map((recommendation) => (
              <div key={`${cluster.clusterId}-${recommendation.id}-portfolio-target`} className="mt-2 rounded-lg border bg-background/80 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">
                      {recommendation.portfolioTargetAdjustmentPreview?.targetType}{" "}
                      {recommendation.portfolioTargetAdjustmentPreview?.previousValue} →{" "}
                      {recommendation.portfolioTargetAdjustmentPreview?.proposedValue}
                    </div>
                    <div className="mt-1 text-xs text-slate-700">
                      {recommendation.portfolioTargetAdjustmentPreview?.governedCampaigns.map((campaign) => campaign.name).join(" · ")}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      This is portfolio-target mutate, not a local campaign budget change.
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-600">
                    <div>Delta: {recommendation.portfolioTargetAdjustmentPreview?.deltaPercent}%</div>
                    {recommendation.rollbackSafetyState ? (
                      <div className="mt-1">Rollback: {labelize(recommendation.rollbackSafetyState)}</div>
                    ) : null}
                    {recommendation.rollbackAvailableUntil ? (
                      <div className="mt-1">Window: {recommendation.rollbackAvailableUntil.slice(0, 10)}</div>
                    ) : null}
                    {recommendation.portfolioTargetAdjustmentPreview?.attributionWindowDays ? (
                      <div className="mt-1">Attribution: {recommendation.portfolioTargetAdjustmentPreview.attributionWindowDays}d</div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  Early validation stays conservative until the full portfolio attribution window matures.
                </div>
              </div>
            ))}
        </div>
      ) : null}

      {recommendations.some((recommendation) => recommendation.jointAllocatorAdjustmentPreview) ? (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
          <div className="text-[10px] uppercase tracking-wide text-indigo-700">Joint Allocator Blast Radius</div>
          {recommendations
            .filter((recommendation) => recommendation.jointAllocatorAdjustmentPreview)
            .map((recommendation) => (
              <div key={`${cluster.clusterId}-${recommendation.id}-joint-allocator`} className="mt-2 rounded-lg border bg-background/80 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">
                      {recommendation.jointAllocatorAdjustmentPreview?.executionOrder.join(" -> ")}
                    </div>
                    <div className="mt-1 text-xs text-slate-700">
                      Budget {recommendation.jointAllocatorAdjustmentPreview?.budgetPreviousAmount} →{" "}
                      {recommendation.jointAllocatorAdjustmentPreview?.budgetProposedAmount} · Target{" "}
                      {recommendation.jointAllocatorAdjustmentPreview?.portfolioPreviousValue} →{" "}
                      {recommendation.jointAllocatorAdjustmentPreview?.portfolioProposedValue}
                    </div>
                    <div className="mt-1 text-xs text-slate-700">
                      {recommendation.jointAllocatorAdjustmentPreview?.governedCampaigns.map((campaign) => campaign.name).join(" · ")}
                    </div>
                    {recommendation.jointAllocatorCautionReason ? (
                      <div className="mt-1 text-xs text-amber-700">{recommendation.jointAllocatorCautionReason}</div>
                    ) : null}
                  </div>
                  <div className="text-right text-xs text-slate-600">
                    <div>Budget: {recommendation.jointAllocatorAdjustmentPreview?.budgetDeltaPercent}%</div>
                    <div className="mt-1">Target: {recommendation.jointAllocatorAdjustmentPreview?.portfolioDeltaPercent}%</div>
                    <div className="mt-1">Combined shock: {recommendation.jointAllocatorAdjustmentPreview?.combinedShockPercent}%</div>
                    {recommendation.rollbackAvailableUntil ? (
                      <div className="mt-1">Window: {recommendation.rollbackAvailableUntil.slice(0, 10)}</div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
        </div>
      ) : null}

      <div className="rounded-lg border bg-muted/10 p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Ordered Steps</div>
        <div className="mt-2 space-y-2">
          {cluster.steps.map((step, index) => (
            <div key={step.stepId} className="rounded-lg border bg-background/80 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">
                  {index + 1}. {step.title}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{stepTypeLabel(step.stepType)}</Badge>
                  <Badge variant="outline">{labelize(step.executionMode)}</Badge>
                  <Badge variant="outline">{labelize(step.stepCriticality)}</Badge>
                  {cluster.executionSummary.completedChildStepIds.includes(step.stepId) ? (
                    <Badge variant="outline">Completed</Badge>
                  ) : cluster.executionSummary.failedChildStepIds.includes(step.stepId) ? (
                    <Badge variant="destructive">Failed</Badge>
                  ) : cluster.executionSummary.waitingChildStepId === step.stepId ? (
                    <Badge variant="outline">Waiting</Badge>
                  ) : null}
                  {step.executionTrustBand ? (
                    <Badge variant="outline">Trust: {labelize(step.executionTrustBand)}</Badge>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {step.recommendationIds.length} recommendation{step.recommendationIds.length === 1 ? "" : "s"}
                {step.dependencyReadiness ? ` · ${labelize(step.dependencyReadiness)}` : ""}
                {step.stabilizationHoldUntil ? ` · hold until ${step.stabilizationHoldUntil.slice(0, 10)}` : ""}
                {` · ${labelize(step.stepFailureBoundary)}`}
              </div>
              {step.waitReason ? (
                <div className="mt-1 text-xs text-amber-700">{step.waitReason}</div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {cluster.clusterMoveValidityReason ? (
        <div className="rounded-lg border bg-muted/10 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Move Truth</div>
          <div className="mt-1 text-sm">{cluster.clusterMoveValidityReason}</div>
        </div>
      ) : null}

      {cluster.validationPlan.length > 0 ? (
        <ListBlock title="Validation Plan" items={cluster.validationPlan} />
      ) : null}

      {cluster.recoveryState ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <div className="text-[10px] uppercase tracking-wide text-amber-700">Recovery</div>
          <div className="mt-1 text-sm font-medium">{labelize(cluster.recoveryState)}</div>
          {cluster.recoveryRecommendedAction ? (
            <div className="mt-1 text-sm text-slate-800">{cluster.recoveryRecommendedAction}</div>
          ) : null}
          {cluster.executionSummary.retryEligibleFailedChildStepIds?.length ? (
            <div className="mt-2 text-xs text-slate-700">
              Retryable failed steps: {cluster.executionSummary.retryEligibleFailedChildStepIds.join(", ")}
            </div>
          ) : null}
          {cluster.executionSummary.manualRecoveryInstructions?.length ? (
            <div className="mt-2 space-y-1 text-xs text-slate-700">
              {cluster.executionSummary.manualRecoveryInstructions.map((instruction, index) => (
                <div key={`${cluster.clusterId}-recovery-${index}`}>{instruction}</div>
              ))}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {cluster.executionSummary.clusterExecutionStatus !== "rolled_back" && canRollback ? (
              <Button size="sm" variant="outline" disabled={isExecuting} onClick={() => runClusterAction("rollback_cluster")}>
                Reverse Successful Steps
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" disabled={isExecuting}>
              Acknowledge Partial State
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border bg-muted/10 p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Supporting Evidence</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {recommendations.map((recommendation) => (
            <Badge key={recommendation.id} variant="outline">
              {recommendation.title}
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" disabled={!canExecute || isExecuting} onClick={() => runClusterAction("execute_cluster")}>
          Execute Move
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!canRollback || isExecuting}
          onClick={() => runClusterAction("rollback_cluster")}
        >
          Roll Back Move
        </Button>
      </div>
    </article>
  );
}

function ClusterBucketSection({
  title,
  subtitle,
  clusters,
  recommendationMap,
  businessId,
  accountId,
}: {
  title: string;
  subtitle: string;
  clusters: GoogleActionCluster[];
  recommendationMap: Map<string, GoogleAdvisorRecommendation>;
  businessId?: string;
  accountId?: string | null;
}) {
  if (clusters.length === 0) {
    return (
      <section className="space-y-3 rounded-xl border border-dashed bg-muted/10 p-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <p className="text-sm text-muted-foreground">No operator moves in this bucket right now.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="space-y-4">
        {clusters.map((cluster) => (
          <ActionClusterCard
            key={cluster.clusterId}
            cluster={cluster}
            recommendations={cluster.memberRecommendationIds
              .map((id) => recommendationMap.get(id))
              .filter((recommendation): recommendation is GoogleAdvisorRecommendation => Boolean(recommendation))}
            businessId={businessId}
            accountId={accountId}
          />
        ))}
      </div>
    </section>
  );
}

export function GoogleAdvisorPanel({
  advisor,
  onFocusEntity,
  businessId,
  accountId,
}: {
  advisor: GoogleAdvisorResponse;
  onFocusEntity?: (recommendation: GoogleAdvisorRecommendation) => void;
  businessId?: string;
  accountId?: string | null;
}) {
  const recommendationMap = new Map(advisor.recommendations.map((recommendation) => [recommendation.id, recommendation]));
  const nowClusters = advisor.clusters.filter((cluster) => cluster.clusterBucket === "now");
  const nextClusters = advisor.clusters.filter((cluster) => cluster.clusterBucket === "next");
  const blockedClusters = advisor.clusters.filter((cluster) => cluster.clusterBucket === "blocked");
  const doNow = advisor.recommendations.filter((recommendation) => recommendation.doBucket === "do_now");
  const doNext = advisor.recommendations.filter((recommendation) => recommendation.doBucket === "do_next");
  const doLater = advisor.recommendations.filter((recommendation) => recommendation.doBucket === "do_later");
  const selectedRangeContext =
    advisor.metadata?.selectedRangeContext &&
    advisor.metadata.selectedRangeContext.eligible &&
    advisor.metadata.selectedRangeContext.state !== "hidden"
      ? advisor.metadata.selectedRangeContext
      : null;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Decision Strip</p>
          <h2 className="text-lg font-semibold">{advisor.summary.headline}</h2>
          <p className="text-sm text-muted-foreground">{advisor.summary.operatorNote}</p>
          {selectedRangeContext ? (
            <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-sky-700">
                Selected-Range Context
              </p>
              <p className="mt-1 text-xs text-slate-700">{selectedRangeContext.summary}</p>
            </div>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border bg-muted/15 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Operating Mode</div>
            <div className="mt-1 text-sm font-medium">{advisor.summary.accountOperatingMode}</div>
          </div>
          <div className="rounded-lg border bg-muted/15 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Top Constraint</div>
            <div className="mt-1 text-sm">{advisor.summary.topConstraint}</div>
          </div>
          <div className="rounded-lg border bg-muted/15 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Top Growth Lever</div>
            <div className="mt-1 text-sm">{advisor.summary.topGrowthLever}</div>
          </div>
          <div className="rounded-lg border bg-muted/15 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Focus Today</div>
            <div className="mt-1 text-sm">{advisor.summary.recommendedFocusToday}</div>
          </div>
          <div className="rounded-lg border bg-muted/15 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Data Trust</div>
            <div className="mt-1 text-sm">{advisor.summary.dataTrustSummary}</div>
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-muted/15 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Demand Map</div>
            <div className="mt-1 text-sm">{advisor.summary.demandMap}</div>
          </div>
          <div className="rounded-lg border bg-muted/15 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Top Priority</div>
            <div className="mt-1 text-sm">{advisor.summary.topPriority}</div>
          </div>
          <div className="rounded-lg border bg-muted/15 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Watchouts</div>
            <div className="mt-1 text-sm">
              {advisor.summary.watchouts.length > 0
                ? advisor.summary.watchouts.join(" · ")
                : "No active watchouts."}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <ClusterBucketSection
          title="Do Now"
          subtitle="Operator moves that can run now with current readiness and trust."
          clusters={nowClusters}
          recommendationMap={recommendationMap}
          businessId={businessId}
          accountId={accountId}
        />
        <ClusterBucketSection
          title="Do Next"
          subtitle="Moves that are staging or waiting for additional stabilization before execution."
          clusters={nextClusters}
          recommendationMap={recommendationMap}
          businessId={businessId}
          accountId={accountId}
        />
        <ClusterBucketSection
          title="Blocked"
          subtitle="Moves still blocked by prerequisites, degraded dependencies, or required handoff work."
          clusters={blockedClusters}
          recommendationMap={recommendationMap}
          businessId={businessId}
          accountId={accountId}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <DecisionBucket
          title="Supporting Evidence"
          subtitle="Underlying recommendations remain available as detailed evidence for the move layer."
          recommendations={doNow}
          onFocusEntity={onFocusEntity}
          businessId={businessId}
          accountId={accountId}
        />
        <DecisionBucket
          title="Supporting Queue"
          subtitle="Follow-on recommendations remain visible while clusters handle top-level execution packaging."
          recommendations={doNext}
          onFocusEntity={onFocusEntity}
          businessId={businessId}
          accountId={accountId}
        />
        <DecisionBucket
          title="Supporting Backlog"
          subtitle="Longer-horizon recommendations stay visible for manual review and backward compatibility."
          recommendations={doLater}
          onFocusEntity={onFocusEntity}
          businessId={businessId}
          accountId={accountId}
        />
      </div>
    </div>
  );
}
