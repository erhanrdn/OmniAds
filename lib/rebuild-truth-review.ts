import {
  GLOBAL_OPERATOR_REVIEW_WORKFLOW,
  type GlobalOperatorReviewWorkflow,
} from "@/lib/global-operator-review";

export type GlobalRebuildState =
  | "blocked"
  | "repair_required"
  | "quota_limited"
  | "cold_bootstrap"
  | "backfill_in_progress"
  | "partial_upstream_coverage"
  | "ready";

export type GlobalExecutionReadinessState = "not_ready" | "conditionally_ready" | "ready";

export type GlobalExecutionReadinessProvider = "google_ads" | "meta";

export type GlobalExecutionPostureDecision =
  | "no_go"
  | "hold_manual"
  | "eligible_for_explicit_review";

export interface GlobalExecutionReadinessBlocker {
  provider: GlobalExecutionReadinessProvider;
  code:
    | "google_blocked_businesses"
    | "google_quota_limited"
    | "google_cold_bootstrap"
    | "google_backfill_in_progress"
    | "google_partial_upstream_coverage"
    | "meta_blocked_businesses"
    | "meta_repair_required"
    | "meta_quota_limited"
    | "meta_cold_bootstrap"
    | "meta_backfill_in_progress"
    | "meta_partial_upstream_coverage"
    | "meta_protected_truth_unavailable"
    | "meta_publication_missing"
    | "meta_protected_truth_rebuild_incomplete"
    | "meta_protected_truth_not_visible";
  severity: "blocking" | "watch";
  summary: string;
  evidence: string;
}

export interface ProviderExecutionReadinessReview {
  state: GlobalExecutionReadinessState;
  summary: string;
  blockers: GlobalExecutionReadinessBlocker[];
  evidenceStillMissing: string[];
}

export interface GlobalExecutionReadinessReview {
  state: GlobalExecutionReadinessState;
  summary: string;
  decisionModel: "global";
  automaticEnablement: false;
  strongerPostureJustified: boolean;
  holdingProviders: GlobalExecutionReadinessProvider[];
  dominantBlockers: GlobalExecutionReadinessBlocker[];
  evidenceStillMissing: string[];
  providers: {
    googleAds: ProviderExecutionReadinessReview;
    meta: ProviderExecutionReadinessReview;
  };
}

export interface GlobalExecutionPostureReview {
  decision: GlobalExecutionPostureDecision;
  summary: string;
  gateState: GlobalExecutionReadinessState;
  gateSummary: string;
  automaticEnablement: false;
  strongerPostureJustified: boolean;
  holdingProviders: GlobalExecutionReadinessProvider[];
  dominantBlockers: GlobalExecutionReadinessBlocker[];
  evidenceStillMissing: string[];
  allowedNextStep: string;
  mustRemainManual: string[];
  forbiddenEvenIfReady: string[];
  currentPosture: {
    googleAds: {
      sync: ProviderExecutionTruth;
      retention: ProviderExecutionTruth;
    };
    meta: {
      authoritativeFinalization: ProviderExecutionTruth;
      retention: ProviderExecutionTruth;
    };
  };
}

export interface MetaProtectedPublishedTruthClassReview {
  key:
    | "core_daily_rows"
    | "breakdown_daily_rows"
    | "active_publication_pointers"
    | "active_published_slice_versions"
    | "active_source_manifests"
    | "published_day_state";
  label: string;
  present: boolean;
  observed: boolean;
  protectedRows: number;
  latestProtectedValue: string | null;
}

export interface MetaProtectedPublishedTruthReview {
  runtimeAvailable: boolean;
  asOfDate: string;
  scope: {
    kind: "all_businesses" | "selected_businesses";
    businessIds: string[] | null;
  };
  hasNonZeroProtectedPublishedRows: boolean;
  protectedPublishedRows: number;
  activePublicationPointerRows: number;
  protectedTruthClassesPresent: MetaProtectedPublishedTruthClassReview["key"][];
  protectedTruthClassesAbsent: MetaProtectedPublishedTruthClassReview["key"][];
  classes: MetaProtectedPublishedTruthClassReview[];
}

export interface GlobalGoogleBusinessRebuildInput {
  businessId: string;
  queueDepth: number;
  leasedPartitions: number;
  deadLetterPartitions: number;
  campaignCompletedDays: number;
  searchTermCompletedDays: number;
  productCompletedDays: number;
  assetCompletedDays?: number;
  recentExtendedReady?: boolean;
  historicalExtendedReady?: boolean;
  extendedRecentQueueDepth?: number;
  extendedRecentLeasedPartitions?: number;
  extendedHistoricalQueueDepth?: number;
  extendedHistoricalLeasedPartitions?: number;
  circuitBreakerOpen?: boolean;
  quotaPressure?: number;
  quotaErrorCount?: number;
  recoveryMode?: "open" | "half_open" | "closed";
  reclaimCandidateCount?: number;
  poisonedCheckpointCount?: number;
  leaseConflictRuns24h?: number;
  integrityBlockedCount?: number;
  quotaLimitedEvidence?: boolean;
}

