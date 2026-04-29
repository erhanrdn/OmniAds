import { getDb, type DbClient } from "@/lib/db";
import type { CreativeDecisionOverrideSeverity } from "@/lib/creative-calibration-store";

export type CreativeCanonicalObservabilityStatus =
  | "ok"
  | "warning"
  | "hard_stop"
  | "insufficient_data";

export interface CreativeCanonicalObservabilityMetric<TValue = number> {
  value: TValue;
  denominator: number;
  threshold: {
    warning?: number | null;
    hardStop?: number | null;
    minimumDenominator?: number;
  };
  status: CreativeCanonicalObservabilityStatus;
}

export interface CreativeCanonicalObservabilityOptions {
  client?: DbClient;
  minimumDenominator?: number;
  warningThreshold?: number | null;
  hardStopThreshold?: number | null;
  modelConfidenceMin?: number | null;
  fromAction?: string | null;
  toNonAction?: string | null;
}

export interface CreativeCanonicalDecisionEventInput {
  businessId: string;
  creativeId?: string | null;
  snapshotId?: string | null;
  cohort: string;
  canonicalAction?: string | null;
  legacyAction?: string | null;
  actionReadiness?: string | null;
  confidenceValue?: number | null;
  reviewed?: boolean;
  fallbackRerunBadge?: boolean;
  llmCallCount?: number;
  llmCostUsd?: number;
  llmErrorCount?: number;
}

const DEFAULT_MINIMUM_DENOMINATOR = 30;

