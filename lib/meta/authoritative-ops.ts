import type {
  MetaAuthoritativeBusinessOpsSnapshot,
  MetaAuthoritativeDayVerification,
} from "@/lib/meta/warehouse-types";

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
  >,
) {
  if (input.deadLetters > 0) {
    return "replay_dead_letter";
  }
  if (input.staleLeases > 0) {
    return "cleanup_then_reschedule";
  }
  if (input.verificationState === "failed" || input.verificationState === "repair_required") {
    return "reschedule_authoritative_refresh";
  }
  if (input.leasedPartitions > 0) {
    return "wait_for_active_worker";
  }
  if (input.queuedPartitions > 0 || input.repairBacklog > 0) {
    return "refresh_state_then_reschedule";
  }
  if (input.sourceManifestState === "missing" || input.sourceManifestState === "failed") {
    return "manual_refresh_finalize_range";
  }
  return "none";
}

export function buildMetaVerifyDayReport(input: MetaAuthoritativeDayVerification) {
  return {
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    day: input.day,
    sourceManifestState: input.sourceManifestState,
    validationState: input.validationState,
    verificationState: input.verificationState,
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
      publicationPublishedAt: surface.publication?.publication.publishedAt ?? null,
      publicationReason: surface.publication?.publication.publicationReason ?? null,
      sliceValidationStatus: surface.publication?.sliceVersion.validationStatus ?? null,
      sliceStatus: surface.publication?.sliceVersion.status ?? null,
    })),
    refreshRecommendation: getMetaAuthoritativeRefreshRecommendation(input),
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
  };
}

export function buildMetaPublishVerificationReport(input: MetaAuthoritativeDayVerification) {
  const accountSurface = input.surfaces.find((surface) => surface.surface === "account_daily");
  const campaignSurface = input.surfaces.find((surface) => surface.surface === "campaign_daily");
  const publicationReady =
    input.verificationState === "finalized_verified" &&
    Boolean(accountSurface?.publication?.publication.activeSliceVersionId) &&
    Boolean(campaignSurface?.publication?.publication.activeSliceVersionId);
  const goNoGoReasons = [
    publicationReady ? null : "core publication pointer missing or not finalized_verified",
    input.deadLetters > 0 ? "dead letters present" : null,
    input.staleLeases > 0 ? "stale leases present" : null,
    input.lastFailure?.reason ? `last failure: ${input.lastFailure.reason}` : null,
  ].filter((value): value is string => Boolean(value));

  return {
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    day: input.day,
    verificationState: input.verificationState,
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