export interface GlobalMetaBusinessRebuildInput {
  businessId: string;
  queueDepth: number;
  leasedPartitions: number;
  retryableFailedPartitions: number;
  staleLeasePartitions: number;
  deadLetterPartitions: number;
  stateRowCount: number;
  todayAccountRows: number;
  todayAdsetRows: number;
  accountCompletedDays: number;
  adsetCompletedDays: number;
  creativeCompletedDays: number;
  recentAccountCompletedDays?: number;
  recentAdsetCompletedDays?: number;
  recentCreativeCompletedDays?: number;
  recentAdCompletedDays?: number;
  recentExtendedReady?: boolean;
  historicalExtendedReady?: boolean;
  repairBacklog?: number;
  recentFailures?: Array<{ result: string }>;
  integrityBlockedCount?: number;
  d1FinalizeNonTerminalCount?: number;
  progressState?: "ready" | "syncing" | "partial_progressing" | "partial_stuck" | "blocked";
  quotaLimitedEvidence?: boolean;
}

export interface ProviderRebuildEvidenceSummary {
  totalBusinesses: number;
  blockedBusinesses: number;
  repairRequiredBusinesses: number;
  quotaLimitedBusinesses: number;
  coldBootstrapBusinesses: number;
  backfillInProgressBusinesses: number;
  partialUpstreamCoverageBusinesses: number;
  readyBusinesses: number;
}

export interface ProviderExecutionTruth {
  state: string;
  summary: string;
}

export interface ProviderRebuildTruthReview {
  state: GlobalRebuildState;
  summary: string;
  evidence: ProviderRebuildEvidenceSummary;
  nextChecks: string[];
}

export interface GlobalProviderRebuildReview {
  execution: Record<string, ProviderExecutionTruth>;
  rebuild: ProviderRebuildTruthReview;
}

export interface GlobalRebuildTruthReview {
  rolloutModel: "global";
  workflow: GlobalOperatorReviewWorkflow;
  executionReadiness: GlobalExecutionReadinessReview;
  executionPostureReview: GlobalExecutionPostureReview;
  googleAds: GlobalProviderRebuildReview;
  meta: GlobalProviderRebuildReview & {
    protectedPublishedTruth: {
      state: "present" | "publication_missing" | "rebuild_incomplete" | "none_visible" | "unavailable";
      summary: string;
      runtimeAvailable: boolean;
      hasNonZeroProtectedPublishedRows: boolean;
      protectedPublishedRows: number;
      activePublicationPointerRows: number;
      protectedTruthClassesPresent: MetaProtectedPublishedTruthReview["protectedTruthClassesPresent"];
      protectedTruthClassesAbsent: MetaProtectedPublishedTruthReview["protectedTruthClassesAbsent"];
      classes: MetaProtectedPublishedTruthReview["classes"];
    };
  };
}

function getDominantRebuildState(summary: ProviderRebuildEvidenceSummary): GlobalRebuildState {
  if (summary.blockedBusinesses > 0) return "blocked";
  if (summary.repairRequiredBusinesses > 0) return "repair_required";
  if (summary.quotaLimitedBusinesses > 0) return "quota_limited";
  if (summary.coldBootstrapBusinesses > 0) return "cold_bootstrap";
  if (summary.backfillInProgressBusinesses > 0) return "backfill_in_progress";
  if (summary.partialUpstreamCoverageBusinesses > 0) return "partial_upstream_coverage";
  return "ready";
}

function hasQuotaLimitEvidence(text: string | null | undefined) {
  return /quota|rate[- ]?limit|too many requests|429|resource[_ ]?exhausted/i.test(
    String(text ?? ""),
  );
}

function classifyGoogleBusinessState(
  business: GlobalGoogleBusinessRebuildInput,
): GlobalRebuildState {
  const blocked =
    business.deadLetterPartitions > 0 ||
    (business.integrityBlockedCount ?? 0) > 0 ||
    (business.reclaimCandidateCount ?? 0) > 0 ||
    (business.poisonedCheckpointCount ?? 0) > 0 ||
    (business.leaseConflictRuns24h ?? 0) > 0;
  if (blocked) return "blocked";

  const quotaLimited =
    business.quotaLimitedEvidence === true ||
    business.circuitBreakerOpen === true ||
    business.recoveryMode === "open" ||
    business.recoveryMode === "half_open" ||
    (business.quotaPressure ?? 0) >= 0.85 ||
    (business.quotaErrorCount ?? 0) > 0;
  if (quotaLimited) return "quota_limited";

  const coldBootstrap =
    business.queueDepth + business.leasedPartitions > 0 &&
    business.campaignCompletedDays === 0 &&
    business.searchTermCompletedDays === 0 &&
    business.productCompletedDays === 0 &&
    (business.assetCompletedDays ?? 0) === 0;
  if (coldBootstrap) return "cold_bootstrap";

  const hasCoverageGap =
    business.recentExtendedReady !== true || business.historicalExtendedReady !== true;
  const hasActiveBackfill =
    business.queueDepth > 0 ||
    business.leasedPartitions > 0 ||
    (business.extendedRecentQueueDepth ?? 0) > 0 ||
    (business.extendedRecentLeasedPartitions ?? 0) > 0 ||
    (business.extendedHistoricalQueueDepth ?? 0) > 0 ||
    (business.extendedHistoricalLeasedPartitions ?? 0) > 0;

  if (hasCoverageGap && hasActiveBackfill) return "backfill_in_progress";
  if (hasCoverageGap) return "partial_upstream_coverage";
  return "ready";
}