function db(client?: DbClient) {
  return client ?? getDb();
}

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function rounded(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

function statusForRate(input: {
  value: number;
  denominator: number;
  minimumDenominator: number;
  warningThreshold?: number | null;
  hardStopThreshold?: number | null;
}): CreativeCanonicalObservabilityStatus {
  if (input.denominator < input.minimumDenominator) return "insufficient_data";
  if (typeof input.hardStopThreshold === "number" && input.value > input.hardStopThreshold) {
    return "hard_stop";
  }
  if (typeof input.warningThreshold === "number" && input.value > input.warningThreshold) {
    return "warning";
  }
  return "ok";
}

function metric<TValue>(
  value: TValue,
  denominator: number,
  threshold: CreativeCanonicalObservabilityMetric["threshold"],
  status: CreativeCanonicalObservabilityStatus,
): CreativeCanonicalObservabilityMetric<TValue> {
  return { value, denominator, threshold, status };
}

function normalizeSeverityFilter(
  severityFilter: CreativeDecisionOverrideSeverity | CreativeDecisionOverrideSeverity[],
) {
  return Array.isArray(severityFilter) ? severityFilter : [severityFilter];
}

export async function computeOverrideRate(
  businessId: string,
  severityFilter: CreativeDecisionOverrideSeverity | CreativeDecisionOverrideSeverity[],
  windowDays: number,
  options: CreativeCanonicalObservabilityOptions = {},
) {
  const minimumDenominator = options.minimumDenominator ?? DEFAULT_MINIMUM_DENOMINATOR;
  const severities = normalizeSeverityFilter(severityFilter);
  const params = [
    businessId,
    severities,
    Math.max(1, windowDays),
    options.modelConfidenceMin ?? null,
    options.fromAction ?? null,
    options.toNonAction ?? null,
  ];
  const [numeratorRows, denominatorRows] = await Promise.all([
    db(options.client).query<{ count: string | number }>(
      `
        SELECT COUNT(*) AS count
        FROM decision_override_events
        WHERE business_id = $1
          AND severity = ANY($2::text[])
          AND created_at >= now() - ($3::int * interval '1 day')
          AND ($4::double precision IS NULL OR model_confidence >= $4::double precision)
          AND ($5::text IS NULL OR model_action = $5::text)
          AND ($6::text IS NULL OR user_action <> $6::text)
      `,
      params,
    ),
    db(options.client).query<{ count: string | number }>(
      `
        SELECT COUNT(*) AS count
        FROM creative_canonical_decision_events
        WHERE business_id = $1
          AND reviewed = TRUE
          AND created_at >= now() - ($2::int * interval '1 day')
          AND ($3::text IS NULL OR canonical_action = $3::text)
      `,
      [businessId, Math.max(1, windowDays), options.fromAction ?? null],
    ),
  ]);
  const numerator = n(numeratorRows[0]?.count);
  const denominator = n(denominatorRows[0]?.count);
  const value = rounded(rate(numerator, denominator));
  const warningThreshold = options.warningThreshold ?? null;
  const hardStopThreshold = options.hardStopThreshold ?? null;
  return metric(
    value,
    denominator,
    { warning: warningThreshold, hardStop: hardStopThreshold, minimumDenominator },
    statusForRate({ value, denominator, minimumDenominator, warningThreshold, hardStopThreshold }),
  );
}

export async function computeActionDistributionDelta(
  businessId: string,
  cohortFilter: string | null,
  windowDays: number,
  options: CreativeCanonicalObservabilityOptions = {},
) {
  const minimumDenominator = options.minimumDenominator ?? DEFAULT_MINIMUM_DENOMINATOR;
  const rows = await db(options.client).query<{ delta_count: string | number; total_count: string | number }>(
    `
      SELECT
        COUNT(*) FILTER (WHERE canonical_action IS DISTINCT FROM legacy_action) AS delta_count,
        COUNT(*) AS total_count
      FROM creative_canonical_decision_events
      WHERE business_id = $1
        AND ($2::text IS NULL OR cohort = $2::text)
        AND created_at >= now() - ($3::int * interval '1 day')
    `,
    [businessId, cohortFilter, Math.max(1, windowDays)],
  );
  const numerator = n(rows[0]?.delta_count);
  const denominator = n(rows[0]?.total_count);
  const value = rounded(rate(numerator, denominator));
  return metric(
    value,
    denominator,
    { warning: options.warningThreshold ?? 0.2, hardStop: options.hardStopThreshold ?? null, minimumDenominator },
    statusForRate({
      value,
      denominator,
      minimumDenominator,
      warningThreshold: options.warningThreshold ?? 0.2,
      hardStopThreshold: options.hardStopThreshold ?? null,
    }),
  );
}

export async function computeReadinessDistribution(
  businessId: string,
  windowHours: number,
  options: CreativeCanonicalObservabilityOptions = {},
) {
  const rows = await db(options.client).query<{ action_readiness: string; count: string | number }>(
    `
      SELECT action_readiness, COUNT(*) AS count
      FROM creative_canonical_decision_events
      WHERE business_id = $1
        AND created_at >= now() - ($2::int * interval '1 hour')
      GROUP BY action_readiness
    `,
    [businessId, Math.max(1, windowHours)],
  );
  const value = Object.fromEntries(rows.map((row) => [row.action_readiness, n(row.count)]));
  const denominator = Object.values(value).reduce((sum, item) => sum + item, 0);
  return metric(value, denominator, { minimumDenominator: 0 }, "ok");
}

export async function computeConfidenceHistogram(
  businessId: string,
  windowHours: number,
  options: CreativeCanonicalObservabilityOptions = {},
) {
  const rows = await db(options.client).query<{
    bucket_0_05: string | number;
    bucket_05_065: string | number;
    bucket_065_08: string | number;
    bucket_08_095: string | number;
    total_count: string | number;
  }>(
    `
      SELECT
        COUNT(*) FILTER (WHERE confidence_value >= 0 AND confidence_value < 0.5) AS bucket_0_05,
        COUNT(*) FILTER (WHERE confidence_value >= 0.5 AND confidence_value < 0.65) AS bucket_05_065,
        COUNT(*) FILTER (WHERE confidence_value >= 0.65 AND confidence_value < 0.8) AS bucket_065_08,
        COUNT(*) FILTER (WHERE confidence_value >= 0.8 AND confidence_value <= 0.95) AS bucket_08_095,
        COUNT(*) AS total_count
      FROM creative_canonical_decision_events
      WHERE business_id = $1
        AND created_at >= now() - ($2::int * interval '1 hour')
    `,
    [businessId, Math.max(1, windowHours)],
  );
  const row = rows[0] ?? {};
  return metric(
    {
      "0-0.5": n(row.bucket_0_05),
      "0.5-0.65": n(row.bucket_05_065),
      "0.65-0.8": n(row.bucket_065_08),
      "0.8-0.95": n(row.bucket_08_095),
    },
    n(row.total_count),
    { minimumDenominator: 0 },
    "ok",
  );
}

export async function computeFallbackBadgeRate(
  businessId: string,
  windowHours: number,
  options: CreativeCanonicalObservabilityOptions = {},
) {
  const minimumDenominator = options.minimumDenominator ?? DEFAULT_MINIMUM_DENOMINATOR;
  const rows = await db(options.client).query<{ fallback_count: string | number; total_count: string | number }>(
    `
      SELECT
        COUNT(*) FILTER (WHERE fallback_rerun_badge = TRUE) AS fallback_count,
        COUNT(*) AS total_count
      FROM creative_canonical_decision_events
      WHERE business_id = $1
        AND created_at >= now() - ($2::int * interval '1 hour')
    `,
    [businessId, Math.max(1, windowHours)],
  );
  const numerator = n(rows[0]?.fallback_count);
  const denominator = n(rows[0]?.total_count);
  const value = rounded(rate(numerator, denominator));
  const hardStopThreshold = options.hardStopThreshold ?? 0.1;
  return metric(
    value,
    denominator,
    { hardStop: hardStopThreshold, minimumDenominator },
    statusForRate({ value, denominator, minimumDenominator, hardStopThreshold }),
  );
}

export async function computeCriticalQueueVolume(
  businessId: string,
  windowHours: number,
  options: CreativeCanonicalObservabilityOptions = {},
) {
  const rows = await db(options.client).query<{ count: string | number }>(
    `
      SELECT COUNT(*) AS count
      FROM decision_override_events
      WHERE business_id = $1
        AND severity = 'critical'
        AND queued_at IS NOT NULL
        AND queued_at >= now() - ($2::int * interval '1 hour')
    `,
    [businessId, Math.max(1, windowHours)],
  );
  const value = n(rows[0]?.count);
  return metric(value, value, { warning: options.warningThreshold ?? 1, hardStop: null }, value > 0 ? "warning" : "ok");
}

export async function computeLLMUsage(
  businessId: string,
  windowHours: number,
  options: CreativeCanonicalObservabilityOptions = {},
) {
  const rows = await db(options.client).query<{
    call_count: string | number;
    error_count: string | number;
    cost_usd: string | number;
  }>(
    `
      SELECT
        COALESCE(SUM(llm_call_count), 0) AS call_count,
        COALESCE(SUM(llm_error_count), 0) AS error_count,
        COALESCE(SUM(llm_cost_usd), 0) AS cost_usd
      FROM creative_canonical_decision_events
      WHERE business_id = $1
        AND created_at >= now() - ($2::int * interval '1 hour')
    `,
    [businessId, Math.max(1, windowHours)],
  );
  const row = rows[0] ?? {};
  const calls = n(row.call_count);
  const errors = n(row.error_count);
  const errorRate = rounded(rate(errors, calls));
  return metric(
    { calls, errors, costUsd: rounded(n(row.cost_usd)), errorRate },
    calls,
    { warning: options.warningThreshold ?? 0.05, hardStop: options.hardStopThreshold ?? 0.15, minimumDenominator: 1 },
    calls === 0
      ? "ok"
      : statusForRate({
        value: errorRate,
        denominator: calls,
        minimumDenominator: 1,
        warningThreshold: options.warningThreshold ?? 0.05,
        hardStopThreshold: options.hardStopThreshold ?? 0.15,
      }),
  );
}

export async function computeCanonicalObservabilitySummary(
  businessId: string,
  options: CreativeCanonicalObservabilityOptions = {},
) {
  const [
    criticalHighConfidenceOverrideRate,
    highPlusCriticalOverrideRate,
    allSevereOverrideRate,
    overdiagnoseOverrideRate,
    canonicalVsLegacyActionDelta,
    readinessDistribution,
    confidenceHistogram,
    fallbackRerunBadgeRate,
    criticalRealtimeQueueVolume,
    llmUsage,
  ] = await Promise.all([
    computeOverrideRate(businessId, "critical", 7, {
      ...options,
      modelConfidenceMin: 0.72,
      hardStopThreshold: 0.01,
    }),
    computeOverrideRate(businessId, ["critical", "high"], 7, {
      ...options,
      warningThreshold: 0.03,
    }),
    computeOverrideRate(businessId, ["critical", "high", "medium"], 7, {
      ...options,
      warningThreshold: 0.05,
    }),
    computeOverrideRate(businessId, ["low", "medium", "high", "critical"], 7, {
      ...options,
      fromAction: "diagnose",
      toNonAction: "diagnose",
      warningThreshold: 0.1,
      hardStopThreshold: 0.25,
    }),
    computeActionDistributionDelta(businessId, null, 7, options),
    computeReadinessDistribution(businessId, 24, options),
    computeConfidenceHistogram(businessId, 24, options),
    computeFallbackBadgeRate(businessId, 24, options),
    computeCriticalQueueVolume(businessId, 24, options),
    computeLLMUsage(businessId, 24, options),
  ]);

  return {
    businessId,
    criticalHighConfidenceOverrideRate,
    highPlusCriticalOverrideRate,
    allSevereOverrideRate,
    overdiagnoseOverrideRate,
    canonicalVsLegacyActionDelta,
    readinessDistribution,
    confidenceHistogram,
    fallbackRerunBadgeRate,
    criticalRealtimeQueueVolume,
    llmUsage,
  };
}

export async function recordCreativeCanonicalDecisionEvent(
  input: CreativeCanonicalDecisionEventInput,
  client?: DbClient,
) {
  const rows = await db(client).query<{ id: string }>(
    `
      INSERT INTO creative_canonical_decision_events (
        business_id,
        creative_id,
        snapshot_id,
        cohort,
        canonical_action,
        legacy_action,
        action_readiness,
        confidence_value,
        reviewed,
        fallback_rerun_badge,
        llm_call_count,
        llm_cost_usd,
        llm_error_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, TRUE), COALESCE($10, FALSE), $11, $12, $13)
      RETURNING id
    `,
    [
      input.businessId,
      input.creativeId ?? null,
      input.snapshotId ?? null,
      input.cohort,
      input.canonicalAction ?? null,
      input.legacyAction ?? null,
      input.actionReadiness ?? null,
      input.confidenceValue ?? null,
      input.reviewed ?? true,
      input.fallbackRerunBadge ?? false,
      input.llmCallCount ?? 0,
      input.llmCostUsd ?? 0,
      input.llmErrorCount ?? 0,
    ],
  );
  return rows[0]?.id ?? null;
}
