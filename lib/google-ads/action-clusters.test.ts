import { describe, expect, it } from "vitest";
import {
  buildActionClusters,
  executeActionCluster,
  rollbackActionCluster,
} from "@/lib/google-ads/action-clusters";
import type { GoogleRecommendation } from "@/lib/google-ads/growth-advisor-types";

function recommendation(overrides: Partial<GoogleRecommendation> = {}): GoogleRecommendation {
  const id = overrides.id ?? `rec-${Math.random().toString(36).slice(2, 8)}`;
  const fingerprint = overrides.recommendationFingerprint ?? `${id}-fingerprint`;
  return {
    id,
    level: "campaign",
    entityId: overrides.entityId ?? "campaign-1",
    entityName: overrides.entityName ?? "Campaign 1",
    type: overrides.type ?? "query_governance",
    strategyLayer: overrides.strategyLayer ?? "Search Governance",
    decisionState: overrides.decisionState ?? "act",
    decisionFamily: overrides.decisionFamily ?? "waste_control",
    doBucket: overrides.doBucket ?? "do_now",
    priority: overrides.priority ?? "high",
    confidence: overrides.confidence ?? "high",
    dataTrust: overrides.dataTrust ?? "high",
    integrityState: overrides.integrityState ?? "ready",
    supportStrength: overrides.supportStrength ?? "strong",
    actionability: overrides.actionability ?? "ready_now",
    reversibility: overrides.reversibility ?? "high",
    title: overrides.title ?? "Recommendation",
    summary: overrides.summary ?? "Summary",
    why: overrides.why ?? "Why",
    whyNow: overrides.whyNow ?? "Why now",
    reasonCodes: overrides.reasonCodes ?? [],
    confidenceExplanation: overrides.confidenceExplanation ?? "Confident",
    confidenceDegradationReasons: overrides.confidenceDegradationReasons ?? [],
    recommendedAction: overrides.recommendedAction ?? "Do the thing",
    decision:
      overrides.decision ?? {
        decisionFamily: overrides.decisionFamily ?? "waste_control",
        lane: "review",
        riskLevel: "medium",
        blastRadius: "campaign",
        confidence: 0.8,
        windowsUsed: {
          healthWindow: "alarm_7d",
          primaryWindow: "operational_28d",
          queryWindow: "query_governance_56d",
          baselineWindow: "baseline_84d",
          maturityCutoffDays: 84,
        },
        whyNow: overrides.whyNow ?? "Why now",
        whyNot: [],
        blockers: overrides.blockers ?? [],
        validationPlan: overrides.validationChecklist ?? ["Validate outcome"],
        rollbackPlan: ["Rollback the change if efficiency falls."],
        evidenceSummary: "Cluster-level evidence supports the action.",
        evidencePoints: overrides.evidence ?? [],
      },
    decisionNarrative:
      overrides.decisionNarrative ?? {
        whatHappened: overrides.summary ?? "Summary",
        whyItHappened: overrides.why ?? "Why",
        whatToDo: overrides.recommendedAction ?? "Do the thing",
        risk: "Operator review required before any live change.",
        howToValidate: overrides.validationChecklist ?? ["Validate outcome"],
        howToRollBack: "Rollback the change if efficiency falls.",
      },
    potentialContribution:
      overrides.potentialContribution ?? {
        label: "High leverage",
        impact: "high",
        summary: "Meaningful contribution expected.",
      },
    impactBand: overrides.impactBand ?? "high",
    effortScore: overrides.effortScore ?? "low",
    validationChecklist: overrides.validationChecklist ?? ["Validate outcome"],
    blockers: overrides.blockers ?? [],
    rankScore: overrides.rankScore ?? 90,
    rankExplanation: overrides.rankExplanation ?? "High score",
    impactScore: overrides.impactScore ?? 90,
    recommendationFingerprint: fingerprint,
    evidence: overrides.evidence ?? [],
    timeframeContext:
      overrides.timeframeContext ?? {
        coreVerdict: "stable",
        selectedRangeNote: "last 14d",
        historicalSupport: "consistent",
      },
    executionMode: overrides.executionMode ?? "mutate_ready",
    mutateActionType: overrides.mutateActionType ?? "add_negative_keyword",
    mutatePayloadPreview: overrides.mutatePayloadPreview ?? { query: "cheap support term" },
    rollbackActionType: overrides.rollbackActionType ?? "remove_negative_keyword",
    rollbackPayloadPreview: overrides.rollbackPayloadPreview ?? { query: "cheap support term" },
    executionTrustBand: overrides.executionTrustBand ?? "high",
    executionTrustSource: overrides.executionTrustSource ?? "observed_pattern",
    executionPolicyReason: overrides.executionPolicyReason ?? "Observed pattern is stable.",
    dependencyReadiness: overrides.dependencyReadiness ?? "done_trusted",
    batchEligible: overrides.batchEligible ?? true,
    batchGroupKey: overrides.batchGroupKey ?? "cleanup-campaign-1",
    affectedCampaignIds: overrides.affectedCampaignIds ?? ["campaign-1"],
    executionStatus: overrides.executionStatus ?? "not_started",
    ...overrides,
  } as GoogleRecommendation;
}

