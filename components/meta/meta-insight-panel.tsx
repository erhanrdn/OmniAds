"use client";

import { BrainCircuit, TrendingUp, ShieldAlert, Workflow, TestTube2 } from "lucide-react";
import type { MetaRecommendationsResponse, MetaRecommendation } from "@/lib/meta/recommendations";

const STRATEGY_LAYER_ORDER: NonNullable<MetaRecommendation["strategyLayer"]>[] = [
  "seasonality",
  "bidding",
  "scaling",
  "structure",
  "budget",
];

function strategyLayerMeta(layer: NonNullable<MetaRecommendation["strategyLayer"]>) {
  if (layer === "seasonality") {
    return {
      title: "Operating Model",
      description: "Seasonality, regime fit, and rebuild direction.",
    };
  }
  if (layer === "bidding") {
    return {
      title: "Bidding",
      description: "Bid method, safer ranges, and constraint changes.",
    };
  }
  if (layer === "scaling") {
    return {
      title: "Scaling",
      description: "Scale candidates and controlled budget expansion.",
    };
  }
  if (layer === "budget") {
    return {
      title: "Budget Allocation",
      description: "Where budget should concentrate inside comparable cohorts.",
    };
  }
  return {
    title: "Structure",
    description: "Campaign lanes, creative deployment, and geo shape.",
  };
}

function badgeTone(input: MetaRecommendation["lens"]) {
  if (input === "volume") return "bg-blue-500/10 text-blue-700";
  if (input === "profitability") return "bg-emerald-500/10 text-emerald-700";
  return "bg-amber-500/10 text-amber-700";
}

function decisionTone(input: MetaRecommendation["decisionState"]) {
  if (input === "act") return "bg-foreground text-background";
  if (input === "test") return "bg-violet-500/10 text-violet-700";
  return "bg-muted text-muted-foreground";
}

function LensIcon({ lens }: { lens: MetaRecommendation["lens"] }) {
  if (lens === "volume") return <TrendingUp className="h-4 w-4 text-blue-600" />;
  if (lens === "profitability") return <ShieldAlert className="h-4 w-4 text-emerald-600" />;
  return <Workflow className="h-4 w-4 text-amber-600" />;
}

