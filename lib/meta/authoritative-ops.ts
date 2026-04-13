import type {
  MetaAuthoritativeBusinessOpsSnapshot,
  MetaAuthoritativeDayVerification,
} from "@/lib/meta/warehouse-types";

function buildMetaAuthoritativeRecoveryGuidance(
  input: Pick<
    MetaAuthoritativeDayVerification,
    | "verificationState"
    | "deadLetters"
    | "staleLeases"
    | "repairBacklog"
    | "queuedPartitions"
    | "leasedPartitions"
    | "sourceManifestState"
    | "detectorReasonCodes"
  >,
) {
  if (input.deadLetters > 0) {
    return {
      category: "dead_letter_blocked",
      recommendation: "replay_dead_letter" as const,
      detail:
        "Dead-lettered Meta partitions are blocking progress. Replay them before trusting any completion signal.",
      commands: ["meta:replay-dead-letter", "meta:verify-day"],
    };
  }
  if (input.staleLeases > 0) {
    return {
      category: "stale_lease_proof_required",
      recommendation: "inspect_stale_lease_then_cleanup" as const,
      detail:
        "Stale Meta leases still need proof of no progress before they should be reclaimed or treated as terminal.",
      commands: ["meta:verify-day", "meta:cleanup", "meta:reschedule"],
    };
  }
  if (input.verificationState === "blocked") {
    return {
      category: "blocked_publication_mismatch",
      recommendation: "inspect_blocked_publication_mismatch" as const,
      detail:
        "Finalized Meta work did not produce the required published truth. Inspect publication and planner evidence before retrying.",
      commands: ["meta:verify-publish", "meta:verify-day", "meta:refresh-state"],
    };
  }
  if (
    input.verificationState === "failed" ||
    input.verificationState === "repair_required"
  ) {
    return {
      category: "repair_required",
      recommendation: "reschedule_authoritative_refresh" as const,
      detail:
        "A fresh authoritative Meta retry is the correct next action once current state is refreshed.",
      commands: ["meta:refresh-state", "meta:reschedule", "meta:verify-day"],
    };
  }
  if (input.leasedPartitions > 0) {
    return {
      category: "retryable_running",
      recommendation: "wait_for_active_worker" as const,
      detail:
        "Meta authoritative work is still running. Treat the day as non-terminal until publish evidence or a failure result appears.",
      commands: ["meta:verify-day"],
    };
  }
  if (input.queuedPartitions > 0 || input.repairBacklog > 0) {
    return {
      category: "retryable_queued",
      recommendation: "refresh_state_then_reschedule" as const,
      detail:
        "Meta authoritative work is queued but not yet published. Refresh state and reschedule instead of forcing a terminal outcome.",
      commands: ["meta:refresh-state", "meta:reschedule", "meta:verify-day"],
    };
  }
  if (
    input.sourceManifestState === "missing" ||
    input.sourceManifestState === "failed"
  ) {
    return {
      category: "retryable_idle",
      recommendation: "manual_refresh_finalize_range" as const,
      detail:
        "No trustworthy authoritative publish exists yet. Queue a fresh finalize-range retry rather than treating the day as successful.",
      commands: ["meta:refresh-state", "meta:reschedule", "meta:verify-day"],
    };
  }
  return {
    category: "none",
    recommendation: "none" as const,
    detail: "No operator recovery action is currently required.",
    commands: [] as string[],
  };
}

export function getMetaAuthoritativeRefreshRecommendation(
  input: Pick<
    MetaAuthoritativeDayVerification,
    | "verificationState"
    | "deadLetters"
    | "staleLeases"
    | "repairBacklog"
    | "queuedPartitions"
    | "leasedPartitions"
    | "sourceManifestState"
    | "detectorReasonCodes"
  >,
) {
  return buildMetaAuthoritativeRecoveryGuidance(input).recommendation;
}

export function buildMetaVerifyDayReport(input: MetaAuthoritativeDayVerification) {
  const operatorGuidance = buildMetaAuthoritativeRecoveryGuidance(input);
  return {
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    day: input.day,
    sourceManifestState: input.sourceManifestState,
    validationState: input.validationState,
    verificationState: input.verificationState,
    detectorReasonCodes: input.detectorReasonCodes ?? [],
    activePublication: input.activePublication,
    lastFailure: input.lastFailure,
    progression: {
      queued: input.queuedPartitions,
      leased: input.leasedPartitions,
      deadLetters: input.deadLetters,
      staleLeases: input.staleLeases,
      repairBacklog: input.repairBacklog,
    },
    surfaces: input.surfaces.map((surface) => ({
      surface: surface.surface,
      manifestState: surface.manifest?.fetchStatus ?? "missing",
      manifestCompletedAt: surface.manifest?.completedAt ?? null,
      plannerState: surface.plannerState?.state ?? null,
      plannerDiagnosisCode: surface.plannerState?.diagnosisCode ?? null,
      detectorState: surface.detectorState ?? null,
      detectorReasonCode: surface.detectorReasonCode ?? null,
      contractMismatch: surface.contractMismatch ?? false,
      publicationPublishedAt: surface.publication?.publication.publishedAt ?? null,
      publicationReason: surface.publication?.publication.publicationReason ?? null,
      latestSliceState: surface.latestSlice?.state ?? null,
      sliceValidationStatus: surface.publication?.sliceVersion.validationStatus ?? null,
      sliceStatus: surface.publication?.sliceVersion.status ?? null,
      latestSliceValidationStatus: surface.latestSlice?.validationStatus ?? null,
      latestSliceStatus: surface.latestSlice?.status ?? null,
      latestFailure: surface.latestFailure ?? null,
    })),
    refreshRecommendation: operatorGuidance.recommendation,
    operatorGuidance,
  };
}

