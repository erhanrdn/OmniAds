"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  GoogleAdvisorResponse,
  GoogleAdvisorRecommendation,
  GoogleRecommendationSection,
} from "@/src/services/google";

function decisionBadgeVariant(decisionState: GoogleAdvisorRecommendation["decisionState"]) {
  if (decisionState === "act") return "default";
  if (decisionState === "test") return "secondary";
  return "outline";
}

function confidenceLabel(confidence: GoogleAdvisorRecommendation["confidence"]) {
  return `${confidence} confidence`;
}

function priorityLabel(priority: GoogleAdvisorRecommendation["priority"]) {
  return `${priority} priority`;
}

function contributionTone(impact: GoogleAdvisorRecommendation["potentialContribution"]["impact"]) {
  if (impact === "high") return "text-emerald-700";
  if (impact === "medium") return "text-amber-700";
  return "text-muted-foreground";
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

function ActionList({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="space-y-2 rounded-lg border bg-muted/15 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.map((item, index) => (
          <Badge key={`${title}-${item}-${index}`} variant="outline" className="max-w-full truncate">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function GoogleAdvisorCard({
  recommendation,
  onFocusEntity,
}: {
  recommendation: GoogleAdvisorRecommendation;
  onFocusEntity?: (recommendation: GoogleAdvisorRecommendation) => void;
}) {
  return (
    <article className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">
            {recommendation.level === "account"
              ? "Account-level recommendation"
              : recommendation.entityName ?? recommendation.level}
          </div>
          <h3 className="text-base font-semibold leading-tight">{recommendation.title}</h3>
        </div>
        <Badge variant={decisionBadgeVariant(recommendation.decisionState)}>
          {recommendation.decisionState.toUpperCase()}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{recommendation.strategyLayer}</Badge>
        <Badge variant="outline">{confidenceLabel(recommendation.confidence)}</Badge>
        <Badge variant="outline">{priorityLabel(recommendation.priority)}</Badge>
        {recommendation.comparisonCohort ? (
          <Badge variant="outline">Compared within {recommendation.comparisonCohort}</Badge>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{recommendation.summary}</p>
        <p className="text-sm">
          <span className="font-medium">Why:</span> {recommendation.why}
        </p>
        <p className="text-sm">
          <span className="font-medium">Recommended action:</span>{" "}
          {recommendation.recommendedAction}
        </p>
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
        {recommendation.potentialContribution.estimatedRevenueLiftRange ? (
          <div className="mt-2 text-xs text-muted-foreground">
            Revenue lift: {recommendation.potentialContribution.estimatedRevenueLiftRange}
          </div>
        ) : null}
        {recommendation.potentialContribution.estimatedWasteRecoveryRange ? (
          <div className="mt-1 text-xs text-muted-foreground">
            Waste recovery: {recommendation.potentialContribution.estimatedWasteRecoveryRange}
          </div>
        ) : null}
        {recommendation.potentialContribution.estimatedEfficiencyLiftRange ? (
          <div className="mt-1 text-xs text-muted-foreground">
            Efficiency lift: {recommendation.potentialContribution.estimatedEfficiencyLiftRange}
          </div>
        ) : null}
      </div>

      <RecommendationEvidenceGrid recommendation={recommendation} />

      <div className="grid gap-3 md:grid-cols-2">
        <ActionList title="Promote To Exact" items={recommendation.promoteToExact} />
        <ActionList title="Promote To Phrase" items={recommendation.promoteToPhrase} />
        <ActionList title="Broad Discovery Themes" items={recommendation.broadDiscoveryThemes ?? recommendation.seedThemesBroad} />
        <ActionList title="Negative Queries" items={recommendation.negativeQueries} />
        <ActionList title="Negative Guardrails" items={recommendation.negativeGuardrails} />
        <ActionList title="Starting SKU Clusters" items={recommendation.startingSkuClusters} />
        <ActionList title="Scale SKU Clusters" items={recommendation.scaleSkuClusters} />
        <ActionList title="Reduce SKU Clusters" items={recommendation.reduceSkuClusters} />
        <ActionList title="Hidden Winners" items={recommendation.hiddenWinnerSkuClusters} />
        <ActionList title="Hero SKU Clusters" items={recommendation.heroSkuClusters} />
        <ActionList title="Scale-Ready Assets" items={recommendation.scaleReadyAssets} />
        <ActionList title="Test-Only Assets" items={recommendation.testOnlyAssets} />
        <ActionList title="Replace Assets" items={recommendation.replaceAssets} />
        <ActionList title="Replacement Angles" items={recommendation.replacementAngles} />
        <ActionList title="Weak Asset Groups" items={recommendation.weakAssetGroups} />
        <ActionList title="Keep Separate" items={recommendation.keepSeparateAssetGroups} />
        <ActionList title="Diagnostic Flags" items={recommendation.diagnosticFlags} />
        <ActionList title="Prerequisites" items={recommendation.prerequisites} />
        <ActionList title="Playbook Steps" items={recommendation.playbookSteps} />
      </div>

      {recommendation.reallocationBand ? (
        <div className="rounded-lg border bg-muted/15 p-3">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Reallocation Band
          </div>
          <div className="mt-1 text-sm font-medium">{recommendation.reallocationBand}</div>
        </div>
      ) : null}

      <div className="rounded-lg border border-dashed p-3 text-sm">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Decision Model
        </div>
        <div className="mt-2">
          <span className="font-medium">Core verdict:</span>{" "}
          {recommendation.timeframeContext.coreVerdict}
        </div>
        <div className="mt-1">
          <span className="font-medium">Selected range note:</span>{" "}
          {recommendation.timeframeContext.selectedRangeNote}
        </div>
        <div className="mt-1">
          <span className="font-medium">Historical support:</span>{" "}
          {recommendation.timeframeContext.historicalSupport}
        </div>
      </div>

      {onFocusEntity && recommendation.entityId ? (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onFocusEntity(recommendation)}>
            Jump to entity
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function GoogleAdvisorSectionBlock({
  section,
  onFocusEntity,
}: {
  section: GoogleRecommendationSection;
  onFocusEntity?: (recommendation: GoogleAdvisorRecommendation) => void;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {section.title}
        </h2>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {section.recommendations.map((recommendation) => (
          <GoogleAdvisorCard
            key={recommendation.id}
            recommendation={recommendation}
            onFocusEntity={onFocusEntity}
          />
        ))}
      </div>
    </section>
  );
}

export function GoogleAdvisorPanel({
  advisor,
  onFocusEntity,
}: {
  advisor: GoogleAdvisorResponse;
  onFocusEntity?: (recommendation: GoogleAdvisorRecommendation) => void;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Account Summary</p>
          <h2 className="text-lg font-semibold">{advisor.summary.headline}</h2>
          <p className="text-sm text-muted-foreground">{advisor.summary.operatorNote}</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-muted/15 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Demand Map
            </div>
            <div className="mt-1 text-sm">{advisor.summary.demandMap}</div>
          </div>
          <div className="rounded-lg border bg-muted/15 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Highest-Priority Move
            </div>
            <div className="mt-1 text-sm">{advisor.summary.topPriority}</div>
          </div>
          <div className="rounded-lg border bg-muted/15 p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Act Recommendations
            </div>
            <div className="mt-1 text-sm font-medium">
              {advisor.summary.actRecommendationCount}/{advisor.summary.totalRecommendations}
            </div>
          </div>
        </div>
      </section>

      {advisor.sections.map((section) => (
        <GoogleAdvisorSectionBlock
          key={section.id}
          section={section}
          onFocusEntity={onFocusEntity}
        />
      ))}
    </div>
  );
}