function RecommendationCard({
  recommendation,
  onOpenCampaign,
}: {
  recommendation: MetaRecommendation;
  onOpenCampaign?: (campaignId: string) => void;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-muted/50 p-2">
            <LensIcon lens={recommendation.lens} />
          </div>
          <div>
            <p className="text-sm font-semibold">{recommendation.title}</p>
            <p className="text-[11px] text-muted-foreground">
              {recommendation.campaignName ?? "Account-level recommendation"}
            </p>
          </div>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${decisionTone(recommendation.decisionState)}`}>
          {recommendation.decisionState}
        </span>
      </div>

      {recommendation.campaignId ? (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => onOpenCampaign?.(recommendation.campaignId!)}
            className="text-[11px] font-medium text-blue-700 hover:underline"
          >
            Jump to campaign
          </button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${badgeTone(recommendation.lens)}`}>
          {recommendation.lens}
        </span>
        <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {recommendation.confidence} confidence
        </span>
        <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {recommendation.priority} priority
        </span>
        {recommendation.comparisonCohort ? (
          <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            compared within {recommendation.comparisonCohort}
          </span>
        ) : null}
        {recommendation.historicalRegime ? (
          <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            historical regime {recommendation.historicalRegime}
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-sm text-foreground">{recommendation.summary}</p>
      <p className="mt-2 text-xs text-muted-foreground">{recommendation.why}</p>

      <div className="mt-3 space-y-2 rounded-lg bg-muted/35 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Recommended Action
        </p>
        <p className="text-sm">{recommendation.recommendedAction}</p>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {recommendation.evidence.slice(0, 3).map((item) => (
          <div key={`${recommendation.id}-${item.label}`} className="rounded-lg border bg-background px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {item.label}
            </p>
            <p className="mt-1 text-sm font-medium">{item.value}</p>
          </div>
        ))}
      </div>

      {(recommendation.defensiveBidBand || recommendation.scaleBidBand || recommendation.requiresRebuild) ? (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {recommendation.defensiveBidBand ? (
            <div className="rounded-lg border bg-background px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Defensive Bid Band
              </p>
              <p className="mt-1 text-sm font-medium">{recommendation.defensiveBidBand}</p>
            </div>
          ) : null}
          {recommendation.scaleBidBand ? (
            <div className="rounded-lg border bg-background px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Scale Bid Band
              </p>
              <p className="mt-1 text-sm font-medium">{recommendation.scaleBidBand}</p>
            </div>
          ) : null}
          {recommendation.requiresRebuild ? (
            <div className="rounded-lg border bg-background px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Rebuild
              </p>
              <p className="mt-1 text-sm font-medium">{recommendation.rebuildReason ?? "Recommended"}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {(recommendation.promoteCreatives?.length || recommendation.keepTestingCreatives?.length || recommendation.doNotDeployCreatives?.length) ? (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {recommendation.promoteCreatives?.length ? (
            <div className="rounded-lg border bg-background px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Promote To Scaling
              </p>
              <p className="mt-1 text-sm font-medium">{recommendation.promoteCreatives.join(", ")}</p>
              {recommendation.targetScalingLane ? (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Target lane: {recommendation.targetScalingLane}
                </p>
              ) : null}
            </div>
          ) : null}
          {recommendation.keepTestingCreatives?.length ? (
            <div className="rounded-lg border bg-background px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Keep In TEST
              </p>
              <p className="mt-1 text-sm font-medium">{recommendation.keepTestingCreatives.join(", ")}</p>
            </div>
          ) : null}
          {recommendation.doNotDeployCreatives?.length ? (
            <div className="rounded-lg border bg-background px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Keep Out Of Scaling
              </p>
              <p className="mt-1 text-sm font-medium">{recommendation.doNotDeployCreatives.join(", ")}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {(recommendation.scalingGeoCluster?.length || recommendation.testingGeoCluster?.length || recommendation.matureGeoSplit?.length) ? (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {recommendation.scalingGeoCluster?.length ? (
            <div className="rounded-lg border bg-background px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Scaling Geo Cluster
              </p>
              <p className="mt-1 text-sm font-medium">{recommendation.scalingGeoCluster.join(", ")}</p>
            </div>
          ) : null}
          {recommendation.testingGeoCluster?.length ? (
            <div className="rounded-lg border bg-background px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                TEST Geo Cluster
              </p>
              <p className="mt-1 text-sm font-medium">{recommendation.testingGeoCluster.join(", ")}</p>
            </div>
          ) : null}
          {recommendation.matureGeoSplit?.length ? (
            <div className="rounded-lg border bg-background px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Keep Separate
              </p>
              <p className="mt-1 text-sm font-medium">{recommendation.matureGeoSplit.join(", ")}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 rounded-lg border border-dashed px-3 py-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Decision model</p>
        <div className="mt-2 space-y-2">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Core verdict</p>
            <p className="mt-1 text-xs text-foreground">{recommendation.timeframeContext.coreVerdict}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Selected range note</p>
            <p className="mt-1 text-xs text-foreground">{recommendation.timeframeContext.selectedRangeOverlay}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Historical support</p>
            <p className="mt-1 text-xs text-muted-foreground">{recommendation.timeframeContext.historicalSupport}</p>
          </div>
        </div>
        {recommendation.timeframeContext.note ? (
          <p className="mt-1 text-xs text-amber-700">{recommendation.timeframeContext.note}</p>
        ) : null}
      </div>
    </div>
  );
}

export function MetaInsightPanel({
  data,
  isLoading,
  isError,
  onRetry,
  onOpenCampaign,
}: {
  data?: MetaRecommendationsResponse;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onOpenCampaign?: (campaignId: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-violet-500/10 p-2">
            <BrainCircuit className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <p className="text-sm font-semibold">AI Insights</p>
            <p className="text-xs text-muted-foreground">Building multi-window recommendations…</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="rounded-xl border bg-muted/30 p-4">
              <div className="h-4 w-1/2 rounded bg-muted" />
              <div className="mt-3 h-3 w-full rounded bg-muted" />
              <div className="mt-2 h-3 w-5/6 rounded bg-muted" />
              <div className="mt-4 h-14 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-violet-500/10 p-2">
              <BrainCircuit className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-semibold">AI Insights</p>
              <p className="text-xs text-muted-foreground">Could not build recommendations right now.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.recommendations.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-violet-500/10 p-2">
            <BrainCircuit className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <p className="text-sm font-semibold">AI Insights</p>
            <p className="text-xs text-muted-foreground">
              Multi-window engine does not see a strong intervention signal yet.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const groupedRecommendations = STRATEGY_LAYER_ORDER.map((layer) => ({
    layer,
    ...strategyLayerMeta(layer),
    recommendations: data.recommendations.filter(
      (recommendation) => (recommendation.strategyLayer ?? "structure") === layer
    ),
  })).filter((group) => group.recommendations.length > 0);

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-violet-500/10 p-2">
            <BrainCircuit className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <p className="text-sm font-semibold">AI Insights</p>
            <p className="text-xs text-muted-foreground">
              Multi-window Meta decision engine validated against selected range + 3/7/14/30/90/history.
            </p>
          </div>
        </div>
        <div className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <TestTube2 className="mr-1 inline h-3.5 w-3.5" />
          Conservative rules
        </div>
      </div>

      <div className="mt-4 rounded-xl border bg-muted/25 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Account Summary
        </p>
        <p className="mt-1 text-base font-semibold">{data.summary.title}</p>
        <p className="mt-2 text-sm text-muted-foreground">{data.summary.summary}</p>
        {(data.summary.operatingMode || data.summary.currentRegime || data.summary.recommendedMode) ? (
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {data.summary.operatingMode ? (
              <div className="rounded-lg border bg-background px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Operating Mode
                </p>
                <p className="mt-1 text-sm font-medium">{data.summary.operatingMode}</p>
              </div>
            ) : null}
            {data.summary.currentRegime ? (
              <div className="rounded-lg border bg-background px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Current Regime
                </p>
                <p className="mt-1 text-sm font-medium">{data.summary.currentRegime}</p>
              </div>
            ) : null}
            {data.summary.recommendedMode ? (
              <div className="rounded-lg border bg-background px-3 py-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Recommended Mode
                </p>
                <p className="mt-1 text-sm font-medium">{data.summary.recommendedMode}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-4 space-y-5">
        {groupedRecommendations.map((group) => (
          <section key={group.layer} className="space-y-3">
            <div className="flex items-end justify-between gap-3 border-b pb-2">
              <div>
                <p className="text-sm font-semibold">{group.title}</p>
                <p className="text-xs text-muted-foreground">{group.description}</p>
              </div>
              <div className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {group.recommendations.length} card{group.recommendations.length > 1 ? "s" : ""}
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {group.recommendations.map((recommendation) => (
                <RecommendationCard
                  key={recommendation.id}
                  recommendation={recommendation}
                  onOpenCampaign={onOpenCampaign}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