describe("buildActionClusters", () => {
  it("clusters cleanup and downstream budget recommendations into one move", () => {
    const cleanup = recommendation({
      id: "cleanup-1",
      title: "Add negative keywords",
      type: "query_governance",
      affectedCampaignIds: ["campaign-1"],
      batchGroupKey: "cleanup-campaign-1",
      mutateActionType: "add_negative_keyword",
    });
    const scale = recommendation({
      id: "scale-1",
      title: "Increase budget",
      type: "pmax_scaling_fit",
      decisionFamily: "growth_unlock",
      strategyLayer: "Budget Moves",
      mutateActionType: "adjust_campaign_budget",
      batchEligible: false,
      batchGroupKey: null,
      rollbackActionType: "restore_campaign_budget",
      rollbackPayloadPreview: { campaignBudgetResourceName: "budget-1", previousAmount: 100 },
      mutatePayloadPreview: { campaignBudgetResourceName: "budget-1", proposedAmount: 120 },
      affectedCampaignIds: ["campaign-1"],
      dependsOnRecommendationIds: ["cleanup-1"],
      dependencyReadiness: "done_unverified",
    });

    const clusters = buildActionClusters({ recommendations: [cleanup, scale] });
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.clusterType).toBe("cleanup_then_scale");
    expect(clusters[0]?.memberRecommendationIds).toEqual(["cleanup-1", "scale-1"]);
    expect(clusters[0]?.clusterBucket).toBe("next");
  });

  it("synthesizes a deferred allocator step from a sequential execution candidate", () => {
    const cleanup = recommendation({
      id: "cleanup-seq",
      title: "Cleanup",
      type: "query_governance",
      mutateActionType: "add_negative_keyword",
      batchEligible: true,
      batchGroupKey: "cleanup-seq",
    });
    const allocator = recommendation({
      id: "allocator-seq",
      title: "Increase budget",
      type: "pmax_scaling_fit",
      strategyLayer: "Budget Moves",
      decisionFamily: "growth_unlock",
      executionMode: "handoff",
      mutateActionType: null,
      mutatePayloadPreview: null,
      mutateEligibilityReason: "blocked_by_partial_cleanup",
      sequentialExecutionCandidate: {
        mutateActionType: "adjust_campaign_budget",
        mutatePayloadPreview: { campaignBudgetResourceName: "budget-1", proposedAmount: 120 },
        rollbackActionType: "restore_campaign_budget",
        rollbackPayloadPreview: { campaignBudgetResourceName: "budget-1", previousAmount: 100 },
        executionTrustBand: "high",
        dependencyReadiness: "not_ready",
        stabilizationHoldUntil: null,
        waitReason: "blocked_by_partial_cleanup: allocator step will wait until cleanup completes successfully.",
      },
      batchEligible: false,
      batchGroupKey: null,
      dependsOnRecommendationIds: ["cleanup-seq"],
    });

    const cluster = buildActionClusters({ recommendations: [cleanup, allocator] })[0]!;
    expect(cluster.steps).toHaveLength(2);
    expect(cluster.steps[1]?.executionMode).toBe("mutate_ready");
    expect(cluster.steps[1]?.mutateActionType).toBe("adjust_campaign_budget");
    expect(cluster.steps[1]?.waitReason).toContain("blocked_by_partial_cleanup");
  });

  it("expands a joint allocator recommendation into two ordered allocator steps", () => {
    const allocator = recommendation({
      id: "joint-allocator",
      title: "Scale allocator surface",
      type: "pmax_scaling_fit",
      strategyLayer: "Budget Moves",
      decisionFamily: "growth_unlock",
      executionMode: "mutate_ready",
      mutateActionType: null,
      mutatePayloadPreview: null,
      batchEligible: false,
      batchGroupKey: null,
      jointExecutionSequence: [
        {
          stepKey: "allocator_budget",
          title: "Adjust shared budget",
          mutateActionType: "adjust_shared_budget",
          mutatePayloadPreview: { campaignBudgetResourceName: "budget-1", previousAmount: 100, proposedAmount: 108 },
          rollbackActionType: "restore_shared_budget",
          rollbackPayloadPreview: { campaignBudgetResourceName: "budget-1", previousAmount: 100 },
          executionTrustBand: "high",
          dependencyReadiness: "done_trusted",
          transactionIds: [],
          executionStatus: "not_started",
        },
        {
          stepKey: "allocator_target",
          title: "Adjust portfolio target",
          mutateActionType: "adjust_portfolio_target",
          mutatePayloadPreview: { portfolioBidStrategyResourceName: "bid-1", portfolioTargetType: "tROAS", previousValue: 250, proposedValue: 240 },
          rollbackActionType: "restore_portfolio_target",
          rollbackPayloadPreview: { portfolioBidStrategyResourceName: "bid-1", portfolioTargetType: "tROAS", previousValue: 250 },
          executionTrustBand: "high",
          dependencyReadiness: "done_trusted",
          transactionIds: [],
          executionStatus: "not_started",
        },
      ],
    });

    const cluster = buildActionClusters({ recommendations: [allocator] })[0]!;
    expect(cluster.steps).toHaveLength(2);
    expect(cluster.steps[0]?.mutateActionType).toBe("adjust_shared_budget");
    expect(cluster.steps[0]?.sequenceKey).toBe("allocator_budget");
    expect(cluster.steps[1]?.mutateActionType).toBe("adjust_portfolio_target");
    expect(cluster.steps[1]?.sequenceKey).toBe("allocator_target");
  });

  it("keeps unrelated recommendations in separate clusters", () => {
    const first = recommendation({
      id: "cleanup-1",
      entityId: "campaign-1",
      affectedCampaignIds: ["campaign-1"],
      batchGroupKey: "cleanup-campaign-1",
    });
    const second = recommendation({
      id: "cleanup-2",
      entityId: "campaign-2",
      affectedCampaignIds: ["campaign-2"],
      batchGroupKey: "cleanup-campaign-2",
      recommendationFingerprint: "cleanup-2-fingerprint",
    });

    const clusters = buildActionClusters({ recommendations: [first, second] });
    expect(clusters).toHaveLength(2);
    expect(new Set(clusters.map((cluster) => cluster.clusterId)).size).toBe(2);
  });

  it("downgrades readiness when a child step is blocked or insufficient data", () => {
    const ready = recommendation({ id: "ready-1" });
    const blocked = recommendation({
      id: "blocked-1",
      type: "pmax_scaling_fit",
      mutateActionType: "adjust_campaign_budget",
      batchEligible: false,
      batchGroupKey: null,
      executionTrustBand: "insufficient_data",
      dependencyReadiness: "not_ready",
      affectedCampaignIds: ["campaign-1"],
    });

    const clusters = buildActionClusters({ recommendations: [ready, blocked] });
    expect(clusters[0]?.clusterReadiness).toBe("partially_executable");
    expect(clusters[0]?.clusterTrustBand).toBe("insufficient_data");
  });

  it("marks cleanup-then-scale moves inconclusive until cleanup stabilizes and scale validates", () => {
    const cleanup = recommendation({
      id: "cleanup-1",
      type: "query_governance",
      executionStatus: "applied",
      outcomeVerdict: "improved",
      outcomeConfidence: "high",
    });
    const scale = recommendation({
      id: "scale-1",
      type: "pmax_scaling_fit",
      strategyLayer: "Budget Moves",
      decisionFamily: "growth_unlock",
      mutateActionType: "adjust_campaign_budget",
      batchEligible: false,
      batchGroupKey: null,
      rollbackActionType: "restore_campaign_budget",
      rollbackPayloadPreview: { campaignBudgetResourceName: "budget-1", previousAmount: 100 },
      mutatePayloadPreview: { campaignBudgetResourceName: "budget-1", proposedAmount: 120 },
      affectedCampaignIds: ["campaign-1"],
      dependsOnRecommendationIds: ["cleanup-1"],
      dependencyReadiness: "done_unverified",
      executionStatus: "applied",
      outcomeVerdict: "unknown",
      outcomeConfidence: "low",
    });

    const cluster = buildActionClusters({ recommendations: [cleanup, scale] })[0]!;
    expect(cluster.clusterMoveValidity).toBe("inconclusive");
    expect(cluster.outcomeState.reason).toContain("stabilization");
  });

  it("evaluates pure reallocation on net source and destination outcome", () => {
    const destination = recommendation({
      id: "realloc-1",
      type: "budget_reallocation",
      strategyLayer: "Budget Moves",
      decisionFamily: "growth_unlock",
      batchEligible: false,
      batchGroupKey: null,
      mutateActionType: "adjust_campaign_budget",
      rollbackActionType: "restore_campaign_budget",
      mutatePayloadPreview: { operations: [{ campaignBudgetResourceName: "budget-1", proposedAmount: 140 }] },
      rollbackPayloadPreview: { operations: [{ campaignBudgetResourceName: "budget-1", previousAmount: 100 }] },
      outcomeVerdict: "improved",
      outcomeDelta: -4,
      executionPolicyReason: "Moved capital from weak generic terms into higher-margin winners.",
    });
    const source = recommendation({
      id: "realloc-2",
      recommendationFingerprint: "realloc-2-fingerprint",
      type: "budget_reallocation",
      strategyLayer: "Budget Moves",
      decisionFamily: "growth_unlock",
      batchEligible: false,
      batchGroupKey: null,
      mutateActionType: "adjust_campaign_budget",
      rollbackActionType: "restore_campaign_budget",
      mutatePayloadPreview: { operations: [{ campaignBudgetResourceName: "budget-2", proposedAmount: 60 }] },
      rollbackPayloadPreview: { operations: [{ campaignBudgetResourceName: "budget-2", previousAmount: 100 }] },
      outcomeVerdict: "degraded",
      outcomeDelta: 1,
    });

    const cluster = buildActionClusters({ recommendations: [destination, source] })[0]!;
    expect(cluster.outcomeState.reallocationNetImpact?.netDelta).toBe(-3);
    expect(cluster.clusterMoveValidity).toBe("valid");
  });

  it("degrades cluster confidence when recommendations are shared-state coupled", () => {
    const cleanup = recommendation({
      id: "cleanup-shared",
      type: "query_governance",
      sharedStateGovernanceType: "shared_budget",
      sharedStateAwarenessStatus: "known",
      allocatorCoupled: true,
      allocatorCouplingConfidence: "high",
      sharedBudgetResourceName: "customers/123/campaignBudgets/9",
      portfolioBidStrategyResourceName: "customers/123/biddingStrategies/4",
      portfolioBidStrategyType: "TARGET_ROAS",
      portfolioGovernanceStatus: "mixed_governance",
      portfolioCouplingStrength: "medium",
      portfolioContaminationSource: "mixed_allocator_contamination",
      portfolioContaminationSeverity: "high",
      portfolioCascadeRiskBand: "moderate",
      coupledCampaignIds: ["campaign-1", "campaign-2"],
      coupledCampaignNames: ["Campaign 1", "Campaign 2"],
      sharedStateContaminationFlag: true,
    });
    const scale = recommendation({
      id: "scale-shared",
      type: "pmax_scaling_fit",
      strategyLayer: "Budget Moves",
      decisionFamily: "growth_unlock",
      mutateActionType: "adjust_campaign_budget",
      batchEligible: false,
      batchGroupKey: null,
      sharedStateGovernanceType: "shared_budget",
      sharedStateAwarenessStatus: "known",
      allocatorCoupled: true,
      allocatorCouplingConfidence: "high",
      sharedBudgetResourceName: "customers/123/campaignBudgets/9",
      portfolioBidStrategyResourceName: "customers/123/biddingStrategies/4",
      portfolioBidStrategyType: "TARGET_ROAS",
      portfolioGovernanceStatus: "mixed_governance",
      portfolioCouplingStrength: "medium",
      portfolioContaminationSource: "mixed_allocator_contamination",
      portfolioContaminationSeverity: "high",
      portfolioCascadeRiskBand: "moderate",
      coupledCampaignIds: ["campaign-1", "campaign-2"],
      coupledCampaignNames: ["Campaign 1", "Campaign 2"],
      sharedStateMutateBlockedReason: "shared_budget_blocked: local budget mutate is blocked.",
      sharedStateContaminationFlag: true,
    });

    const cluster = buildActionClusters({ recommendations: [cleanup, scale] })[0]!;
    expect(cluster.sharedStateGovernanceType).toBe("shared_budget");
    expect(cluster.allocatorCoupled).toBe(true);
    expect(cluster.outcomeState.contaminationFlags).toContain("mixed_allocator_contamination");
    expect(cluster.clusterMoveConfidence).toBe("low");
    expect(cluster.clusterMoveValidity).toBe("inconclusive");
  });

  it("keeps dominant portfolio-governed clusters conservative", () => {
    const cleanup = recommendation({
      id: "cleanup-portfolio",
      type: "query_governance",
      sharedStateGovernanceType: "portfolio_bid_strategy",
      sharedStateAwarenessStatus: "known",
      portfolioBidStrategyResourceName: "customers/123/biddingStrategies/4",
      portfolioBidStrategyType: "TARGET_ROAS",
      portfolioBidStrategyStatus: "stable",
      portfolioGovernanceStatus: "dominant",
      portfolioCouplingStrength: "high",
      portfolioContaminationSource: "portfolio_strategy_contamination",
      portfolioContaminationSeverity: "high",
      portfolioCascadeRiskBand: "broad",
      portfolioAttributionWindowDays: 21,
      sharedStateContaminationFlag: true,
      executionStatus: "applied",
      outcomeVerdict: "neutral",
    });

    const cluster = buildActionClusters({ recommendations: [cleanup] })[0]!;
    expect(cluster.portfolioGovernanceStatus).toBe("dominant");
    expect(cluster.portfolioContaminationSource).toBe("portfolio_strategy_contamination");
    expect(cluster.clusterMoveConfidence).toBe("low");
    expect(cluster.clusterMoveValidity).toBe("inconclusive");
  });

  it("treats portfolio-target mutate as a critical unlock gate", () => {
    const portfolioTarget = recommendation({
      id: "portfolio-target-1",
      type: "pmax_scaling_fit",
      strategyLayer: "Budget Moves",
      decisionFamily: "growth_unlock",
      mutateActionType: "adjust_portfolio_target",
      rollbackActionType: "restore_portfolio_target",
      mutatePayloadPreview: {
        portfolioBidStrategyResourceName: "customers/123/biddingStrategies/4",
        portfolioTargetType: "tROAS",
        previousValue: 300,
        proposedValue: 270,
      },
      rollbackPayloadPreview: {
        portfolioBidStrategyResourceName: "customers/123/biddingStrategies/4",
        portfolioTargetType: "tROAS",
        previousValue: 300,
      },
      portfolioBidStrategyResourceName: "customers/123/biddingStrategies/4",
      portfolioBidStrategyType: "TARGET_ROAS",
      portfolioBidStrategyStatus: "stable",
      portfolioGovernanceStatus: "present",
      portfolioCouplingStrength: "low",
      portfolioCascadeRiskBand: "contained",
      portfolioAttributionWindowDays: 21,
    });

    const cluster = buildActionClusters({ recommendations: [portfolioTarget] })[0]!;
    expect(cluster.steps[0]?.stepCriticality).toBe("critical");
    expect(cluster.steps[0]?.stepValidationRole).toBe("unlock_gate");
  });

  it("keeps early portfolio-target outcomes conservative until the attribution window matures", () => {
    const portfolioTarget = recommendation({
      id: "portfolio-target-2",
      type: "pmax_scaling_fit",
      strategyLayer: "Budget Moves",
      decisionFamily: "growth_unlock",
      mutateActionType: "adjust_portfolio_target",
      rollbackActionType: "restore_portfolio_target",
      mutatePayloadPreview: {
        portfolioBidStrategyResourceName: "customers/123/biddingStrategies/4",
        portfolioTargetType: "tROAS",
        previousValue: 300,
        proposedValue: 270,
      },
      rollbackPayloadPreview: {
        portfolioBidStrategyResourceName: "customers/123/biddingStrategies/4",
        portfolioTargetType: "tROAS",
        previousValue: 300,
      },
      executionStatus: "applied",
      executedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      outcomeVerdict: "improved",
      outcomeDelta: -4,
      portfolioBidStrategyResourceName: "customers/123/biddingStrategies/4",
      portfolioBidStrategyType: "TARGET_ROAS",
      portfolioBidStrategyStatus: "stable",
      portfolioGovernanceStatus: "present",
      portfolioCouplingStrength: "low",
      portfolioContaminationSource: "portfolio_strategy_contamination",
      portfolioContaminationSeverity: "medium",
      portfolioCascadeRiskBand: "contained",
      portfolioAttributionWindowDays: 21,
      sharedStateContaminationFlag: true,
    });

    const cluster = buildActionClusters({ recommendations: [portfolioTarget] })[0]!;
    expect(cluster.outcomeState.verdict).toBe("stabilizing");
    expect(cluster.clusterMoveValidity).toBe("inconclusive");
    expect(cluster.outcomeState.reason).toContain("early attribution window");
  });
});

