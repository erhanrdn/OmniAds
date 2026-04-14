export type GlobalRebuildState =
  | "blocked"
  | "repair_required"
  | "quota_limited"
  | "cold_bootstrap"
  | "backfill_in_progress"
  | "partial_upstream_coverage"
  | "ready";

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
  workflow: {
    adminSurface: string;
    googleStatus: string;
    metaStatus: string;
  };
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
      return "Google rebuild truth is ready for the current warehouse contract.";
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
      return "Meta rebuild truth is ready for the current warehouse contract.";
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

  return {
    rolloutModel: "global",
    workflow: {
      adminSurface: "/admin/sync-health",
      googleStatus: "/api/google-ads/status?businessId=<businessId>",
      metaStatus: "/api/meta/status?businessId=<businessId>",
    },
    googleAds: {
      execution: {
        sync:
          input.googleExecution.sync === "safe_mode"
            ? {
                state: "safe_mode",
                summary:
                  "Google extended rebuild execution is globally limited by safe mode.",
              }
            : input.googleExecution.sync === "global_reopen"
              ? {
                  state: "global_reopen",
                  summary:
                    "Google extended rebuild execution is globally reopened under the current safeguards.",
                }
              : {
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
      },
      rebuild: {
        state: googleState,
        summary: buildGoogleRebuildSummary(googleState),
        evidence: googleEvidence,
        nextChecks: [
          "Use /admin/sync-health for the global Google posture and queue evidence.",
          "Use /api/google-ads/status?businessId=<businessId> for business-scoped rebuild truth.",
          "Use npm run google:ads:product-gate -- <businessId> when operator proof for readiness or retention is needed.",
        ],
      },
    },
    meta: {
      execution: {
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
      },
      rebuild: {
        state: metaState,
        summary: buildMetaRebuildSummary(metaState),
        evidence: metaEvidence,
        nextChecks: [
          "Use /admin/sync-health for the global Meta posture and worker/backfill evidence.",
          "Use /api/meta/status?businessId=<businessId> for business-scoped rebuild truth and protected published truth.",
          "Use npm run meta:state-check -- <businessId> and npm run meta:verify-publish -- <businessId> <providerAccountId> <day> when publication proof is needed.",
        ],
      },
      protectedPublishedTruth: summarizeMetaProtectedPublishedTruth({
        review: input.metaProtectedPublishedTruth,
        rebuildState: metaState,
      }),
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