function classifyMetaBusinessState(
  business: GlobalMetaBusinessRebuildInput,
): GlobalRebuildState {
  const blocked =
    business.progressState === "blocked" ||
    business.deadLetterPartitions > 0 ||
    (business.integrityBlockedCount ?? 0) > 0;
  if (blocked) return "blocked";

  const repairRequired =
    business.retryableFailedPartitions > 0 ||
    (business.repairBacklog ?? 0) > 0 ||
    (business.recentFailures ?? []).some((failure) => failure.result === "repair_required");
  if (repairRequired) return "repair_required";

  if (business.quotaLimitedEvidence === true) return "quota_limited";

  const coldBootstrap =
    business.queueDepth + business.leasedPartitions > 0 &&
    business.stateRowCount === 0 &&
    business.accountCompletedDays === 0 &&
    business.adsetCompletedDays === 0 &&
    business.creativeCompletedDays === 0 &&
    (business.recentAccountCompletedDays ?? 0) === 0 &&
    (business.recentAdsetCompletedDays ?? 0) === 0 &&
    (business.recentCreativeCompletedDays ?? 0) === 0 &&
    (business.recentAdCompletedDays ?? 0) === 0;
  if (coldBootstrap) return "cold_bootstrap";

  const hasCoverageGap =
    business.recentExtendedReady !== true ||
    business.historicalExtendedReady !== true ||
    business.todayAccountRows === 0 ||
    business.todayAdsetRows === 0 ||
    (business.d1FinalizeNonTerminalCount ?? 0) > 0;
  const hasActiveBackfill =
    business.queueDepth > 0 ||
    business.leasedPartitions > 0 ||
    business.staleLeasePartitions > 0;

  if (hasCoverageGap && hasActiveBackfill) return "backfill_in_progress";
  if (hasCoverageGap) return "partial_upstream_coverage";
  return "ready";
}

function buildEvidenceSummary(states: GlobalRebuildState[]): ProviderRebuildEvidenceSummary {
  return {
    totalBusinesses: states.length,
    blockedBusinesses: states.filter((state) => state === "blocked").length,
    repairRequiredBusinesses: states.filter((state) => state === "repair_required").length,
    quotaLimitedBusinesses: states.filter((state) => state === "quota_limited").length,
    coldBootstrapBusinesses: states.filter((state) => state === "cold_bootstrap").length,
    backfillInProgressBusinesses: states.filter((state) => state === "backfill_in_progress").length,
    partialUpstreamCoverageBusinesses: states.filter(
      (state) => state === "partial_upstream_coverage",
    ).length,
    readyBusinesses: states.filter((state) => state === "ready").length,
  };
}

function buildGoogleRebuildSummary(state: GlobalRebuildState): string {
  switch (state) {
    case "blocked":
      return "Google rebuild truth is still blocked by verified queue or integrity evidence.";
    case "repair_required":
      return "Google rebuild truth still needs repair work before it can be trusted more strongly.";
    case "quota_limited":
      return "Google rebuild truth is still constrained by quota or rate-limit pressure.";
    case "cold_bootstrap":
      return "Google is still in cold bootstrap on the rebuilt warehouse.";
    case "backfill_in_progress":
      return "Google historical truth is still backfilling.";
    case "partial_upstream_coverage":
      return "Google still has only partial upstream coverage on some required surfaces.";
    case "ready":
    default:
      return "Google rebuild truth is ready for the current warehouse contract. Ready means evidence only and does not auto-enable stronger execution.";
  }
}

function buildMetaRebuildSummary(state: GlobalRebuildState): string {
  switch (state) {
    case "blocked":
      return "Meta rebuild truth is still blocked by publication, queue, or integrity evidence.";
    case "repair_required":
      return "Meta rebuild truth still needs an authoritative retry before it should be trusted more strongly.";
    case "quota_limited":
      return "Meta rebuild truth is still constrained by quota or rate-limit pressure.";
    case "cold_bootstrap":
      return "Meta is still in cold bootstrap on the rebuilt warehouse.";
    case "backfill_in_progress":
      return "Meta historical truth is still backfilling.";
    case "partial_upstream_coverage":
      return "Meta still has only partial upstream coverage on required surfaces.";
    case "ready":
    default:
      return "Meta rebuild truth is ready for the current warehouse contract. Ready means evidence only and does not auto-enable stronger execution.";
  }
}

