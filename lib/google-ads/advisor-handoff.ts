import type {
  AssetPerformanceRow,
  CampaignPerformanceRow,
  ProductPerformanceRow,
  SearchTermPerformanceRow,
} from "@/lib/google-ads/intelligence-model";
import type { GoogleRecommendation } from "@/lib/google-ads/growth-advisor-types";

function advisorBucketWeight(bucket: "do_now" | "do_next" | "do_later") {
  return bucket === "do_now" ? 0 : bucket === "do_next" ? 1 : 2;
}

function memoryStatusWeight(status?: string | null) {
  return status === "escalated" ? 2 : status === "new" ? 1 : 0;
}

export function buildGoogleAdsCampaignDeepLink(accountId: string, campaignId: string) {
  const ocid = accountId.replace(/-/g, "");
  return `https://ads.google.com/aw/campaigns?ocid=${encodeURIComponent(ocid)}&campaignId=${encodeURIComponent(campaignId)}`;
}

function groupedHandoffPlan(recommendation: GoogleRecommendation) {
  switch (recommendation.type) {
    case "brand_leakage":
      return {
        orderedHandoffSteps: [
          "Audit the growth lane collecting branded demand first.",
          "Apply brand negatives or exclusions in the leaking non-brand or PMax lane.",
          "Re-check branded query capture before scaling the growth lane again.",
        ],
        coreStepIds: ["audit_leakage_lane", "apply_brand_controls"],
        estimatedOperatorMinutes: 8,
      };
    case "search_shopping_overlap":
      return {
        orderedHandoffSteps: [
          "Review the overlapping Search and Shopping entities for the same SKU demand.",
          "Choose the primary owning lane for the SKU-specific traffic.",
          "Reduce duplicate capture in the secondary lane, then validate post-change efficiency.",
        ],
        coreStepIds: ["review_overlap", "choose_lane_owner"],
        estimatedOperatorMinutes: 12,
      };
    case "orphaned_non_brand_demand":
      return {
        orderedHandoffSteps: [
          "Build owned exact coverage for the most proven non-brand queries.",
          "Add adjacent phrase control around the recurring winners.",
          "Re-check whether PMax or mixed lanes still absorb the same demand after ownership is added.",
        ],
        coreStepIds: ["build_exact_coverage", "add_phrase_control"],
        estimatedOperatorMinutes: 10,
      };
    default:
      return {
        orderedHandoffSteps: [],
        coreStepIds: [],
        estimatedOperatorMinutes: null,
      };
  }
}

