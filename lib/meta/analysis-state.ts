import type { MetaDecisionOsV1Response } from "@/lib/meta/decision-os";
import type {
  MetaRecommendationAnalysisSourceSystem,
  MetaRecommendationsResponse,
} from "@/lib/meta/recommendations";

export type MetaAnalysisState =
  | "not_run"
  | "running"
  | "decision_os_ready"
  | "decision_os_degraded"
  | "recommendation_fallback"
  | "error";

export type MetaDecisionOsDisplayStatus =
  | "not_run"
  | "running"
  | "ready"
  | "degraded"
  | "error"
  | "mismatch";

export type MetaRecommendationSourceSystem =
  | MetaRecommendationAnalysisSourceSystem
  | "none"
  | "unknown";

export type MetaPresentationMode =
  | "decision_os_primary"
  | "decision_os_recommendation_context"
  | "fallback_context"
  | "demo_context"
  | "no_guidance"
  | "loading"
  | "error";

export interface MetaAnalysisRunRange {
  businessId: string;
  startDate: string;
  endDate: string;
}

export interface MetaAnalysisStatus {
  state: MetaAnalysisState;
  decisionOsStatus: MetaDecisionOsDisplayStatus;
  decisionOsLabel: string;
  recommendationSource: MetaRecommendationSourceSystem;
  recommendationSourceLabel: string;
  presentationMode: MetaPresentationMode;
  presentationModeLabel: string;
  isAnalysisRunning: boolean;
  message: string;
  detailReasons: string[];
  safeErrorMessage: string | null;
  rangeMismatch: boolean;
  analyzedRangeLabel: string | null;
  lastAnalyzedAtIso: string | null;
}

export interface DeriveMetaAnalysisStatusInput {
  businessId: string | null;
  startDate: string | null;
  endDate: string | null;
  recommendationsData?: MetaRecommendationsResponse | null;
  recommendationsError?: unknown;
  recommendationsIsFetching: boolean;
  decisionOsData?: MetaDecisionOsV1Response | null;
  decisionOsError?: unknown;
  decisionOsIsFetching: boolean;
  lastAnalyzedAt?: Date | string | null;
  lastAnalyzedRange?: MetaAnalysisRunRange | null;
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function hasOwnString(
  value: unknown,
  key: "businessId" | "startDate" | "endDate",
): value is Record<typeof key, string> {
  return (
    value !== null &&
    typeof value === "object" &&
    key in value &&
    typeof (value as Record<typeof key, unknown>)[key] === "string"
  );
}

function normalizeDateOnly(value: string) {
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : trimmed;
}

function responseRangeMismatch(
  response: unknown,
  expected: MetaAnalysisRunRange | null,
) {
  if (!expected) return false;
  if (hasOwnString(response, "businessId") && response.businessId !== expected.businessId) {
    return true;
  }
  if (
    hasOwnString(response, "startDate") &&
    normalizeDateOnly(response.startDate) !== normalizeDateOnly(expected.startDate)
  ) {
    return true;
  }
  if (
    hasOwnString(response, "endDate") &&
    normalizeDateOnly(response.endDate) !== normalizeDateOnly(expected.endDate)
  ) {
    return true;
  }
  return false;
}

function responseMatchesRunRange(
  response: unknown,
  expected: MetaAnalysisRunRange | null,
) {
  return (
    Boolean(expected) &&
    hasOwnString(response, "businessId") &&
    hasOwnString(response, "startDate") &&
    hasOwnString(response, "endDate") &&
    !responseRangeMismatch(response, expected)
  );
}

export function getMetaRecommendationSource(
  recommendationsData?: MetaRecommendationsResponse | null,
): MetaRecommendationSourceSystem {
  if (!recommendationsData) return "none";
  const system = recommendationsData?.analysisSource?.system;
  if (system === "decision_os" || system === "snapshot_fallback" || system === "demo") {
    return system;
  }
  if (recommendationsData?.sourceModel === "decision_os_unified") {
    return "decision_os";
  }
  if (recommendationsData?.sourceModel === "snapshot_heuristics") {
    return "snapshot_fallback";
  }
  return "unknown";
}

function sourceLabel(source: MetaRecommendationSourceSystem) {
  switch (source) {
    case "decision_os":
      return "Decision OS";
    case "snapshot_fallback":
      return "Snapshot fallback";
    case "demo":
      return "Demo";
    case "none":
      return "None";
    default:
      return "Unknown";
  }
}

export function getMetaDecisionOsDegradedReasons(
  decisionOsData?: MetaDecisionOsV1Response | null,
) {
  if (!decisionOsData) return [];
  const authority = decisionOsData.authority;
  const commercialTruth = decisionOsData.commercialTruthCoverage;
  const summary = decisionOsData.summary;
  const degradedCount = summary.surfaceSummary?.degradedCount ?? 0;
  const sourceHealthReasons =
    summary.sourceHealth
      ?.filter((entry) => entry.status !== "healthy")
      .map((entry) => `${entry.source}: ${entry.detail}`) ?? [];
  return unique([
    authority?.truthState && authority.truthState !== "live_confident"
      ? `Authority truth state is ${authority.truthState.replaceAll("_", " ")}.`
      : null,
    authority?.completeness && authority.completeness !== "complete"
      ? `Authority evidence is ${authority.completeness}.`
      : null,
    authority?.freshness?.status &&
    authority.freshness.status !== "fresh" &&
    authority.freshness.status !== "partial"
      ? `Authority freshness is ${authority.freshness.status}.`
      : null,
    ...(authority?.missingInputs ?? []).map((input) => `Missing input: ${input}.`),
    ...(commercialTruth?.missingInputs ?? []).map((input) => `Missing truth: ${input}.`),
    degradedCount > 0
      ? `${degradedCount} decisions are trust-capped.`
      : null,
    summary.readReliability?.status && summary.readReliability.status !== "stable"
      ? `Read reliability is ${summary.readReliability.status}.`
      : null,
    ...sourceHealthReasons,
    ...(authority?.reasons ?? []),
  ]);
}

function decisionOsLabel(status: MetaDecisionOsDisplayStatus) {
  switch (status) {
    case "running":
      return "Running";
    case "ready":
      return "Ready";
    case "degraded":
      return "Degraded";
    case "error":
      return "Error";
    case "mismatch":
      return "Mismatch";
    default:
      return "Not run";
  }
}

function presentationModeLabel(mode: MetaPresentationMode) {
  switch (mode) {
    case "decision_os_primary":
      return "Decision OS primary";
    case "decision_os_recommendation_context":
      return "Decision OS recommendation context";
    case "fallback_context":
      return "Fallback context";
    case "demo_context":
      return "Demo context";
    case "loading":
      return "Loading";
    case "error":
      return "Error";
    default:
      return "No guidance";
  }
}

function analyzedRangeLabel(
  range: MetaAnalysisRunRange | null | undefined,
) {
  if (!range) return null;
  return `${range.startDate} to ${range.endDate}`;
}

function lastAnalyzedAtIso(value: Date | string | null | undefined) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.toISOString();
}