function summarizeMetaProtectedPublishedTruth(input: {
  review: MetaProtectedPublishedTruthReview;
  rebuildState: GlobalRebuildState;
}): GlobalRebuildTruthReview["meta"]["protectedPublishedTruth"] {
  if (!input.review.runtimeAvailable) {
    return {
      state: "unavailable",
      summary:
        "Meta protected published truth review is unavailable because the warehouse runtime is not ready.",
      runtimeAvailable: false,
      hasNonZeroProtectedPublishedRows: false,
      protectedPublishedRows: 0,
      activePublicationPointerRows: 0,
      protectedTruthClassesPresent: [],
      protectedTruthClassesAbsent: input.review.protectedTruthClassesAbsent,
      classes: input.review.classes,
    };
  }

  if (input.review.hasNonZeroProtectedPublishedRows) {
    return {
      state: "present",
      summary:
        "Meta rebuilt data now shows non-zero protected published daily truth inside the locked horizons.",
      runtimeAvailable: true,
      hasNonZeroProtectedPublishedRows: true,
      protectedPublishedRows: input.review.protectedPublishedRows,
      activePublicationPointerRows: input.review.activePublicationPointerRows,
      protectedTruthClassesPresent: input.review.protectedTruthClassesPresent,
      protectedTruthClassesAbsent: input.review.protectedTruthClassesAbsent,
      classes: input.review.classes,
    };
  }

  if (input.review.activePublicationPointerRows === 0 && input.rebuildState === "blocked") {
    return {
      state: "publication_missing",
      summary:
        "Meta protected published truth is still absent because publication pointers are not yet visible in rebuilt data.",
      runtimeAvailable: true,
      hasNonZeroProtectedPublishedRows: false,
      protectedPublishedRows: 0,
      activePublicationPointerRows: 0,
      protectedTruthClassesPresent: input.review.protectedTruthClassesPresent,
      protectedTruthClassesAbsent: input.review.protectedTruthClassesAbsent,
      classes: input.review.classes,
    };
  }

  if (
    input.rebuildState === "repair_required" ||
    input.rebuildState === "quota_limited" ||
    input.rebuildState === "cold_bootstrap" ||
    input.rebuildState === "backfill_in_progress" ||
    input.rebuildState === "partial_upstream_coverage"
  ) {
    return {
      state: "rebuild_incomplete",
      summary:
        "Meta protected published truth is not yet visible, and current rebuild evidence still says the warehouse is incomplete.",
      runtimeAvailable: true,
      hasNonZeroProtectedPublishedRows: false,
      protectedPublishedRows: 0,
      activePublicationPointerRows: input.review.activePublicationPointerRows,
      protectedTruthClassesPresent: input.review.protectedTruthClassesPresent,
      protectedTruthClassesAbsent: input.review.protectedTruthClassesAbsent,
      classes: input.review.classes,
    };
  }

  return {
    state: "none_visible",
    summary:
      "No non-zero Meta protected published daily rows are currently visible in rebuilt data under the current global contract.",
    runtimeAvailable: true,
    hasNonZeroProtectedPublishedRows: false,
    protectedPublishedRows: 0,
    activePublicationPointerRows: input.review.activePublicationPointerRows,
    protectedTruthClassesPresent: input.review.protectedTruthClassesPresent,
    protectedTruthClassesAbsent: input.review.protectedTruthClassesAbsent,
    classes: input.review.classes,
  };
}