describe("cluster execution orchestration", () => {
  it("executes steps in deterministic order and stops on the first failed required step", async () => {
    const cleanup = recommendation({
      id: "cleanup-1",
      title: "Cleanup",
      type: "query_governance",
      mutateActionType: "add_negative_keyword",
      batchEligible: true,
      batchGroupKey: "cleanup-campaign-1",
    });
    const assetPause = recommendation({
      id: "asset-1",
      title: "Pause weak asset",
      type: "creative_asset_deployment",
      strategyLayer: "Assets & Testing",
      mutateActionType: "pause_asset",
      rollbackActionType: "enable_asset",
      rollbackPayloadPreview: { resourceNames: ["asset-1"] },
      batchGroupKey: "asset-campaign-1",
    });
    const budget = recommendation({
      id: "budget-1",
      title: "Reallocate budget",
      type: "budget_reallocation",
      strategyLayer: "Budget Moves",
      decisionFamily: "growth_unlock",
      mutateActionType: "adjust_campaign_budget",
      batchEligible: false,
      batchGroupKey: null,
      rollbackActionType: "restore_campaign_budget",
      rollbackPayloadPreview: { operations: [{ campaignBudgetResourceName: "budget-1", previousAmount: 100 }] },
      mutatePayloadPreview: { operations: [{ campaignBudgetResourceName: "budget-1", proposedAmount: 120 }] },
    });

    const cluster = buildActionClusters({ recommendations: [cleanup, assetPause, budget] })[0]!;
    const appliedSteps: string[] = [];
    let callCount = 0;
    const execution = await executeActionCluster({
      cluster,
      clusterExecutionId: "cluster-exec-1",
      applyBatchStep: async (step) => {
        callCount += 1;
        appliedSteps.push(step.stepId);
        if (callCount === 2) {
          return { transactionId: "tx-asset", ok: false };
        }
        return { transactionId: `tx-${step.stepId}`, ok: true };
      },
      applyMutateStep: async (step) => {
        callCount += 1;
        appliedSteps.push(step.stepId);
        if (callCount === 2) {
          return { transactionId: `tx-${step.stepId}`, ok: false };
        }
        return { transactionId: `tx-${step.stepId}`, ok: true };
      },
    });

    expect(execution.clusterExecutionId).toBe("cluster-exec-1");
    expect(appliedSteps).toEqual(cluster.steps.slice(0, 2).map((step) => step.stepId));
    expect(execution.clusterExecutionStatus).toBe("partially_applied");
    expect(execution.completedChildStepIds).toEqual([cluster.steps[0]!.stepId]);
    expect(execution.failedChildStepIds).toEqual([cluster.steps[1]!.stepId]);
  });

  it("stops after cleanup and enters stabilizing when the next allocator step is still waiting", async () => {
    const cleanup = recommendation({
      id: "cleanup-hold",
      title: "Cleanup",
      type: "query_governance",
      mutateActionType: "add_negative_keyword",
      batchEligible: true,
      batchGroupKey: "cleanup-hold",
    });
    const allocator = recommendation({
      id: "allocator-hold",
      title: "Increase budget",
      type: "pmax_scaling_fit",
      strategyLayer: "Budget Moves",
      decisionFamily: "growth_unlock",
      executionMode: "handoff",
      mutateActionType: null,
      mutatePayloadPreview: null,
      sequentialExecutionCandidate: {
        mutateActionType: "adjust_campaign_budget",
        mutatePayloadPreview: { campaignBudgetResourceName: "budget-1", proposedAmount: 120 },
        rollbackActionType: "restore_campaign_budget",
        rollbackPayloadPreview: { campaignBudgetResourceName: "budget-1", previousAmount: 100 },
        executionTrustBand: "high",
        dependencyReadiness: "done_unverified",
        stabilizationHoldUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        waitReason: "blocked_by_stabilization_hold: allocator step remains paused.",
      },
      batchEligible: false,
      batchGroupKey: null,
      dependsOnRecommendationIds: ["cleanup-hold"],
    });

    const cluster = buildActionClusters({ recommendations: [cleanup, allocator] })[0]!;
    const execution = await executeActionCluster({
      cluster,
      clusterExecutionId: "cluster-exec-hold",
      applyBatchStep: async (step) => ({ transactionId: `tx-${step.stepId}`, ok: true }),
      applyMutateStep: async (step) => ({ transactionId: `tx-${step.stepId}`, ok: true }),
    });

    expect(execution.clusterExecutionStatus).toBe("stabilizing");
    expect(execution.completedChildStepIds).toEqual([cluster.steps[0]!.stepId]);
    expect(execution.waitingChildStepId).toBe(cluster.steps[1]!.stepId);
    expect(execution.stopReason).toContain("blocked_by_stabilization_hold");
  });

  it("rolls back joint allocator child transactions in reverse order", async () => {
    const cluster = buildActionClusters({
      recommendations: [
        recommendation({
          id: "joint-rollback",
          type: "pmax_scaling_fit",
          strategyLayer: "Budget Moves",
          decisionFamily: "growth_unlock",
          executionMode: "mutate_ready",
          mutateActionType: null,
          mutatePayloadPreview: null,
          batchEligible: false,
          batchGroupKey: null,
          jointExecutionSequence: [
            {
              stepKey: "allocator_budget",
              title: "Adjust shared budget",
              mutateActionType: "adjust_shared_budget",
              mutatePayloadPreview: { campaignBudgetResourceName: "budget-1", previousAmount: 100, proposedAmount: 108 },
              rollbackActionType: "restore_shared_budget",
              rollbackPayloadPreview: { campaignBudgetResourceName: "budget-1", previousAmount: 100 },
              executionTrustBand: "high",
              dependencyReadiness: "done_trusted",
              transactionIds: ["tx-budget"],
              executionStatus: "applied",
            },
            {
              stepKey: "allocator_target",
              title: "Adjust portfolio target",
              mutateActionType: "adjust_portfolio_target",
              mutatePayloadPreview: { portfolioBidStrategyResourceName: "bid-1", portfolioTargetType: "tROAS", previousValue: 250, proposedValue: 240 },
              rollbackActionType: "restore_portfolio_target",
              rollbackPayloadPreview: { portfolioBidStrategyResourceName: "bid-1", portfolioTargetType: "tROAS", previousValue: 250 },
              executionTrustBand: "high",
              dependencyReadiness: "done_trusted",
              transactionIds: ["tx-target"],
              executionStatus: "applied",
            },
          ],
        }),
      ],
    })[0]!;
    const rollbackOrder: string[] = [];
    const rollback = await rollbackActionCluster({
      cluster,
      rollbackBatchStep: async () => ({ ok: true }),
      rollbackMutateStep: async (step) => {
        rollbackOrder.push(step.sequenceKey ?? step.stepId);
        return { ok: true };
      },
    });

    expect(rollback.clusterExecutionStatus).toBe("rolled_back");
    expect(rollbackOrder).toEqual(["allocator_target", "allocator_budget"]);
  });

  it("rolls back completed child transactions in reverse order", async () => {
    const cleanup = recommendation({ id: "cleanup-1" });
    const budget = recommendation({
      id: "budget-1",
      type: "budget_reallocation",
      strategyLayer: "Budget Moves",
      decisionFamily: "growth_unlock",
      mutateActionType: "adjust_campaign_budget",
      batchEligible: false,
      batchGroupKey: null,
      rollbackActionType: "restore_campaign_budget",
      rollbackPayloadPreview: { operations: [{ campaignBudgetResourceName: "budget-1", previousAmount: 100 }] },
      mutatePayloadPreview: { operations: [{ campaignBudgetResourceName: "budget-1", proposedAmount: 120 }] },
      transactionId: "tx-budget",
    });
    const cluster = buildActionClusters({
      recommendations: [
        { ...cleanup, transactionId: "tx-cleanup" },
        budget,
      ],
    })[0]!;
    const rolledBack: string[] = [];

    const rollback = await rollbackActionCluster({
      cluster,
      rollbackBatchStep: async (step) => {
        rolledBack.push(step.stepId);
        return { ok: true };
      },
      rollbackMutateStep: async (step) => {
        rolledBack.push(step.stepId);
        return { ok: true };
      },
    });

    expect(rollback.clusterExecutionStatus).toBe("rolled_back");
    expect(rolledBack).toEqual([...cluster.steps].reverse().map((step) => step.stepId));
  });

  it("classifies partial rollback as recoverable retry when failure is transient", async () => {
    const cleanup = recommendation({ id: "cleanup-1", transactionId: "tx-cleanup" });
    const budget = recommendation({
      id: "budget-1",
      type: "budget_reallocation",
      strategyLayer: "Budget Moves",
      decisionFamily: "growth_unlock",
      mutateActionType: "adjust_campaign_budget",
      batchEligible: false,
      batchGroupKey: null,
      rollbackActionType: "restore_campaign_budget",
      rollbackPayloadPreview: { operations: [{ campaignBudgetResourceName: "budget-1", previousAmount: 100 }] },
      mutatePayloadPreview: { operations: [{ campaignBudgetResourceName: "budget-1", proposedAmount: 120 }] },
      transactionId: "tx-budget",
    });
    const cluster = buildActionClusters({ recommendations: [cleanup, budget] })[0]!;

    const rollback = await rollbackActionCluster({
      cluster,
      rollbackBatchStep: async () => ({ ok: false, errorMessage: "API timeout during rollback.", retryable: true }),
      rollbackMutateStep: async () => ({ ok: true }),
    });

    expect(rollback.clusterExecutionStatus).toBe("partially_rolled_back");
    expect(rollback.retryEligibleFailedChildStepIds.length).toBeGreaterThan(0);
    expect(rollback.manualRecoveryInstructions[0]).toContain("timeout");
  });
});
