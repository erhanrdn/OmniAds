import { getDb, type DbClient } from "@/lib/db";
import {
  DEFAULT_CREATIVE_CANONICAL_THRESHOLDS,
  creativeCanonicalActionDistance,
  type CreativeCanonicalAction,
  type CreativeCanonicalActionReadiness,
  type CreativeCanonicalDecision,
  type CreativeCanonicalThresholds,
} from "@/lib/creative-canonical-decision";

export type CreativeDecisionOverrideStrength = "minor" | "strong";
export type CreativeDecisionOverrideSeverity = "low" | "medium" | "high" | "critical";

export interface CreativeCalibrationKey {
  businessId: string;
  adAccountId: string;
  objectiveFamily: string;
  formatFamily: string;
  calibrationVersion?: string | null;
}

export interface CreativeDecisionOverrideEventInput {
  businessId: string;
  adAccountId?: string | null;
  objectiveFamily?: string | null;
  formatFamily?: string | null;
  creativeId: string;
  snapshotId?: string | null;
  modelDecision: CreativeCanonicalDecision;
  userAction: CreativeCanonicalAction;
  userReadiness?: CreativeCanonicalActionReadiness;
  userStrength: CreativeDecisionOverrideStrength;
  reasonChip?: string | null;
  surface?: string | null;
  metricsHash?: string | null;
  spend?: number | null;
  purchases?: number | null;
  calibrationVersionId?: string | null;
  createdBy?: string | null;
}

export interface CreativeCalibrationVersionInput {
  businessId?: string | null;
  adAccountId?: string | null;
  objectiveFamily?: string | null;
  formatFamily?: string | null;
  calibrationVersion?: string | null;
  segmentKey?: string | null;
  algorithm: "grid_search" | "hierarchical_bayesian_stub" | "manual";
  thresholds: CreativeCanonicalThresholds;
  trainingSetRef?: string | null;
  holdoutSetRef?: string | null;
  metrics: Record<string, unknown>;
}

export interface ActiveCreativeCalibrationThresholds {
  id: string;
  businessId: string;
  calibrationVersionId: string;
  thresholds: CreativeCanonicalThresholds;
  sampleSize: number;
  weightedAgreement: number | null;
  weightedKappa: number | null;
  severeErrorRate: number | null;
  stale: boolean;
  staleReasons: string[];
}

function db(client?: DbClient) {
  return client ?? getDb();
}