function dedupeText(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getExecutionReadinessState(
  blockers: GlobalExecutionReadinessBlocker[],
): GlobalExecutionReadinessState {
  if (blockers.some((blocker) => blocker.severity === "blocking")) return "not_ready";
  if (blockers.length > 0) return "conditionally_ready";
  return "ready";
}

function buildGoogleExecutionReadinessReview(input: {
  rebuild: ProviderRebuildTruthReview;
}): ProviderExecutionReadinessReview {
  const blockers: GlobalExecutionReadinessBlocker[] = [];
  const evidenceStillMissing: string[] = [];

  switch (input.rebuild.state) {
    case "blocked":
      blockers.push({
        provider: "google_ads",
        code: "google_blocked_businesses",
        severity: "blocking",
        summary:
          "Google still has blocked businesses from dead-letter, integrity, reclaim, or poisoned-checkpoint evidence.",
        evidence: `${input.rebuild.evidence.blockedBusinesses} blocked businesses`,
      });
      evidenceStillMissing.push(
        "Google blocked businesses must clear from the global rebuild review.",
      );
      break;
    case "quota_limited":
      blockers.push({
        provider: "google_ads",
        code: "google_quota_limited",
        severity: "blocking",
        summary: "Google is still quota-limited or rate-limit constrained.",
        evidence: `${input.rebuild.evidence.quotaLimitedBusinesses} quota-limited businesses`,
      });
      evidenceStillMissing.push(
        "Google quota and rate-limit pressure must clear before stronger global trust is justified.",
      );
      break;
    case "cold_bootstrap":
      blockers.push({
        provider: "google_ads",
        code: "google_cold_bootstrap",
        severity: "blocking",
        summary: "Google is still in cold bootstrap on the rebuilt warehouse.",
        evidence: `${input.rebuild.evidence.coldBootstrapBusinesses} cold-bootstrap businesses`,
      });
      evidenceStillMissing.push(
        "Google must move past cold bootstrap with real rebuilt historical coverage.",
      );
      break;
    case "backfill_in_progress":
      blockers.push({
        provider: "google_ads",
        code: "google_backfill_in_progress",
        severity: "blocking",
        summary: "Google historical backfill is still in progress.",
        evidence: `${input.rebuild.evidence.backfillInProgressBusinesses} businesses still backfilling`,
      });
      evidenceStillMissing.push(
        "Google historical backfill must complete before stronger global trust is justified.",
      );
      break;
    case "partial_upstream_coverage":
      blockers.push({
        provider: "google_ads",
        code: "google_partial_upstream_coverage",
        severity: "watch",
        summary: "Google still has partial upstream coverage on required surfaces.",
        evidence: `${input.rebuild.evidence.partialUpstreamCoverageBusinesses} businesses with partial coverage`,
      });
      evidenceStillMissing.push(
        "Google partial upstream coverage on required surfaces must clear before the gate can become fully ready.",
      );
      break;
    case "repair_required":
    case "ready":
    default:
      break;
  }

  const state = getExecutionReadinessState(blockers);
  const summary =
    state === "ready"
      ? "Google is not currently holding back the global execution readiness gate."
      : state === "conditionally_ready"
        ? "Google no longer reports hard rebuild blockers, but partial upstream coverage still prevents a fully ready global posture."
        : blockers[0]?.summary ??
          "Google is still holding back stronger global execution posture.";

  return {
    state,
    summary,
    blockers,
    evidenceStillMissing: dedupeText(evidenceStillMissing),
  };
}

function buildMetaExecutionReadinessReview(input: {
  rebuild: ProviderRebuildTruthReview;
  protectedPublishedTruth: GlobalRebuildTruthReview["meta"]["protectedPublishedTruth"];
}): ProviderExecutionReadinessReview {
  const blockers: GlobalExecutionReadinessBlocker[] = [];
  const evidenceStillMissing: string[] = [];

  switch (input.rebuild.state) {
    case "blocked":
      blockers.push({
        provider: "meta",
        code: "meta_blocked_businesses",
        severity: "blocking",
        summary:
          "Meta still has blocked businesses from publication, integrity, or queue evidence.",
        evidence: `${input.rebuild.evidence.blockedBusinesses} blocked businesses`,
      });
      evidenceStillMissing.push(
        "Meta blocked publication or integrity states must clear from the global rebuild review.",
      );
      break;
    case "repair_required":
      blockers.push({
        provider: "meta",
        code: "meta_repair_required",
        severity: "blocking",
        summary:
          "Meta still has repair-required authoritative truth that is not safe to trust more strongly yet.",
        evidence: `${input.rebuild.evidence.repairRequiredBusinesses} repair-required businesses`,
      });
      evidenceStillMissing.push(
        "Meta repair-required authoritative retries must succeed before stronger global trust is justified.",
      );
      break;
    case "quota_limited":
      blockers.push({
        provider: "meta",
        code: "meta_quota_limited",
        severity: "blocking",
        summary: "Meta is still quota-limited or rate-limit constrained.",
        evidence: `${input.rebuild.evidence.quotaLimitedBusinesses} quota-limited businesses`,
      });
      evidenceStillMissing.push(
        "Meta quota and rate-limit pressure must clear before stronger global trust is justified.",
      );
      break;
    case "cold_bootstrap":
      blockers.push({
        provider: "meta",
        code: "meta_cold_bootstrap",
        severity: "blocking",
        summary: "Meta is still in cold bootstrap on the rebuilt warehouse.",
        evidence: `${input.rebuild.evidence.coldBootstrapBusinesses} cold-bootstrap businesses`,
      });
      evidenceStillMissing.push(
        "Meta must move past cold bootstrap with real rebuilt historical coverage.",
      );
      break;
    case "backfill_in_progress":
      blockers.push({
        provider: "meta",
        code: "meta_backfill_in_progress",
        severity: "blocking",
        summary: "Meta historical backfill is still in progress.",
        evidence: `${input.rebuild.evidence.backfillInProgressBusinesses} businesses still backfilling`,
      });
      evidenceStillMissing.push(
        "Meta historical backfill must complete before stronger global trust is justified.",
      );
      break;
    case "partial_upstream_coverage":
      blockers.push({
        provider: "meta",
        code: "meta_partial_upstream_coverage",
        severity: "watch",
        summary: "Meta still has partial upstream coverage on required surfaces.",
        evidence: `${input.rebuild.evidence.partialUpstreamCoverageBusinesses} businesses with partial coverage`,
      });
      evidenceStillMissing.push(
        "Meta partial upstream coverage on required surfaces must clear before the gate can become fully ready.",
      );
      break;
    case "ready":
    default:
      break;
  }

  switch (input.protectedPublishedTruth.state) {
    case "unavailable":
      blockers.push({
        provider: "meta",
        code: "meta_protected_truth_unavailable",
        severity: "blocking",
        summary: "Meta protected published truth review is unavailable.",
        evidence: "Protected published truth runtime unavailable",
      });
      evidenceStillMissing.push(
        "Meta protected published truth review must be available before stronger global trust is justified.",
      );
      break;
    case "publication_missing":
      blockers.push({
        provider: "meta",
        code: "meta_publication_missing",
        severity: "blocking",
        summary:
          "Meta protected published truth is still missing because active publication pointers are not visible.",
        evidence: `${input.protectedPublishedTruth.activePublicationPointerRows} active publication pointers`,
      });
      evidenceStillMissing.push(
        "Meta must expose active publication pointers and protected published truth before stronger global trust is justified.",
      );
      break;
    case "rebuild_incomplete":
      blockers.push({
        provider: "meta",
        code: "meta_protected_truth_rebuild_incomplete",
        severity: "blocking",
        summary:
          "Meta protected published truth is not yet visible while rebuild truth still reports incomplete warehouse posture.",
        evidence: `${input.protectedPublishedTruth.protectedPublishedRows} protected published rows visible`,
      });
      evidenceStillMissing.push(
        "Meta protected published truth must become visible after rebuild truth stops reporting incomplete posture.",
      );
      break;
    case "none_visible":
      blockers.push({
        provider: "meta",
        code: "meta_protected_truth_not_visible",
        severity: "watch",
        summary:
          "Meta protected published truth is still not visible in rebuilt data, even though hard rebuild blockers have cleared.",
        evidence: `${input.protectedPublishedTruth.protectedPublishedRows} protected rows, ${input.protectedPublishedTruth.activePublicationPointerRows} active publication pointers`,
      });
      evidenceStillMissing.push(
        "Meta must show non-zero protected published daily truth on real rebuilt data before the gate can become fully ready.",
      );
      break;
    case "present":
    default:
      break;
  }

  const state = getExecutionReadinessState(blockers);
  const summary =
    state === "ready"
      ? "Meta is not currently holding back the global execution readiness gate."
      : state === "conditionally_ready"
        ? "Meta no longer reports hard rebuild blockers, but protected published truth is still not visible enough to justify a fully ready posture."
        : blockers[0]?.summary ?? "Meta is still holding back stronger global execution posture.";

  return {
    state,
    summary,
    blockers,
    evidenceStillMissing: dedupeText(evidenceStillMissing),
  };
}

function buildGlobalExecutionReadinessReview(input: {
  google: ProviderExecutionReadinessReview;
  meta: ProviderExecutionReadinessReview;
}): GlobalExecutionReadinessReview {
  const holdingProviders = (
    [
      input.google.state === "ready" ? null : ("google_ads" as const),
      input.meta.state === "ready" ? null : ("meta" as const),
    ].filter(Boolean) as GlobalExecutionReadinessProvider[]
  );
  const dominantBlockers = [...input.google.blockers, ...input.meta.blockers].sort((left, right) => {
    const severityOrder = left.severity === right.severity ? 0 : left.severity === "blocking" ? -1 : 1;
    if (severityOrder !== 0) return severityOrder;
    return left.provider.localeCompare(right.provider);
  });
  const evidenceStillMissing = dedupeText([
    ...input.google.evidenceStillMissing,
    ...input.meta.evidenceStillMissing,
  ]);
  const state =
    input.google.state === "not_ready" || input.meta.state === "not_ready"
      ? "not_ready"
      : input.google.state === "conditionally_ready" || input.meta.state === "conditionally_ready"
        ? "conditionally_ready"
        : "ready";
  const summary =
    state === "ready"
      ? "Global execution readiness is ready. Rebuild truth no longer shows global blockers, and Meta protected published truth is visible. Ready here means evidence only; stronger execution remains a separate explicit operator decision."
      : state === "conditionally_ready"
        ? "Global execution readiness is conditionally ready. Hard rebuild blockers are cleared, but remaining evidence still does not justify stronger execution or stronger warehouse trust yet."
        : "Global execution readiness is not ready. Stronger execution or stronger warehouse trust would overstate the current rebuild truth.";

  return {
    state,
    summary,
    decisionModel: "global",
    automaticEnablement: false,
    strongerPostureJustified: state === "ready",
    holdingProviders,
    dominantBlockers,
    evidenceStillMissing,
    providers: {
      googleAds: input.google,
      meta: input.meta,
    },
  };
}

function buildGlobalExecutionPostureReview(input: {
  executionReadiness: GlobalExecutionReadinessReview;
  googleExecution: {
    sync: ProviderExecutionTruth;
    retention: ProviderExecutionTruth;
  };
  metaExecution: {
    authoritativeFinalization: ProviderExecutionTruth;
    retention: ProviderExecutionTruth;
  };
}): GlobalExecutionPostureReview {
  const decision: GlobalExecutionPostureDecision =
    input.executionReadiness.state === "ready"
      ? "eligible_for_explicit_review"
      : input.executionReadiness.state === "conditionally_ready"
        ? "hold_manual"
        : "no_go";
  const summary =
    decision === "eligible_for_explicit_review"
      ? "Global posture is eligible for explicit operator review. The gate is ready, but ready here means evidence only; execution remains manual and separately controlled."
      : decision === "hold_manual"
        ? "Global posture must stay manual. The gate is only conditionally ready, so stronger execution or stronger warehouse trust is not justified yet."
        : "Global posture is a no-go. The gate is not ready, so stronger execution or stronger warehouse trust would overstate rebuild truth.";
  const allowedNextStep =
    decision === "eligible_for_explicit_review"
      ? "Operators may explicitly review, via /admin/sync-health or npm run ops:execution-readiness-review, whether stronger global execution posture or stronger warehouse trust should be considered next. No runtime behavior changes automatically."
      : decision === "hold_manual"
        ? "Keep the current manual posture. Use provider drilldown only to explain the remaining global blockers or missing evidence."
        : "Do not move beyond the current manual posture. Clear the blocking evidence reported by the global gate first.";

  return {
    decision,
    summary,
    gateState: input.executionReadiness.state,
    gateSummary: input.executionReadiness.summary,
    automaticEnablement: false,
    strongerPostureJustified: input.executionReadiness.strongerPostureJustified,
    holdingProviders: input.executionReadiness.holdingProviders,
    dominantBlockers: input.executionReadiness.dominantBlockers,
    evidenceStillMissing: input.executionReadiness.evidenceStillMissing,
    allowedNextStep,
    mustRemainManual: [
      "Execution remains manual even when the gate is ready; this review never flips runtime behavior automatically.",
      "Google Ads execution-sensitive mutation paths keep their existing manual approval and operator override controls; this review does not bypass them.",
      `Google Ads destructive execution still depends on GOOGLE_ADS_RETENTION_EXECUTION_ENABLED and is currently ${input.googleExecution.retention.state}.`,
      `Meta authoritative finalization still depends on META_AUTHORITATIVE_FINALIZATION_V2 and is currently ${input.metaExecution.authoritativeFinalization.state}.`,
      `Meta destructive execution still depends on META_RETENTION_EXECUTION_ENABLED and is currently ${input.metaExecution.retention.state}.`,
      "Stronger warehouse trust remains a separate explicit operator decision even when the gate is ready.",
      "Provider drilldown stays explanatory only; the posture contract remains one global behavior across all businesses.",
    ],
    forbiddenEvenIfReady: [
      "Do not auto-enable GOOGLE_ADS_RETENTION_EXECUTION_ENABLED or META_RETENTION_EXECUTION_ENABLED from this review.",
      "Do not treat ready as permission to silently execute or silently trust a stronger warehouse posture.",
      "Do not bypass Google Ads manual approval, operator override, or other existing execution boundary controls from this review.",
      "Do not reintroduce business-specific rollout, canary expansion, allowlists, or pick-the-next-business logic.",
      "Do not weaken locked provider truth contracts; Meta today remains live-only, Meta historical truth remains published-verified inside horizon, and Google advisor or hot-window readiness semantics stay unchanged.",
    ],
    currentPosture: {
      googleAds: {
        sync: input.googleExecution.sync,
        retention: input.googleExecution.retention,
      },
      meta: {
        authoritativeFinalization: input.metaExecution.authoritativeFinalization,
        retention: input.metaExecution.retention,
      },
    },
  };
}

export function buildGlobalRebuildTruthReview(input: {
  googleBusinesses?: GlobalGoogleBusinessRebuildInput[];
  metaBusinesses?: GlobalMetaBusinessRebuildInput[];
  googleExecution: {
    sync: "safe_mode" | "global_backfill" | "global_reopen";
    retentionEnabled: boolean;
  };
  metaExecution: {
    authoritativeFinalizationEnabled: boolean;
    retentionEnabled: boolean;
  };
  metaProtectedPublishedTruth: MetaProtectedPublishedTruthReview;
}) : GlobalRebuildTruthReview {
  const googleStates = (input.googleBusinesses ?? []).map((business) =>
    classifyGoogleBusinessState(business),
  );
  const metaStates = (input.metaBusinesses ?? []).map((business) =>
    classifyMetaBusinessState(business),
  );

  const googleEvidence = buildEvidenceSummary(googleStates);
  const metaEvidence = buildEvidenceSummary(metaStates);
  const googleState = getDominantRebuildState(googleEvidence);
  const metaState = getDominantRebuildState(metaEvidence);
  const googleExecution =
    input.googleExecution.sync === "safe_mode"
      ? {
          sync: {
            state: "safe_mode",
            summary:
              "Google extended rebuild execution is globally limited by safe mode.",
          },
          retention: input.googleExecution.retentionEnabled
            ? {
                state: "globally_enabled",
                summary: "Google retention execution is globally enabled.",
              }
            : {
                state: "dry_run",
                summary: "Google retention execution remains dry-run only.",
              },
        }
      : input.googleExecution.sync === "global_reopen"
        ? {
            sync: {
              state: "global_reopen",
              summary:
                "Google extended rebuild execution is globally reopened under the current safeguards.",
            },
            retention: input.googleExecution.retentionEnabled
              ? {
                  state: "globally_enabled",
                  summary: "Google retention execution is globally enabled.",
                }
              : {
                  state: "dry_run",
                  summary: "Google retention execution remains dry-run only.",
                },
          }
        : {
            sync: {
              state: "global_backfill",
              summary:
                "Google extended rebuild execution remains in the global backfill posture.",
            },
            retention: input.googleExecution.retentionEnabled
              ? {
                  state: "globally_enabled",
                  summary: "Google retention execution is globally enabled.",
                }
              : {
                  state: "dry_run",
                  summary: "Google retention execution remains dry-run only.",
                },
          };
  const metaExecution = {
    authoritativeFinalization: input.metaExecution.authoritativeFinalizationEnabled
      ? {
          state: "globally_enabled",
          summary:
            "Meta authoritative finalization v2 is globally enabled for all businesses.",
        }
      : {
          state: "disabled",
          summary: "Meta authoritative finalization v2 remains globally disabled.",
        },
    retention: input.metaExecution.retentionEnabled
      ? {
          state: "globally_enabled",
          summary: "Meta retention execution is globally enabled.",
        }
      : {
          state: "dry_run",
          summary: "Meta retention execution remains dry-run only.",
        },
  };
  const metaProtectedPublishedTruth = summarizeMetaProtectedPublishedTruth({
    review: input.metaProtectedPublishedTruth,
    rebuildState: metaState,
  });
  const executionReadiness = buildGlobalExecutionReadinessReview({
    google: buildGoogleExecutionReadinessReview({
      rebuild: {
        state: googleState,
        summary: buildGoogleRebuildSummary(googleState),
        evidence: googleEvidence,
        nextChecks: [],
      },
    }),
    meta: buildMetaExecutionReadinessReview({
      rebuild: {
        state: metaState,
        summary: buildMetaRebuildSummary(metaState),
        evidence: metaEvidence,
        nextChecks: [],
      },
      protectedPublishedTruth: metaProtectedPublishedTruth,
    }),
  });
  const executionPostureReview = buildGlobalExecutionPostureReview({
    executionReadiness,
    googleExecution,
    metaExecution,
  });

  return {
    rolloutModel: "global",
    workflow: GLOBAL_OPERATOR_REVIEW_WORKFLOW,
    executionReadiness,
    executionPostureReview,
    googleAds: {
      execution: googleExecution,
      rebuild: {
        state: googleState,
        summary: buildGoogleRebuildSummary(googleState),
        evidence: googleEvidence,
        nextChecks: [
          "Use /admin/sync-health or npm run ops:execution-readiness-review for the shared global operator review.",
          "Use /api/google-ads/status?businessId=<businessId> for business-scoped rebuild truth.",
          "Use npm run google:ads:product-gate -- <businessId> when operator proof for readiness or retention is needed.",
        ],
      },
    },
    meta: {
      execution: metaExecution,
      rebuild: {
        state: metaState,
        summary: buildMetaRebuildSummary(metaState),
        evidence: metaEvidence,
        nextChecks: [
          "Use /admin/sync-health or npm run ops:execution-readiness-review for the shared global operator review.",
          "Use /api/meta/status?businessId=<businessId> for business-scoped rebuild truth and protected published truth.",
          "Use npm run meta:state-check -- <businessId> and npm run meta:verify-publish -- <businessId> <providerAccountId> <day> when publication proof is needed.",
        ],
      },
      protectedPublishedTruth: metaProtectedPublishedTruth,
    },
  };
}

export function deriveProviderQuotaLimitedBusinessIds(input: {
  provider: "google_ads" | "meta";
  jobs: Array<{
    business_id: string;
    provider: string;
    error_message?: string | null;
  }>;
  cooldowns: Array<{
    business_id: string;
    provider: string;
    error_message?: string | null;
  }>;
}) {
  return Array.from(
    new Set(
      [
        ...input.jobs
          .filter(
            (row) =>
              row.provider === input.provider && hasQuotaLimitEvidence(row.error_message ?? null),
          )
          .map((row) => row.business_id),
        ...input.cooldowns
          .filter(
            (row) =>
              row.provider === input.provider && hasQuotaLimitEvidence(row.error_message ?? null),
          )
          .map((row) => row.business_id),
      ].filter(Boolean),
    ),
  );
}