export function buildMetaStateCheckOutput(input: MetaAuthoritativeBusinessOpsSnapshot) {
  return {
    businessId: input.businessId,
    capturedAt: input.capturedAt,
    sourceManifestCounts: input.manifestCounts,
    d1FinalizeSla: input.d1FinalizeSla,
    validationFailures24h: input.validationFailures24h,
    lastSuccessfulPublishAt: input.lastSuccessfulPublishAt,
    progression: {
      queued: input.progression.queued,
      leased: input.progression.leased,
      published: input.progression.published,
      retryableFailed: input.progression.retryableFailed,
      repairBacklog: input.progression.repairBacklog,
      deadLetters: input.progression.deadLetter,
      staleLeases: input.progression.staleLeases,
    },
    latestPublishes: input.latestPublishes,
    recentFailures: input.recentFailures,
    recommendedFirstChecks: [
      "meta:state-check",
      "meta:verify-day",
      "meta:verify-publish",
    ],
  };
}

export function buildMetaPublishVerificationReport(input: MetaAuthoritativeDayVerification) {
  const accountSurface = input.surfaces.find((surface) => surface.surface === "account_daily");
  const campaignSurface = input.surfaces.find((surface) => surface.surface === "campaign_daily");
  const operatorGuidance = buildMetaAuthoritativeRecoveryGuidance(input);
  const publicationReady =
    input.verificationState === "finalized_verified" &&
    Boolean(accountSurface?.publication?.publication.activeSliceVersionId) &&
    Boolean(campaignSurface?.publication?.publication.activeSliceVersionId);
  const goNoGoReasons = [
    publicationReady ? null : "core publication pointer missing or not finalized_verified",
    input.verificationState === "blocked"
      ? "publication mismatch is blocked pending operator diagnosis"
      : null,
    input.deadLetters > 0 ? "dead letters present" : null,
    input.staleLeases > 0 ? "stale leases present" : null,
    input.lastFailure?.reason ? `last failure: ${input.lastFailure.reason}` : null,
    ...(input.detectorReasonCodes ?? []).map((code) => `detector: ${code}`),
  ].filter((value): value is string => Boolean(value));

  return {
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    day: input.day,
    verificationState: input.verificationState,
    detectorReasonCodes: input.detectorReasonCodes ?? [],
    publicationReady,
    activePublication: input.activePublication,
    sourceManifestState: input.sourceManifestState,
    validationState: input.validationState,
    progression: {
      queued: input.queuedPartitions,
      leased: input.leasedPartitions,
      repairBacklog: input.repairBacklog,
      deadLetters: input.deadLetters,
      staleLeases: input.staleLeases,
    },
    goNoGo: {
      passed: goNoGoReasons.length === 0,
      reasons: goNoGoReasons,
    },
    operatorGuidance,
  };
}

export function buildMetaSoakSnapshotOutput(input: {
  businessId: string;
  capturedAt: string;
  sinceIso?: string | null;
  authoritative: MetaAuthoritativeBusinessOpsSnapshot;
  progressDiff?: {
    states?: Array<Record<string, unknown>>;
    partitions?: Array<Record<string, unknown>>;
  } | null;
}) {
  const authoritative = buildMetaStateCheckOutput(input.authoritative);
  return {
    businessId: input.businessId,
    capturedAt: input.capturedAt,
    sinceIso: input.sinceIso ?? null,
    authoritative,
    progressDiff: input.progressDiff ?? null,
    soakSignals: {
      d1SlaBreaches: input.authoritative.d1FinalizeSla.breachedAccounts,
      validationFailures24h: input.authoritative.validationFailures24h,
      publishedProgression: input.authoritative.progression.published,
      queueDepth: input.authoritative.progression.queued,
      leasedDepth: input.authoritative.progression.leased,
      repairBacklog: input.authoritative.progression.repairBacklog,
      lastSuccessfulPublishAt: input.authoritative.lastSuccessfulPublishAt,
    },
  };
}
