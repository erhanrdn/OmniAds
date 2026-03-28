"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

      <AiInterpretationCard recommendation={recommendation} />

      {onFocusEntity && recommendation.entityId ? (
        <div className="flex justify-end gap-2">
          {businessId &&
          accountId &&
          recommendation.executionMode === "mutate_ready" &&
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

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
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
  const doNow = advisor.recommendations.filter((recommendation) => recommendation.doBucket === "do_now");
  const doNext = advisor.recommendations.filter((recommendation) => recommendation.doBucket === "do_next");
  const doLater = advisor.recommendations.filter((recommendation) => recommendation.doBucket === "do_later");

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Decision Strip</p>
          <h2 className="text-lg font-semibold">{advisor.summary.headline}</h2>
          <p className="text-sm text-muted-foreground">{advisor.summary.operatorNote}</p>
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
        <DecisionBucket
          title="Do Now"
          subtitle="High-priority moves with enough trust to act immediately."
          recommendations={doNow}
          onFocusEntity={onFocusEntity}
          businessId={businessId}
          accountId={accountId}
        />
        <DecisionBucket
          title="Do Next"
          subtitle="Follow-on decisions once the immediate work is covered."
          recommendations={doNext}
          onFocusEntity={onFocusEntity}
          businessId={businessId}
          accountId={accountId}
        />
        <DecisionBucket
          title="Do Later"
          subtitle="Watch, validate, or queue these after stronger signals arrive."
          recommendations={doLater}
          onFocusEntity={onFocusEntity}
          businessId={businessId}
          accountId={accountId}
        />
      </div>
    </div>
  );
}