export function decorateAdvisorRecommendationsForExecution(input: {
  recommendations: GoogleRecommendation[];
  accountId?: string | null;
  selectedCampaigns?: Array<CampaignPerformanceRow & Record<string, unknown>>;
  selectedSearchTerms?: Array<SearchTermPerformanceRow & Record<string, unknown>>;
  selectedProducts?: Array<ProductPerformanceRow & Record<string, unknown>>;
  selectedAssets?: Array<AssetPerformanceRow & Record<string, unknown>>;
  executionCalibration?: {
    patterns?: Record<
      string,
      {
        success?: number;
        rollback?: number;
        degraded?: number;
        failure?: number;
        lastTrustBand?: string | null;
      }
    >;
  } | null;
}) {
  const normalize = (value: string | null | undefined) =>
    String(value ?? "")
      .toLowerCase()
      .trim();
  const stabilizationHoldMs = 48 * 60 * 60 * 1000;

  const dominantIntentClass = (rows: Array<SearchTermPerformanceRow & Record<string, unknown>>) => {
    const counts = rows.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.intentClass ?? "unknown");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
  };

  const dependencyState = (recommendation: GoogleRecommendation) => {
    const dependencies = (recommendation.dependsOnRecommendationIds ?? [])
      .map((dependencyId) => input.recommendations.find((entry) => entry.id === dependencyId))
      .filter((entry): entry is GoogleRecommendation => Boolean(entry));
    if (dependencies.length === 0) {
      return {
        readiness: "done_trusted" as const,
        holdUntil: null as string | null,
      };
    }
    let readiness: "not_ready" | "done_unverified" | "done_trusted" | "done_degraded" = "done_trusted";
    let holdUntil: string | null = null;
    const now = Date.now();
    for (const dependency of dependencies) {
      const skippedCore = (dependency.skippedStepIds ?? []).some((stepId) =>
        (dependency.coreStepIds ?? []).includes(stepId)
      );
      if (skippedCore || dependency.completionMode === "partial") {
        return { readiness: "done_degraded" as const, holdUntil: null };
      }
      if (dependency.completionMode !== "full" && dependency.executionStatus !== "applied") {
        return { readiness: "not_ready" as const, holdUntil: null };
      }
      if (dependency.outcomeVerdict === "degraded") {
        return { readiness: "done_degraded" as const, holdUntil: null };
      }
      const completedAt = dependency.executedAt ?? dependency.appliedAt ?? null;
      if (completedAt) {
        const completedTs = new Date(completedAt).getTime();
        if (Number.isFinite(completedTs) && now - completedTs < stabilizationHoldMs) {
          readiness = "done_unverified";
          const nextHold = new Date(completedTs + stabilizationHoldMs).toISOString();
          if (!holdUntil) {
            holdUntil = nextHold;
          } else if (Date.parse(nextHold) > Date.parse(holdUntil)) {
            holdUntil = nextHold;
          }
        }
      } else {
        readiness = "done_unverified";
      }
    }
    return { readiness, holdUntil };
  };

  const executionPolicy = (inputPolicy: {
    mutateActionType: string;
    recommendationType: GoogleRecommendation["type"];
    dominantIntent: string;
    overlapSeverity?: string | null;
    commerceState?: string | null;
    dependencyReadiness?: string | null;
  }) => {
    const policyPatternKey = [
      inputPolicy.mutateActionType,
      inputPolicy.recommendationType,
      inputPolicy.dominantIntent || "unknown",
      inputPolicy.overlapSeverity || "none",
      inputPolicy.commerceState || "none",
      inputPolicy.dependencyReadiness || "none",
    ].join("|");
    const stats = input.executionCalibration?.patterns?.[policyPatternKey];
    const success = Number(stats?.success ?? 0);
    const rollback = Number(stats?.rollback ?? 0);
    const degraded = Number(stats?.degraded ?? 0);
    const failure = Number(stats?.failure ?? 0);
    const score = Math.max(
      0,
      Math.min(100, 60 + success * 8 - rollback * 18 - failure * 16 - degraded * 10)
    );
    const band = score >= 75 ? "high" : score >= 45 ? "medium" : "low";
    const reason =
      rollback > 0
        ? "Prior rollback activity lowered execution trust for this action pattern."
        : failure > 0
          ? "Prior execution failures lowered execution trust for this action pattern."
          : degraded > 0
            ? "Prior degraded outcomes lowered execution trust for this action pattern."
            : success > 0
              ? "Prior successful executions improved trust for this action pattern."
              : "No strong execution history exists yet, so this pattern stays on default trust.";
    return { policyPatternKey, score, band, reason };
  };

  const buildMutateFields = (recommendation: GoogleRecommendation) => {
    const dependency = dependencyState(recommendation);
    const dependenciesReady = dependency.readiness === "done_trusted";
    if (
      !input.accountId ||
      recommendation.integrityState === "blocked" ||
      recommendation.integrityState === "suppressed" ||
      recommendation.dataTrust === "low" ||
      (recommendation.conflictsWithRecommendationIds?.length ?? 0) > 0 ||
      recommendation.currentStatus === "suppressed" ||
      (recommendation.type === "pmax_scaling_fit" || recommendation.type === "geo_device_adjustment"
        ? dependency.readiness === "not_ready" ||
          dependency.readiness === "done_degraded" ||
          dependency.readiness === "done_unverified"
        : !dependenciesReady)
    ) {
      return {
        executionMode: "handoff" as const,
        mutateActionType: null,
        mutatePayloadPreview: null,
        mutateEligibilityReason:
          !input.accountId
            ? "A single Google Ads account must be selected before native execution is allowed."
            : recommendation.integrityState === "blocked" || recommendation.integrityState === "suppressed"
              ? "This recommendation is blocked by the deterministic integrity layer."
              : recommendation.dataTrust === "low"
                ? "Data trust is too low for native execution."
                : (recommendation.conflictsWithRecommendationIds?.length ?? 0) > 0
                  ? "This recommendation still conflicts with another active recommendation."
                  : recommendation.currentStatus === "suppressed"
                    ? "Suppressed recommendations are not eligible for native execution."
                    : (recommendation.type === "pmax_scaling_fit" || recommendation.type === "geo_device_adjustment") &&
                        dependency.readiness !== "done_trusted"
                      ? dependency.readiness === "done_unverified"
                        ? `A prerequisite cleanup was completed recently and remains in stabilization until ${dependency.holdUntil?.slice(0, 10) ?? "later"}.`
                        : "A prerequisite cleanup or grouped workflow is still incomplete, so native execution remains unavailable."
                      : !dependenciesReady
                      ? "A prerequisite cleanup or grouped workflow is still incomplete, so native execution remains unavailable."
                    : "This recommendation is not eligible for native execution yet.",
        canRollback: false,
        rollbackActionType: null,
        rollbackPayloadPreview: null,
        budgetAdjustmentPreview: null,
        executionTrustScore: null,
        executionTrustBand: null,
        executionPolicyReason: null,
        dependencyReadiness: dependency.readiness,
        stabilizationHoldUntil: dependency.holdUntil,
        batchEligible: false,
        batchGroupKey: null,
      };
    }

    if (
      recommendation.executionStatus === "failed" ||
      recommendation.executionStatus === "rolled_back"
    ) {
      return {
        executionMode: "handoff" as const,
        mutateActionType: null,
        mutatePayloadPreview: null,
        mutateEligibilityReason:
          recommendation.executionStatus === "rolled_back"
            ? "This recommendation was previously rolled back, so native execution now requires manual review."
            : "This recommendation previously failed during native execution, so manual review is required before retrying.",
        canRollback: false,
        rollbackActionType: null,
        rollbackPayloadPreview: null,
        budgetAdjustmentPreview: null,
        executionTrustScore: null,
        executionTrustBand: null,
        executionPolicyReason: null,
        dependencyReadiness: dependency.readiness,
        stabilizationHoldUntil: dependency.holdUntil,
        batchEligible: false,
        batchGroupKey: null,
      };
    }

    if (recommendation.type === "query_governance" && (recommendation.negativeQueries?.length ?? 0) > 0) {
      const matchingRows = (input.selectedSearchTerms ?? []).filter((row) =>
        (recommendation.negativeQueries ?? []).some((query) => normalize(query) === normalize(row.searchTerm))
      );
      const intentCounts = matchingRows.reduce<Record<string, number>>((acc, row) => {
        const key = String(row.intentClass ?? "unknown");
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});
      const riskyIntentCount =
        (intentCounts.product_specific ?? 0) +
        (intentCounts.category_high_intent ?? 0) +
        (intentCounts.brand_mixed ?? 0);
      const cleanupIntentCount =
        (intentCounts.support_or_post_purchase ?? 0) +
        (intentCounts.research_low_intent ?? 0) +
        matchingRows.filter((row) => row.ownershipClass === "weak_commercial").length;
      const dominantCleanup =
        matchingRows.length > 0 && cleanupIntentCount / matchingRows.length >= 0.6;
      if (riskyIntentCount > 0) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason:
            "Negative-keyword mutate is blocked because the target query set still includes product-specific, high-intent, or brand-mixed demand.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
        };
      }
      if (!dominantCleanup) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason:
            "Negative-keyword mutate is held back because the target query set is too semantically mixed for safe automatic cleanup.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
        };
      }
      const campaignIds = Array.from(
        new Set(matchingRows.map((row) => String(row.campaignId ?? "")).filter(Boolean))
      );
      const policy = executionPolicy({
        mutateActionType: "add_negative_keyword",
        recommendationType: recommendation.type,
        dominantIntent: dominantIntentClass(matchingRows),
        overlapSeverity: recommendation.overlapSeverity ?? null,
        commerceState: recommendation.commerceSignals?.stockState ?? null,
        dependencyReadiness: dependency.readiness,
      });
      if (policy.band === "low") {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason: "Execution policy trust for this cleanup pattern is currently too low for native mutate.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
          executionTrustScore: policy.score,
          executionTrustBand: policy.band,
          executionPolicyReason: policy.reason,
          dependencyReadiness: dependency.readiness,
          stabilizationHoldUntil: dependency.holdUntil,
          batchEligible: false,
          batchGroupKey: null,
        };
      }
      if (campaignIds.length === 1) {
        return {
          executionMode: "mutate_ready" as const,
          mutateActionType: "add_negative_keyword" as const,
          mutatePayloadPreview: {
            accountId: input.accountId,
            campaignId: campaignIds[0],
            negativeKeywords: (recommendation.negativeQueries ?? []).slice(0, 10),
            matchType: "EXACT",
            policyPatternKey: policy.policyPatternKey,
            executionTrustBand: policy.band,
          },
          mutateEligibilityReason: null,
          canRollback: true,
          rollbackActionType: "remove_negative_keyword" as const,
          rollbackPayloadPreview: {
            resourceNames: [],
          },
          budgetAdjustmentPreview: null,
          executionTrustScore: policy.score,
          executionTrustBand: policy.band,
          executionPolicyReason: policy.reason,
          dependencyReadiness: dependency.readiness,
          stabilizationHoldUntil: dependency.holdUntil,
          batchEligible: true,
          batchGroupKey: `add_negative_keyword|${recommendation.type}|${policy.policyPatternKey}`,
        };
      }
    }

    if (recommendation.type === "creative_asset_deployment" && (recommendation.replaceAssets?.length ?? 0) > 0) {
      const matchingAssets = (input.selectedAssets ?? []).filter((row) =>
        (recommendation.replaceAssets ?? []).some((asset) => normalize(asset) === normalize(row.assetName ?? row.assetText))
      );
      if (matchingAssets.length === 1) {
        const asset = matchingAssets[0] as AssetPerformanceRow & Record<string, unknown>;
        const fieldType = String(asset.fieldType ?? "");
        if (asset.assetId && asset.assetGroupId && fieldType) {
          const policy = executionPolicy({
            mutateActionType: "pause_asset",
            recommendationType: recommendation.type,
            dominantIntent: "asset_cleanup",
            overlapSeverity: recommendation.overlapSeverity ?? null,
            commerceState: recommendation.commerceSignals?.stockState ?? null,
            dependencyReadiness: dependency.readiness,
          });
          if (policy.band === "low") {
            return {
              executionMode: "handoff" as const,
              mutateActionType: null,
              mutatePayloadPreview: null,
              mutateEligibilityReason: "Execution policy trust for this asset action is currently too low for native mutate.",
              canRollback: false,
              rollbackActionType: null,
              rollbackPayloadPreview: null,
              budgetAdjustmentPreview: null,
              executionTrustScore: policy.score,
              executionTrustBand: policy.band,
              executionPolicyReason: policy.reason,
              dependencyReadiness: dependency.readiness,
              stabilizationHoldUntil: dependency.holdUntil,
              batchEligible: false,
              batchGroupKey: null,
            };
          }
          const resourceName = `customers/${String(input.accountId).replace(/\D/g, "")}/assetGroupAssets/${asset.assetGroupId}~${asset.assetId}~${fieldType}`;
          return {
            executionMode: "mutate_ready" as const,
            mutateActionType: "pause_asset" as const,
            mutatePayloadPreview: {
              accountId: input.accountId,
              assetId: asset.assetId,
              assetGroupId: asset.assetGroupId,
              fieldType,
              assetName: asset.assetName ?? asset.assetText ?? "Asset",
              policyPatternKey: policy.policyPatternKey,
              executionTrustBand: policy.band,
            },
            mutateEligibilityReason: null,
            canRollback: true,
            rollbackActionType: "enable_asset" as const,
            rollbackPayloadPreview: {
              resourceName,
            },
            budgetAdjustmentPreview: null,
            executionTrustScore: policy.score,
            executionTrustBand: policy.band,
            executionPolicyReason: policy.reason,
            dependencyReadiness: dependency.readiness,
            stabilizationHoldUntil: dependency.holdUntil,
            batchEligible: false,
            batchGroupKey: null,
          };
        }
      }
    }

    if (recommendation.type === "pmax_scaling_fit") {
      const sharedBudgetBlocked = (input.selectedCampaigns ?? []).some((campaign) => {
        const channel = String(campaign.channel ?? "").toUpperCase();
        return channel === "PERFORMANCE_MAX" && campaign.budgetExplicitlyShared === true;
      });
      if (sharedBudgetBlocked) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason: "shared_budget_blocked: shared campaign budgets are out of scope for native budget mutate.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
        };
      }
      const pmaxCandidates = (input.selectedCampaigns ?? []).filter((campaign) => {
        const channel = String(campaign.channel ?? "").toUpperCase();
        return (
          channel === "PERFORMANCE_MAX" &&
          campaign.scaleState === "scale" &&
          Number(campaign.dailyBudget ?? 0) > 0 &&
          campaign.budgetExplicitlyShared !== true &&
          Boolean(campaign.campaignBudgetResourceName)
        );
      });
      if (pmaxCandidates.length !== 1) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason:
            pmaxCandidates.length > 1
              ? "Budget mutate stays manual until exactly one mutate-safe PMax campaign is in scope."
              : "This recommendation does not currently resolve to one mutate-safe PMax campaign budget.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
        };
      }
      const target = pmaxCandidates[0];
      const campaignTerms = (input.selectedSearchTerms ?? []).filter(
        (row) => String(row.campaignId ?? "") === String(target.campaignId)
      );
      const intentNeedsReview = campaignTerms.some((row) => Boolean(row.intentNeedsReview));
      if (intentNeedsReview) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason: "intent_uncertain: dominant demand in this campaign still needs manual intent review.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
        };
      }
      const intentCounts = campaignTerms.reduce<Record<string, number>>((acc, row) => {
        const key = String(row.intentClass ?? "unknown");
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});
      const safeIncreaseSignals =
        (intentCounts.product_specific ?? 0) +
        (intentCounts.category_high_intent ?? 0) +
        (intentCounts.brand_core ?? 0);
      const weakIncreaseSignals =
        (intentCounts.price_sensitive ?? 0) +
        (intentCounts.research_low_intent ?? 0) +
        (intentCounts.support_or_post_purchase ?? 0) +
        (intentCounts.brand_mixed ?? 0);
      const dominantSafeIncrease =
        campaignTerms.length > 0 && safeIncreaseSignals >= weakIncreaseSignals && safeIncreaseSignals > 0;
      const dominantWeakDemand =
        campaignTerms.length > 0 && weakIncreaseSignals > safeIncreaseSignals;
      const outOfStockBlocked =
        recommendation.commerceSignals?.stockState === "out_of_stock" &&
        recommendation.commerceConfidence === "high";
      const bleedTerms = campaignTerms.filter(
        (row) => Number(row.spend ?? 0) >= 50 && Number(row.conversions ?? 0) <= 0
      );
      const persistentDegraded = recommendation.outcomeVerdict === "degraded";
      const financialBleedOverride = outOfStockBlocked || bleedTerms.length > 0 || persistentDegraded;
      const currentBudget = Number(target.dailyBudget ?? 0);
      const policy = executionPolicy({
        mutateActionType: "adjust_campaign_budget",
        recommendationType: recommendation.type,
        dominantIntent: dominantIntentClass(campaignTerms),
        overlapSeverity: recommendation.overlapSeverity ?? null,
        commerceState: recommendation.commerceSignals?.stockState ?? null,
        dependencyReadiness: dependency.readiness,
      });
      if (!Number.isFinite(currentBudget) || currentBudget <= 0) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason: "This campaign does not expose a mutate-safe current budget amount.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
          executionTrustScore: policy.score,
          executionTrustBand: policy.band,
          executionPolicyReason: policy.reason,
          dependencyReadiness: dependency.readiness,
          stabilizationHoldUntil: dependency.holdUntil,
          batchEligible: false,
          batchGroupKey: null,
        };
      }
      if (policy.band === "low" && !financialBleedOverride) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason: "Execution policy trust for this budget pattern is currently too low for native mutate.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
          executionTrustScore: policy.score,
          executionTrustBand: policy.band,
          executionPolicyReason: policy.reason,
          dependencyReadiness: dependency.readiness,
          stabilizationHoldUntil: dependency.holdUntil,
          batchEligible: false,
          batchGroupKey: null,
        };
      }
      if (!financialBleedOverride && recommendation.overlapSeverity === "critical") {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason: "critical_overlap_blocked: critical overlap must be resolved before a native budget increase is allowed.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
          executionTrustScore: policy.score,
          executionTrustBand: policy.band,
          executionPolicyReason: policy.reason,
          dependencyReadiness: dependency.readiness,
          stabilizationHoldUntil: dependency.holdUntil,
          batchEligible: false,
          batchGroupKey: null,
        };
      }
      if (!financialBleedOverride && !dominantSafeIncrease) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason:
            dominantWeakDemand
              ? "intent_uncertain: weak, research-led, or price-sensitive demand dominates this campaign, so budget increase stays manual."
              : "This campaign does not yet show a strong enough high-intent demand mix for native budget increase.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
          executionTrustScore: policy.score,
          executionTrustBand: policy.band,
          executionPolicyReason: policy.reason,
          dependencyReadiness: dependency.readiness,
          stabilizationHoldUntil: dependency.holdUntil,
          batchEligible: false,
          batchGroupKey: null,
        };
      }
      if (
        recommendation.commerceSignals?.stockState === "out_of_stock" &&
        recommendation.commerceConfidence === "high" &&
        !financialBleedOverride
      ) {
        return {
          executionMode: "handoff" as const,
          mutateActionType: null,
          mutatePayloadPreview: null,
          mutateEligibilityReason: "commerce_blocked: high-confidence out-of-stock pressure blocks native budget increase.",
          canRollback: false,
          rollbackActionType: null,
          rollbackPayloadPreview: null,
          budgetAdjustmentPreview: null,
          executionTrustScore: policy.score,
          executionTrustBand: policy.band,
          executionPolicyReason: policy.reason,
          dependencyReadiness: dependency.readiness,
          stabilizationHoldUntil: dependency.holdUntil,
          batchEligible: false,
          batchGroupKey: null,
        };
      }

      const deltaPercent = financialBleedOverride
        ? policy.band === "high"
          ? -15
          : -10
        : policy.band === "high"
          ? 15
          : 10;
      const proposedAmount = Number((currentBudget * (1 + deltaPercent / 100)).toFixed(2));
      return {
        executionMode: "mutate_ready" as const,
        mutateActionType: "adjust_campaign_budget" as const,
        mutatePayloadPreview: {
          accountId: input.accountId,
          campaignId: target.campaignId,
          campaignBudgetResourceName: target.campaignBudgetResourceName,
          previousAmount: currentBudget,
          proposedAmount,
          deltaPercent,
          policyPatternKey: policy.policyPatternKey,
          executionTrustBand: policy.band,
          dependencyReadiness: dependency.readiness,
          stabilizationHoldUntil: dependency.holdUntil,
        },
        mutateEligibilityReason: null,
        canRollback: true,
        rollbackActionType: "restore_campaign_budget" as const,
        rollbackPayloadPreview: {
          campaignBudgetResourceName: target.campaignBudgetResourceName,
          previousAmount: currentBudget,
        },
        budgetAdjustmentPreview: {
          previousAmount: currentBudget,
          proposedAmount,
          deltaPercent,
        },
        executionTrustScore: policy.score,
        executionTrustBand: policy.band,
        executionPolicyReason: policy.reason,
        dependencyReadiness: dependency.readiness,
        stabilizationHoldUntil: dependency.holdUntil,
        batchEligible: false,
        batchGroupKey: null,
      };
    }

    if (recommendation.type === "geo_device_adjustment" && recommendation.affectedCampaignIds?.length === 1) {
      const target = (input.selectedCampaigns ?? []).find(
        (campaign) =>
          String(campaign.campaignId ?? "") === String(recommendation.affectedCampaignIds?.[0] ?? "") &&
          campaign.budgetExplicitlyShared !== true &&
          Boolean(campaign.campaignBudgetResourceName) &&
          Number(campaign.dailyBudget ?? 0) > 0
      );
      if (target) {
        const policy = executionPolicy({
          mutateActionType: "adjust_campaign_budget",
          recommendationType: recommendation.type,
          dominantIntent: "geo_device_skew",
          overlapSeverity: recommendation.overlapSeverity ?? null,
          commerceState: recommendation.commerceSignals?.stockState ?? null,
          dependencyReadiness: dependency.readiness,
        });
        if (policy.band !== "low") {
          const currentBudget = Number(target.dailyBudget ?? 0);
          const deltaPercent = policy.band === "high" ? 10 : 5;
          const proposedAmount = Number((currentBudget * (1 + deltaPercent / 100)).toFixed(2));
          return {
            executionMode: "mutate_ready" as const,
            mutateActionType: "adjust_campaign_budget" as const,
            mutatePayloadPreview: {
              accountId: input.accountId,
              campaignId: target.campaignId,
              campaignBudgetResourceName: target.campaignBudgetResourceName,
              previousAmount: currentBudget,
              proposedAmount,
              deltaPercent,
              policyPatternKey: policy.policyPatternKey,
              executionTrustBand: policy.band,
              dependencyReadiness: dependency.readiness,
              stabilizationHoldUntil: dependency.holdUntil,
            },
            mutateEligibilityReason: null,
            canRollback: true,
            rollbackActionType: "restore_campaign_budget" as const,
            rollbackPayloadPreview: {
              campaignBudgetResourceName: target.campaignBudgetResourceName,
              previousAmount: currentBudget,
            },
            budgetAdjustmentPreview: {
              previousAmount: currentBudget,
              proposedAmount,
              deltaPercent,
            },
            executionTrustScore: policy.score,
            executionTrustBand: policy.band,
            executionPolicyReason: policy.reason,
            dependencyReadiness: dependency.readiness,
            stabilizationHoldUntil: dependency.holdUntil,
            batchEligible: false,
            batchGroupKey: null,
          };
        }
      }
    }

    return {
      executionMode: "handoff" as const,
      mutateActionType: null,
      mutatePayloadPreview: null,
      mutateEligibilityReason: "This recommendation does not resolve to a mutate-safe action in the current Wave 9 scope.",
      canRollback: false,
      rollbackActionType: null,
      rollbackPayloadPreview: null,
      budgetAdjustmentPreview: null,
      executionTrustScore: null,
      executionTrustBand: null,
      executionPolicyReason: null,
      dependencyReadiness: dependency.readiness,
      stabilizationHoldUntil: dependency.holdUntil,
      batchEligible: false,
      batchGroupKey: null,
    };
  };

  return input.recommendations
    .map((recommendation) => {
      const campaignId =
        recommendation.level === "campaign"
          ? recommendation.entityId ?? null
          : recommendation.affectedCampaignIds?.length === 1
            ? recommendation.affectedCampaignIds[0]
            : null;
      const relatedEntities = Array.from(
        new Set([
          ...(recommendation.overlapEntities ?? []),
          ...(recommendation.affectedCampaignIds ?? []),
        ].filter(Boolean))
      );
      const deepLinkUrl =
        input.accountId && campaignId
          ? buildGoogleAdsCampaignDeepLink(input.accountId, campaignId)
          : null;
      const groupedPlan = !campaignId && relatedEntities.length > 0 ? groupedHandoffPlan(recommendation) : null;
      const mutateFields = buildMutateFields(recommendation);
      return {
        ...recommendation,
        rankScore:
          recommendation.rankScore + (recommendation.currentStatus === "escalated" ? 1.5 : 0),
        rankExplanation:
          recommendation.currentStatus === "escalated"
            ? `${recommendation.rankExplanation} Persistent unresolved condition increased its urgency.`
            : recommendation.rankExplanation,
        executionTargetType: campaignId
          ? "campaign"
          : recommendation.level === "account"
            ? "account"
            : undefined,
        executionTargetId: campaignId,
        executionMode: mutateFields.executionMode,
        mutateActionType: mutateFields.mutateActionType,
        mutatePayloadPreview: mutateFields.mutatePayloadPreview,
        mutateEligibilityReason: mutateFields.mutateEligibilityReason,
        canRollback: mutateFields.canRollback,
        rollbackActionType: mutateFields.rollbackActionType,
        rollbackPayloadPreview: mutateFields.rollbackPayloadPreview,
        budgetAdjustmentPreview: mutateFields.budgetAdjustmentPreview,
        executionTrustScore: mutateFields.executionTrustScore,
        executionTrustBand: mutateFields.executionTrustBand,
        executionPolicyReason: mutateFields.executionPolicyReason,
        dependencyReadiness: mutateFields.dependencyReadiness,
        stabilizationHoldUntil: mutateFields.stabilizationHoldUntil,
        batchEligible: mutateFields.batchEligible,
        batchGroupKey: mutateFields.batchGroupKey,
        deepLinkUrl,
        handoffPayload: campaignId
          ? {
              campaignId,
              recommendationId: recommendation.id,
              recommendationFingerprint: recommendation.recommendationFingerprint,
            }
          : relatedEntities.length > 0
            ? {
                primaryTarget:
                  recommendation.entityName ??
                  recommendation.overlapEntities?.[0] ??
                  recommendation.affectedCampaignIds?.[0] ??
                  "Account-level workflow",
                relatedEntities,
                why: recommendation.why,
                validationChecklist: recommendation.validationChecklist,
                rollbackGuidance: recommendation.rollbackGuidance,
              }
            : null,
        orderedHandoffSteps: groupedPlan?.orderedHandoffSteps ?? recommendation.orderedHandoffSteps ?? [],
        coreStepIds: groupedPlan?.coreStepIds ?? recommendation.coreStepIds ?? [],
        estimatedOperatorMinutes: groupedPlan?.estimatedOperatorMinutes ?? recommendation.estimatedOperatorMinutes ?? null,
        handoffUnavailableReason:
          !campaignId && relatedEntities.length > 0
            ? "This recommendation spans multiple related entities, so a single safe deep link is not available."
            : null,
      };
    })
    .sort((a, b) => {
      return (
        advisorBucketWeight(a.doBucket) - advisorBucketWeight(b.doBucket) ||
        memoryStatusWeight(b.currentStatus) - memoryStatusWeight(a.currentStatus) ||
        b.rankScore - a.rankScore
      );
    });
}