export function deriveMetaAnalysisStatus(
  input: DeriveMetaAnalysisStatusInput,
): MetaAnalysisStatus {
  const expectedRange =
    input.businessId && input.startDate && input.endDate
      ? {
          businessId: input.businessId,
          startDate: input.startDate,
          endDate: input.endDate,
        }
      : null;
  const recommendationSource = getMetaRecommendationSource(input.recommendationsData);
  const degradedReasons = getMetaDecisionOsDegradedReasons(input.decisionOsData);
  const recommendationRangeMismatch = responseRangeMismatch(input.recommendationsData, expectedRange);
  const decisionOsRangeMismatch = responseRangeMismatch(input.decisionOsData, expectedRange);
  const rangeMismatch = recommendationRangeMismatch || decisionOsRangeMismatch;
  const isRunning = input.recommendationsIsFetching || input.decisionOsIsFetching;
  const decisionOsStatus: MetaDecisionOsDisplayStatus = input.decisionOsIsFetching
    ? "running"
    : decisionOsRangeMismatch
      ? "mismatch"
      : input.decisionOsError
        ? "error"
        : input.decisionOsData
          ? degradedReasons.length > 0
            ? "degraded"
            : "ready"
          : "not_run";
  const presentationMode: MetaPresentationMode = isRunning
    ? "loading"
    : rangeMismatch || decisionOsStatus === "mismatch"
      ? "error"
      : recommendationSource === "snapshot_fallback"
        ? "fallback_context"
        : recommendationSource === "decision_os" && decisionOsStatus !== "ready"
          ? "decision_os_recommendation_context"
        : recommendationSource === "demo"
          ? "demo_context"
        : decisionOsStatus === "error"
          ? "error"
        : decisionOsStatus === "ready"
          ? "decision_os_primary"
          : "no_guidance";
  const base = {
    decisionOsStatus,
    decisionOsLabel: decisionOsLabel(decisionOsStatus),
    recommendationSource,
    recommendationSourceLabel: sourceLabel(recommendationSource),
    presentationMode,
    presentationModeLabel: presentationModeLabel(presentationMode),
    isAnalysisRunning: isRunning,
    analyzedRangeLabel: analyzedRangeLabel(input.lastAnalyzedRange),
    lastAnalyzedAtIso: lastAnalyzedAtIso(input.lastAnalyzedAt),
  };

  if (isRunning) {
    return {
      state: "running",
      ...base,
      message: "Analysis is running for the selected range.",
      detailReasons: [],
      safeErrorMessage: null,
      rangeMismatch: false,
    };
  }

  if (rangeMismatch) {
    return {
      state: "error",
      ...base,
      message: "Analysis response does not match the selected business or date range.",
      detailReasons: ["Selected range changed before the analysis response could be used."],
      safeErrorMessage: "Analysis could not complete safely. Run analysis again for this range.",
      rangeMismatch,
    };
  }

  if (recommendationSource === "snapshot_fallback") {
    return {
      state: "recommendation_fallback",
      ...base,
      message: "Showing snapshot fallback. Decision OS did not produce an authoritative response.",
      detailReasons: unique([input.recommendationsData?.analysisSource?.fallbackReason]),
      safeErrorMessage: null,
      rangeMismatch: false,
    };
  }

  if (input.decisionOsError) {
    return {
      state: "error",
      ...base,
      message:
        recommendationSource === "decision_os"
          ? "Recommendation source is Decision OS, but the Decision OS surface failed to load."
          : "Decision OS surface could not complete safely.",
      detailReasons: [],
      safeErrorMessage: "Analysis could not complete safely. Run analysis again for this range.",
      rangeMismatch: false,
    };
  }

  if (input.recommendationsError && recommendationSource === "none" && decisionOsStatus === "not_run") {
    return {
      state: "error",
      ...base,
      message: "Recommendations could not complete safely.",
      detailReasons: [],
      safeErrorMessage: "Analysis could not complete safely. Run analysis again for this range.",
      rangeMismatch: false,
    };
  }

  if (decisionOsStatus === "degraded") {
    return {
      state: "decision_os_degraded",
      ...base,
      message: "Decision OS returned degraded authority for this range.",
      detailReasons: degradedReasons,
      safeErrorMessage: null,
      rangeMismatch: false,
    };
  }

  if (decisionOsStatus === "ready") {
    return {
      state: "decision_os_ready",
      ...base,
      message: "Decision OS guidance is available for this range.",
      detailReasons: [],
      safeErrorMessage: null,
      rangeMismatch: false,
    };
  }

  if (recommendationSource === "decision_os") {
    return {
      state: "not_run",
      ...base,
      message: "Recommendation source is Decision OS, but the Decision OS surface is not loaded for this range.",
      detailReasons: [],
      safeErrorMessage: null,
      rangeMismatch: false,
    };
  }

  if (recommendationSource === "demo") {
    return {
      state: "not_run",
      ...base,
      message: "Showing demo recommendation context for this range.",
      detailReasons: [],
      safeErrorMessage: null,
      rangeMismatch: false,
    };
  }

  return {
    state: "not_run",
    ...base,
    message: "Run analysis to generate Decision OS guidance.",
    detailReasons: [],
    safeErrorMessage: null,
    rangeMismatch: false,
  };
}