function keyValue(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

export function normalizeCreativeCalibrationKey(input: Partial<CreativeCalibrationKey> & { businessId: string }) {
  return {
    businessId: input.businessId,
    adAccountId: keyValue(input.adAccountId, "account_default"),
    objectiveFamily: keyValue(input.objectiveFamily, "objective_default"),
    formatFamily: keyValue(input.formatFamily, "format_default"),
    calibrationVersion: keyValue(input.calibrationVersion, DEFAULT_CREATIVE_CANONICAL_THRESHOLDS.version),
  } satisfies Required<CreativeCalibrationKey>;
}

export function creativeDecisionOverrideSeverity(input: {
  modelAction: CreativeCanonicalAction,
  modelReadiness: CreativeCanonicalActionReadiness,
  userAction: CreativeCanonicalAction,
  userReadiness?: CreativeCanonicalActionReadiness,
}): CreativeDecisionOverrideSeverity {
  const model = `${input.modelAction}:${input.modelReadiness}`;
  const user = `${input.userAction}:${input.userReadiness ?? "ready"}`;
  if (
    (input.modelAction === "scale" && input.userAction === "cut") ||
    (input.modelAction === "cut" && input.userAction === "scale") ||
    (model === "diagnose:blocked" && (input.userAction === "scale" || input.userAction === "protect")) ||
    (user === "diagnose:blocked" && (input.modelAction === "scale" || input.modelAction === "protect"))
  ) {
    return "critical";
  }
  if (
    (input.modelAction === "scale" && user === "diagnose:blocked") ||
    (input.userAction === "scale" && model === "diagnose:blocked") ||
    (input.modelAction === "cut" && input.userAction === "protect") ||
    (input.modelAction === "protect" && input.userAction === "cut")
  ) {
    return "high";
  }
  if (
    (input.modelAction === "scale" && input.userAction === "protect") ||
    (input.modelAction === "protect" && input.userAction === "scale") ||
    (input.modelAction === "refresh" && input.userAction === "test_more") ||
    (input.modelAction === "test_more" && input.userAction === "refresh") ||
    (input.modelAction === "refresh" && input.userAction === "protect") ||
    (input.modelAction === "protect" && input.userAction === "refresh")
  ) {
    return "medium";
  }
  if (
    (input.modelAction === "test_more" && input.userAction === "diagnose" && input.userReadiness !== "blocked") ||
    (input.modelAction === "diagnose" && input.modelReadiness !== "blocked" && input.userAction === "test_more")
  ) {
    return "low";
  }
  return input.modelAction === input.userAction ? "low" : "medium";
}

function shouldQueueRealtimeOverride(input: {
  severity: CreativeDecisionOverrideSeverity;
  confidence: number;
  spend?: number | null;
  purchases?: number | null;
}) {
  return (
    input.severity === "critical" &&
    input.confidence >= 0.72 &&
    Number(input.spend ?? 0) > 200 &&
    Number(input.purchases ?? 0) > 4
  );
}

function calibrationStaleReasons(input: {
  sampleSize: number;
  activatedAt?: string | Date | null;
  currentObjectiveFamily?: string | null;
  calibrationObjectiveFamily?: string | null;
  currentFormatFamily?: string | null;
  calibrationFormatFamily?: string | null;
}) {
  const reasons: string[] = [];
  if (input.sampleSize < 20) reasons.push("low_feedback_rows");
  const activated = input.activatedAt ? new Date(input.activatedAt).getTime() : NaN;
  if (!Number.isFinite(activated) || Date.now() - activated > 60 * 24 * 60 * 60 * 1000) {
    reasons.push("older_than_60_days");
  }
  if (
    input.currentObjectiveFamily &&
    input.calibrationObjectiveFamily &&
    input.currentObjectiveFamily !== input.calibrationObjectiveFamily
  ) {
    reasons.push("objective_family_changed");
  }
  if (
    input.currentFormatFamily &&
    input.calibrationFormatFamily &&
    input.currentFormatFamily !== input.calibrationFormatFamily
  ) {
    reasons.push("format_mix_changed");
  }
  return reasons;
}

export async function getActiveCreativeCalibrationThresholds(
  businessIdOrKey: string | (Partial<CreativeCalibrationKey> & { businessId: string }),
  client?: DbClient,
): Promise<ActiveCreativeCalibrationThresholds | null> {
  const key = typeof businessIdOrKey === "string"
    ? normalizeCreativeCalibrationKey({ businessId: businessIdOrKey })
    : normalizeCreativeCalibrationKey(businessIdOrKey);
  const rows = await db(client).query<{
    id: string;
    business_id: string;
    ad_account_id: string | null;
    objective_family: string | null;
    format_family: string | null;
    calibration_version_id: string;
    thresholds_json: CreativeCanonicalThresholds;
    sample_size: number;
    weighted_agreement: number | null;
    weighted_kappa: number | null;
    severe_error_rate: number | null;
    activated_at: string | Date | null;
  }>(
    `
      SELECT
        id,
        business_id,
        ad_account_id,
        objective_family,
        format_family,
        calibration_version_id,
        thresholds_json,
        sample_size,
        weighted_agreement,
        weighted_kappa,
        severe_error_rate,
        activated_at
      FROM calibration_thresholds_by_business
      WHERE business_id = $1
        AND ad_account_id = $2
        AND objective_family = $3
        AND format_family = $4
        AND retired_at IS NULL
      ORDER BY activated_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `,
    [key.businessId, key.adAccountId, key.objectiveFamily, key.formatFamily],
  );
  const row = rows[0];
  if (!row) return null;
  const staleReasons = calibrationStaleReasons({
    sampleSize: Number(row.sample_size ?? 0),
    activatedAt: row.activated_at,
    currentObjectiveFamily: key.objectiveFamily,
    calibrationObjectiveFamily: row.objective_family,
    currentFormatFamily: key.formatFamily,
    calibrationFormatFamily: row.format_family,
  });
  const stale = staleReasons.length > 0;
  return {
    id: row.id,
    businessId: row.business_id,
    calibrationVersionId: row.calibration_version_id,
    thresholds: {
      ...DEFAULT_CREATIVE_CANONICAL_THRESHOLDS,
      ...(stale ? {} : row.thresholds_json),
      feedbackCount: stale ? 0 : Number(row.sample_size ?? 0),
      calibrationStaleReasons: stale ? staleReasons : [],
    },
    sampleSize: Number(row.sample_size ?? 0),
    weightedAgreement: row.weighted_agreement,
    weightedKappa: row.weighted_kappa,
    severeErrorRate: row.severe_error_rate,
    stale,
    staleReasons,
  };
}

export async function recordCreativeDecisionOverrideEvent(
  input: CreativeDecisionOverrideEventInput,
  client?: DbClient,
) {
  const modelAction = input.modelDecision.action;
  const actionDistance = creativeCanonicalActionDistance(modelAction, input.userAction);
  const severity = creativeDecisionOverrideSeverity({
    modelAction,
    modelReadiness: input.modelDecision.actionReadiness,
    userAction: input.userAction,
    userReadiness: input.userReadiness,
  });
  const queuedAt = shouldQueueRealtimeOverride({
    severity,
    confidence: input.modelDecision.confidence.value,
    spend: input.spend,
    purchases: input.purchases,
  }) ? new Date().toISOString() : null;

  const rows = await db(client).query<{ id: string }>(
    `
      INSERT INTO decision_override_events (
        business_id,
        ad_account_id,
        objective_family,
        format_family,
        creative_id,
        snapshot_id,
        model_action,
        model_readiness,
        model_confidence,
        user_action,
        user_strength,
        reason_chip,
        action_distance,
        severity,
        surface,
        metrics_hash,
        calibration_version_id,
        created_by,
        queued_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING id
    `,
    [
      input.businessId,
      keyValue(input.adAccountId, "account_default"),
      keyValue(input.objectiveFamily, "objective_default"),
      keyValue(input.formatFamily, "format_default"),
      input.creativeId,
      input.snapshotId ?? null,
      modelAction,
      input.modelDecision.actionReadiness satisfies CreativeCanonicalActionReadiness,
      input.modelDecision.confidence.value,
      input.userAction,
      input.userStrength,
      input.reasonChip ?? null,
      actionDistance,
      severity,
      input.surface ?? null,
      input.metricsHash ?? null,
      input.calibrationVersionId ?? null,
      input.createdBy ?? null,
      queuedAt,
    ],
  );
  return {
    id: rows[0]?.id ?? null,
    severity,
    actionDistance,
    queued: queuedAt !== null,
    batch: queuedAt === null ? "weekly" : "realtime",
  };
}

export async function createCreativeCalibrationVersion(
  input: CreativeCalibrationVersionInput,
  client?: DbClient,
) {
  const rows = await db(client).query<{ id: string }>(
    `
      INSERT INTO calibration_versions (
        business_id,
        ad_account_id,
        objective_family,
        format_family,
        calibration_version,
        segment_key,
        algorithm,
        thresholds_json,
        training_set_ref,
        holdout_set_ref,
        metrics_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11::jsonb)
      RETURNING id
    `,
    [
      input.businessId ?? null,
      keyValue(input.adAccountId, "account_default"),
      keyValue(input.objectiveFamily, "objective_default"),
      keyValue(input.formatFamily, "format_default"),
      keyValue(input.calibrationVersion, input.thresholds.version),
      input.segmentKey ?? null,
      input.algorithm,
      JSON.stringify(input.thresholds),
      input.trainingSetRef ?? null,
      input.holdoutSetRef ?? null,
      JSON.stringify(input.metrics),
    ],
  );
  return rows[0]?.id ?? null;
}

export async function activateCreativeCalibrationThresholds(input: {
  businessId: string;
  adAccountId?: string | null;
  objectiveFamily?: string | null;
  formatFamily?: string | null;
  calibrationVersionId: string;
  thresholds: CreativeCanonicalThresholds;
  source: string;
  sampleSize: number;
  weightedAgreement?: number | null;
  weightedKappa?: number | null;
  severeErrorRate?: number | null;
}, client?: DbClient) {
  const sql = db(client);
  await sql.query(
    `
      UPDATE calibration_thresholds_by_business
      SET retired_at = now()
      WHERE business_id = $1
        AND ad_account_id = $2
        AND objective_family = $3
        AND format_family = $4
        AND retired_at IS NULL
    `,
    [
      input.businessId,
      keyValue(input.adAccountId, "account_default"),
      keyValue(input.objectiveFamily, "objective_default"),
      keyValue(input.formatFamily, "format_default"),
    ],
  );
  const rows = await sql.query<{ id: string }>(
    `
      INSERT INTO calibration_thresholds_by_business (
        business_id,
        ad_account_id,
        objective_family,
        format_family,
        calibration_version_id,
        persona,
        thresholds_json,
        source,
        sample_size,
        weighted_agreement,
        weighted_kappa,
        severe_error_rate,
        activated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, now())
      RETURNING id
    `,
    [
      input.businessId,
      keyValue(input.adAccountId, "account_default"),
      keyValue(input.objectiveFamily, "objective_default"),
      keyValue(input.formatFamily, "format_default"),
      input.calibrationVersionId,
      input.thresholds.persona,
      JSON.stringify(input.thresholds),
      input.source,
      input.sampleSize,
      input.weightedAgreement ?? null,
      input.weightedKappa ?? null,
      input.severeErrorRate ?? null,
    ],
  );
  return rows[0]?.id ?? null;
}