export interface MetaAnalysisQueryRefetchResult<T> {
  data?: T | null;
  error?: unknown;
  status?: string;
  isError?: boolean;
}

function refetchResultSucceeded<T>(result: MetaAnalysisQueryRefetchResult<T>) {
  return !result.error && result.status !== "error" && result.isError !== true;
}

export function isUsableMetaRecommendationsResponse(
  value: unknown,
): value is MetaRecommendationsResponse {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as { status?: unknown }).status === "ok" &&
    Array.isArray((value as { recommendations?: unknown }).recommendations)
  );
}

export function isUsableMetaDecisionOsResponse(
  value: unknown,
): value is MetaDecisionOsV1Response {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as { contractVersion?: unknown }).contractVersion === "meta-decision-os.v1"
  );
}

export function didMetaAnalysisRefetchProduceUsableData(input: {
  recommendationsResult: MetaAnalysisQueryRefetchResult<MetaRecommendationsResponse>;
  decisionOsResult: MetaAnalysisQueryRefetchResult<MetaDecisionOsV1Response | null>;
  expectedRange: {
    businessId: string | null | undefined;
    startDate: string;
    endDate: string;
  };
}) {
  const expectedRange =
    input.expectedRange.businessId &&
    input.expectedRange.startDate &&
    input.expectedRange.endDate
      ? {
          businessId: input.expectedRange.businessId,
          startDate: input.expectedRange.startDate,
          endDate: input.expectedRange.endDate,
        }
      : null;
  const recommendationsUsable =
    refetchResultSucceeded(input.recommendationsResult) &&
    isUsableMetaRecommendationsResponse(input.recommendationsResult.data);
  const decisionOsUsable =
    refetchResultSucceeded(input.decisionOsResult) &&
    isUsableMetaDecisionOsResponse(input.decisionOsResult.data);
  const recommendationsMatches =
    recommendationsUsable &&
    responseMatchesRunRange(input.recommendationsResult.data, expectedRange);
  const decisionOsMatches =
    decisionOsUsable &&
    responseMatchesRunRange(input.decisionOsResult.data, expectedRange);

  if (
    (recommendationsUsable && !recommendationsMatches) ||
    (decisionOsUsable && !decisionOsMatches)
  ) {
    return false;
  }

  return recommendationsMatches || decisionOsMatches;
}
