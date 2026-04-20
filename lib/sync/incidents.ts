import { getDb } from "@/lib/db";
import { assertDbSchemaReady } from "@/lib/db-schema-readiness";
import { resolveSyncControlPlaneKey } from "@/lib/sync/control-plane-key";
import type { SyncRepairPlanMode, SyncRepairRecommendation } from "@/lib/sync/repair-planner";
import type { SyncGateRecord } from "@/lib/sync/release-gates";

export type GlobalFaultClass =
  | "transient_dependency"
  | "lease_coordination"
  | "queue_starvation"
  | "dead_letter_backlog"
  | "retryable_partition_failure"
  | "checkpoint_stall"
  | "integrity_mismatch"
  | "publication_mismatch"
  | "auth_or_setup"
  | "provider_outage"
  | "poison_partition"
  | "unknown";

export type GlobalRepairClass =
  | "retry_only"
  | "reconcile_only"
  | "queue_repair"
  | "compensating_repair"
  | "quarantine_then_continue"
  | "manual_only";

export type OperationalSyncState =
  | "healthy"
  | SyncIncidentStatus;

export interface SyncIncidentDescriptor {
  resourceScope: string;
  faultClass: GlobalFaultClass;
  repairClass: GlobalRepairClass;
  faultSignature: string;
}

export interface SyncIncidentSummary {
  openCount: number;
  openCircuitCount: number;
  latestSeenAt: string | null;
  degradedServing: boolean;
  counts: Record<SyncIncidentStatus, number>;
}

export type SyncIncidentStatus =
  | "detected"
  | "eligible"
  | "repairing"
  | "cooldown"
  | "half_open"
  | "cleared"
  | "quarantined"
  | "exhausted"
  | "manual_required";

export interface SyncIncidentRecord {
  id: string;
  buildId: string;
  environment: string;
  providerScope: string;
  businessId: string;
  resourceScope: string;
  faultClass: string;
  faultSignature: string;
  status: SyncIncidentStatus;
  blockerClass: string | null;
  summary: string;
  observationCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  eligibleAt: string | null;
  repairingAt: string | null;
  cooldownUntil: string | null;
  halfOpenAt: string | null;
  clearedAt: string | null;
  quarantinedAt: string | null;
  exhaustedAt: string | null;
  manualRequiredAt: string | null;
  lastError: string | null;
  evidence: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertSyncIncidentInput {
  buildId?: string;
  environment?: string;
  providerScope: string;
  businessId: string;
  resourceScope?: string | null;
  faultClass: string;
  faultSignature: string;
  status: SyncIncidentStatus;
  blockerClass?: string | null;
  summary: string;
  eligibleAt?: string | null;
  repairingAt?: string | null;
  cooldownUntil?: string | null;
  halfOpenAt?: string | null;
  clearedAt?: string | null;
  quarantinedAt?: string | null;
  exhaustedAt?: string | null;
  manualRequiredAt?: string | null;
  lastError?: string | null;
  evidence?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  firstSeenAt?: string;
  lastSeenAt?: string;
}

export interface UpdateSyncIncidentInput {
  buildId?: string | null;
  environment?: string | null;
  providerScope?: string | null;
  businessId?: string | null;
  resourceScope?: string | null;
  faultClass?: string | null;
  faultSignature?: string | null;
  status?: SyncIncidentStatus | null;
  blockerClass?: string | null;
  summary?: string | null;
  observationCount?: number | null;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  eligibleAt?: string | null;
  repairingAt?: string | null;
  cooldownUntil?: string | null;
  halfOpenAt?: string | null;
  clearedAt?: string | null;
  quarantinedAt?: string | null;
  exhaustedAt?: string | null;
  manualRequiredAt?: string | null;
  lastError?: string | null;
  evidence?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface ListSyncIncidentsInput {
  buildId?: string;
  environment?: string;
  providerScope?: string;
  businessId?: string | null;
  resourceScope?: string | null;
  faultClass?: string | null;
  faultSignature?: string | null;
  statuses?: SyncIncidentStatus[] | null;
  sinceMinutes?: number;
  limit?: number;
}

async function assertSyncIncidentTablesReady(context: string) {
  await assertDbSchemaReady({
    tables: ["sync_incidents"],
    context,
  });
}

function nowIso() {
  return new Date().toISOString();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (!value || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function normalizeText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeTimestamp(value: unknown) {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

function normalizeJsonRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeStatus(value: unknown): SyncIncidentStatus {
  return value === "eligible" ||
    value === "repairing" ||
    value === "cooldown" ||
    value === "half_open" ||
    value === "cleared" ||
    value === "quarantined" ||
    value === "exhausted" ||
    value === "manual_required"
    ? value
    : "detected";
}

function mapIncidentRow(row: Record<string, unknown>): SyncIncidentRecord {
  return {
    id: String(row.id),
    buildId: String(row.build_id),
    environment: String(row.environment),
    providerScope: String(row.provider_scope),
    businessId: String(row.business_id),
    resourceScope: String(row.resource_scope ?? "business"),
    faultClass: String(row.fault_class),
    faultSignature: String(row.fault_signature),
    status: normalizeStatus(row.status),
    blockerClass: normalizeText(row.blocker_class),
    summary: normalizeText(row.summary) ?? "",
    observationCount:
      typeof row.observation_count === "number"
        ? row.observation_count
        : Number.parseInt(String(row.observation_count ?? 1), 10) || 1,
    firstSeenAt: normalizeTimestamp(row.first_seen_at) ?? nowIso(),
    lastSeenAt: normalizeTimestamp(row.last_seen_at) ?? nowIso(),
    eligibleAt: normalizeTimestamp(row.eligible_at),
    repairingAt: normalizeTimestamp(row.repairing_at),
    cooldownUntil: normalizeTimestamp(row.cooldown_until),
    halfOpenAt: normalizeTimestamp(row.half_open_at),
    clearedAt: normalizeTimestamp(row.cleared_at),
    quarantinedAt: normalizeTimestamp(row.quarantined_at),
    exhaustedAt: normalizeTimestamp(row.exhausted_at),
    manualRequiredAt: normalizeTimestamp(row.manual_required_at),
    lastError: normalizeText(row.last_error),
    evidence: normalizeJsonRecord(row.evidence_json),
    metadata: normalizeJsonRecord(row.metadata_json),
    createdAt: normalizeTimestamp(row.created_at) ?? nowIso(),
    updatedAt: normalizeTimestamp(row.updated_at) ?? nowIso(),
  };
}

function normalizeOptionalText(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalTimestamp(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeLimit(value: number | undefined) {
  if (!Number.isFinite(value) || !value) return 50;
  return Math.max(1, Math.min(250, Math.floor(value)));
}

function normalizeSinceMinutes(value: number | undefined) {
  if (!Number.isFinite(value) || !value) return 60;
  return Math.max(1, Math.floor(value));
}

function normalizeStatusList(statuses?: SyncIncidentStatus[] | null) {
  return statuses && statuses.length > 0 ? statuses : null;
}

function emptyIncidentCounts(): Record<SyncIncidentStatus, number> {
  return {
    detected: 0,
    eligible: 0,
    repairing: 0,
    cooldown: 0,
    half_open: 0,
    cleared: 0,
    quarantined: 0,
    exhausted: 0,
    manual_required: 0,
  };
}

type ReleaseGateCanaryRow = {
  businessId: string;
};

function normalizeCanaryBusinessIds(releaseGate: SyncGateRecord | null | undefined) {
  const raw = Array.isArray(releaseGate?.evidence?.canaries)
    ? (releaseGate?.evidence?.canaries as unknown[])
    : [];
  return Array.from(
    new Set(
      raw
        .map((row) =>
          row && typeof row === "object"
            ? String((row as ReleaseGateCanaryRow).businessId ?? "").trim()
            : "",
        )
        .filter(Boolean),
    ),
  );
}

export function buildSyncIncidentDescriptor(
  recommendation: SyncRepairRecommendation,
): SyncIncidentDescriptor {
  const blockerClass =
    typeof recommendation.blockerClass === "string"
      ? recommendation.blockerClass
      : null;
  const recommendedAction = recommendation.recommendedAction;

  let faultClass: GlobalFaultClass = "unknown";
  let repairClass: GlobalRepairClass = "manual_only";

  if (recommendedAction === "replay_dead_letter") {
    faultClass = "dead_letter_backlog";
    repairClass = "queue_repair";
  } else if (recommendedAction === "stale_lease_reclaim") {
    faultClass = "lease_coordination";
    repairClass = "queue_repair";
  } else if (recommendedAction === "integrity_repair_enqueue") {
    faultClass =
      blockerClass === "not_release_ready"
        ? "publication_mismatch"
        : "integrity_mismatch";
    repairClass = "compensating_repair";
  } else if (recommendedAction === "reschedule") {
    faultClass = "queue_starvation";
    repairClass = "retry_only";
  } else if (recommendedAction === "refresh_state") {
    faultClass =
      blockerClass === "queue_blocked"
        ? "queue_starvation"
        : blockerClass === "stalled"
          ? "checkpoint_stall"
          : blockerClass === "not_release_ready"
            ? "publication_mismatch"
            : "unknown";
    repairClass = "reconcile_only";
  }

  return {
    resourceScope: "business",
    faultClass,
    repairClass,
    faultSignature: stableStringify({
      blockerClass,
      recommendedAction,
    }),
  };
}

export function buildSyncRepairExecutionSignature(input: {
  providerScope: string;
  recommendation: SyncRepairRecommendation;
}) {
  const descriptor = buildSyncIncidentDescriptor(input.recommendation);
  return stableStringify({
    providerScope: input.providerScope,
    businessId: input.recommendation.businessId,
    resourceScope: descriptor.resourceScope,
    faultClass: descriptor.faultClass,
    faultSignature: descriptor.faultSignature,
  });
}

function deriveIncidentStatusFromPlan(input: {
  recommendation: SyncRepairRecommendation;
  planMode: SyncRepairPlanMode;
}) : SyncIncidentStatus {
  if (input.recommendation.safetyClassification === "blocked") {
    return "manual_required";
  }
  if (input.planMode === "auto_execute") return "eligible";
  if (input.planMode === "escalated_manual") return "manual_required";
  return "detected";
}

export async function upsertSyncIncident(input: UpsertSyncIncidentInput) {
  await assertSyncIncidentTablesReady("sync_incidents:upsert");
  const sql = getDb();
  const { buildId, environment } = resolveSyncControlPlaneKey({
    buildId: input.buildId,
    environment: input.environment,
    providerScope: input.providerScope,
  });
  const rows = await sql`
    INSERT INTO sync_incidents (
      build_id,
      environment,
      provider_scope,
      business_id,
      resource_scope,
      fault_class,
      fault_signature,
      status,
      blocker_class,
      summary,
      observation_count,
      first_seen_at,
      last_seen_at,
      eligible_at,
      repairing_at,
      cooldown_until,
      half_open_at,
      cleared_at,
      quarantined_at,
      exhausted_at,
      manual_required_at,
      last_error,
      evidence_json,
      metadata_json,
      created_at,
      updated_at
    )
    VALUES (
      ${buildId},
      ${environment},
      ${input.providerScope},
      ${input.businessId},
      ${normalizeOptionalText(input.resourceScope) ?? "business"},
      ${input.faultClass},
      ${input.faultSignature},
      ${input.status},
      ${normalizeOptionalText(input.blockerClass)},
      ${input.summary},
      1,
      ${normalizeOptionalTimestamp(input.firstSeenAt) ?? nowIso()},
      ${normalizeOptionalTimestamp(input.lastSeenAt) ?? nowIso()},
      ${normalizeOptionalTimestamp(input.eligibleAt)},
      ${normalizeOptionalTimestamp(input.repairingAt)},
      ${normalizeOptionalTimestamp(input.cooldownUntil)},
      ${normalizeOptionalTimestamp(input.halfOpenAt)},
      ${normalizeOptionalTimestamp(input.clearedAt)},
      ${normalizeOptionalTimestamp(input.quarantinedAt)},
      ${normalizeOptionalTimestamp(input.exhaustedAt)},
      ${normalizeOptionalTimestamp(input.manualRequiredAt)},
      ${normalizeOptionalText(input.lastError)},
      ${JSON.stringify(input.evidence ?? {})}::jsonb,
      ${JSON.stringify(input.metadata ?? {})}::jsonb,
      now(),
      now()
    )
    ON CONFLICT (provider_scope, business_id, resource_scope, fault_class, fault_signature)
    DO UPDATE SET
      build_id = EXCLUDED.build_id,
      environment = EXCLUDED.environment,
      status = EXCLUDED.status,
      blocker_class = EXCLUDED.blocker_class,
      summary = EXCLUDED.summary,
      observation_count = sync_incidents.observation_count + 1,
      first_seen_at = LEAST(sync_incidents.first_seen_at, EXCLUDED.first_seen_at),
      last_seen_at = GREATEST(sync_incidents.last_seen_at, EXCLUDED.last_seen_at),
      eligible_at = COALESCE(EXCLUDED.eligible_at, sync_incidents.eligible_at),
      repairing_at = COALESCE(EXCLUDED.repairing_at, sync_incidents.repairing_at),
      cooldown_until = COALESCE(EXCLUDED.cooldown_until, sync_incidents.cooldown_until),
      half_open_at = COALESCE(EXCLUDED.half_open_at, sync_incidents.half_open_at),
      cleared_at = COALESCE(EXCLUDED.cleared_at, sync_incidents.cleared_at),
      quarantined_at = COALESCE(EXCLUDED.quarantined_at, sync_incidents.quarantined_at),
      exhausted_at = COALESCE(EXCLUDED.exhausted_at, sync_incidents.exhausted_at),
      manual_required_at = COALESCE(EXCLUDED.manual_required_at, sync_incidents.manual_required_at),
      last_error = COALESCE(EXCLUDED.last_error, sync_incidents.last_error),
      evidence_json = EXCLUDED.evidence_json,
      metadata_json = EXCLUDED.metadata_json,
      updated_at = now()
    RETURNING *
  ` as Array<Record<string, unknown>>;
  return mapIncidentRow(rows[0] ?? {});
}

export async function updateSyncIncident(
  incidentId: string,
  input: UpdateSyncIncidentInput,
) {
  await assertSyncIncidentTablesReady("sync_incidents:update");
  const sql = getDb();
  const rows = await sql`
    UPDATE sync_incidents
    SET
      build_id = COALESCE(${input.buildId ?? null}, build_id),
      environment = COALESCE(${input.environment ?? null}, environment),
      provider_scope = COALESCE(${input.providerScope ?? null}, provider_scope),
      business_id = COALESCE(${input.businessId ?? null}, business_id),
      resource_scope = COALESCE(${input.resourceScope ?? null}, resource_scope),
      fault_class = COALESCE(${input.faultClass ?? null}, fault_class),
      fault_signature = COALESCE(${input.faultSignature ?? null}, fault_signature),
      status = COALESCE(${input.status ?? null}, status),
      blocker_class = COALESCE(${input.blockerClass ?? null}, blocker_class),
      summary = COALESCE(${input.summary ?? null}, summary),
      observation_count = COALESCE(${input.observationCount ?? null}, observation_count),
      first_seen_at = COALESCE(${normalizeOptionalTimestamp(input.firstSeenAt)}, first_seen_at),
      last_seen_at = COALESCE(${normalizeOptionalTimestamp(input.lastSeenAt)}, last_seen_at),
      eligible_at = COALESCE(${normalizeOptionalTimestamp(input.eligibleAt)}, eligible_at),
      repairing_at = COALESCE(${normalizeOptionalTimestamp(input.repairingAt)}, repairing_at),
      cooldown_until = COALESCE(${normalizeOptionalTimestamp(input.cooldownUntil)}, cooldown_until),
      half_open_at = COALESCE(${normalizeOptionalTimestamp(input.halfOpenAt)}, half_open_at),
      cleared_at = COALESCE(${normalizeOptionalTimestamp(input.clearedAt)}, cleared_at),
      quarantined_at = COALESCE(${normalizeOptionalTimestamp(input.quarantinedAt)}, quarantined_at),
      exhausted_at = COALESCE(${normalizeOptionalTimestamp(input.exhaustedAt)}, exhausted_at),
      manual_required_at = COALESCE(${normalizeOptionalTimestamp(input.manualRequiredAt)}, manual_required_at),
      last_error = COALESCE(${normalizeOptionalText(input.lastError)}, last_error),
      evidence_json = CASE
        WHEN ${input.evidence ? 1 : 0} = 1 THEN ${JSON.stringify(input.evidence ?? {})}::jsonb
        ELSE evidence_json
      END,
      metadata_json = CASE
        WHEN ${input.metadata ? 1 : 0} = 1 THEN ${JSON.stringify(input.metadata ?? {})}::jsonb
        ELSE metadata_json
      END,
      updated_at = now()
    WHERE id = ${incidentId}
    RETURNING *
  ` as Array<Record<string, unknown>>;
  return rows[0] ? mapIncidentRow(rows[0]) : null;
}

export async function getSyncIncidentById(incidentId: string) {
  await assertSyncIncidentTablesReady("sync_incidents:get_by_id");
  const sql = getDb();
  const rows = await sql`
    SELECT *
    FROM sync_incidents
    WHERE id = ${incidentId}
    LIMIT 1
  ` as Array<Record<string, unknown>>;
  return rows[0] ? mapIncidentRow(rows[0]) : null;
}

export async function getLatestSyncIncident(input?: ListSyncIncidentsInput) {
  const incidents = await listSyncIncidents({
    ...input,
    limit: 1,
  });
  return incidents[0] ?? null;
}

export async function listSyncIncidents(input?: ListSyncIncidentsInput) {
  await assertSyncIncidentTablesReady("sync_incidents:list");
  const sql = getDb();
  const { buildId, environment, providerScope } = resolveSyncControlPlaneKey(input);
  const businessId = normalizeOptionalText(input?.businessId ?? null);
  const resourceScope = normalizeOptionalText(input?.resourceScope ?? null);
  const faultClass = normalizeOptionalText(input?.faultClass ?? null);
  const faultSignature = normalizeOptionalText(input?.faultSignature ?? null);
  const statuses = normalizeStatusList(input?.statuses ?? null);
  const sinceMinutes = normalizeSinceMinutes(input?.sinceMinutes);
  const limit = normalizeLimit(input?.limit);
  const rows = await sql`
    SELECT *
    FROM sync_incidents
    WHERE build_id = ${buildId}
      AND environment = ${environment}
      AND provider_scope = ${providerScope}
      AND (${businessId}::text IS NULL OR business_id = ${businessId})
      AND (${resourceScope}::text IS NULL OR resource_scope = ${resourceScope})
      AND (${faultClass}::text IS NULL OR fault_class = ${faultClass})
      AND (${faultSignature}::text IS NULL OR fault_signature = ${faultSignature})
      AND (${statuses}::text[] IS NULL OR status = ANY(${statuses}::text[]))
      AND last_seen_at >= now() - (${sinceMinutes} || ' minutes')::interval
    ORDER BY last_seen_at DESC, created_at DESC
    LIMIT ${limit}
  ` as Array<Record<string, unknown>>;
  return rows.map(mapIncidentRow);
}

async function clearInactiveSyncIncidents(input: {
  buildId?: string;
  environment?: string;
  providerScope: string;
  businessId: string;
  activeIncidentKeys: Set<string>;
}) {
  await assertSyncIncidentTablesReady("sync_incidents:clear_inactive");
  const sql = getDb();
  const { buildId, environment } = resolveSyncControlPlaneKey({
    buildId: input.buildId,
    environment: input.environment,
    providerScope: input.providerScope,
  });
  const rows = await sql`
    SELECT *
    FROM sync_incidents
    WHERE build_id = ${buildId}
      AND environment = ${environment}
      AND provider_scope = ${input.providerScope}
      AND business_id = ${input.businessId}
      AND status <> 'cleared'
  ` as Array<Record<string, unknown>>;
  const incidents = rows.map(mapIncidentRow);
  const now = nowIso();
  for (const incident of incidents) {
    const key = `${incident.faultClass}:${incident.faultSignature}`;
    if (input.activeIncidentKeys.has(key)) continue;
    await updateSyncIncident(incident.id, {
      status: "cleared",
      summary: "Cleared by the latest repair-plan evaluation.",
      clearedAt: now,
      lastSeenAt: now,
    });
  }
}

export async function reconcileSyncIncidentsFromRepairPlan(input: {
  buildId?: string;
  environment?: string;
  providerScope: string;
  repairPlan: {
    planMode: SyncRepairPlanMode;
    recommendations: SyncRepairRecommendation[];
  };
  releaseGate?: SyncGateRecord | null;
}) {
  const businessIds = Array.from(
    new Set([
      ...normalizeCanaryBusinessIds(input.releaseGate),
      ...input.repairPlan.recommendations.map((row) => row.businessId),
    ]),
  );
  const activeKeysByBusiness = new Map<string, Set<string>>();
  const now = nowIso();

  for (const recommendation of input.repairPlan.recommendations) {
    const descriptor = buildSyncIncidentDescriptor(recommendation);
    const incidentStatus = deriveIncidentStatusFromPlan({
      recommendation,
      planMode: input.repairPlan.planMode,
    });
    const activeKeys = activeKeysByBusiness.get(recommendation.businessId) ?? new Set<string>();
    activeKeys.add(`${descriptor.faultClass}:${descriptor.faultSignature}`);
    activeKeysByBusiness.set(recommendation.businessId, activeKeys);

    await upsertSyncIncident({
      buildId: input.buildId,
      environment: input.environment,
      providerScope: input.providerScope,
      businessId: recommendation.businessId,
      resourceScope: descriptor.resourceScope,
      faultClass: descriptor.faultClass,
      faultSignature: descriptor.faultSignature,
      status: incidentStatus,
      blockerClass: recommendation.blockerClass,
      summary: recommendation.reason,
      eligibleAt: incidentStatus === "eligible" ? now : null,
      manualRequiredAt: incidentStatus === "manual_required" ? now : null,
      evidence: recommendation.beforeEvidence,
      metadata: {
        recommendedAction: recommendation.recommendedAction,
        repairClass: descriptor.repairClass,
        safetyClassification: recommendation.safetyClassification,
        expectedOutcome: recommendation.expectedOutcome,
        planMode: input.repairPlan.planMode,
      },
      firstSeenAt: now,
      lastSeenAt: now,
    });
  }

  for (const businessId of businessIds) {
    await clearInactiveSyncIncidents({
      buildId: input.buildId,
      environment: input.environment,
      providerScope: input.providerScope,
      businessId,
      activeIncidentKeys: activeKeysByBusiness.get(businessId) ?? new Set<string>(),
    });
  }
}

export async function transitionSyncIncident(input: {
  buildId?: string;
  environment?: string;
  providerScope: string;
  recommendation: SyncRepairRecommendation;
  nextStatus: SyncIncidentStatus;
  summary?: string | null;
  lastError?: string | null;
  cooldownUntil?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const descriptor = buildSyncIncidentDescriptor(input.recommendation);
  const incident = await getLatestSyncIncident({
    buildId: input.buildId,
    environment: input.environment,
    providerScope: input.providerScope,
    businessId: input.recommendation.businessId,
    resourceScope: descriptor.resourceScope,
    faultClass: descriptor.faultClass,
    faultSignature: descriptor.faultSignature,
    sinceMinutes: 60 * 24 * 365,
  });
  const now = nowIso();
  const transitionUpdate: UpdateSyncIncidentInput = {
    status: input.nextStatus,
    summary: normalizeOptionalText(input.summary) ?? input.recommendation.reason,
    blockerClass: input.recommendation.blockerClass ?? null,
    lastSeenAt: now,
    lastError: input.lastError ?? null,
    cooldownUntil: input.cooldownUntil ?? null,
    evidence: input.recommendation.beforeEvidence,
    metadata: {
      recommendedAction: input.recommendation.recommendedAction,
      safetyClassification: input.recommendation.safetyClassification,
      ...(input.metadata ?? {}),
    },
  };

  if (input.nextStatus === "eligible" && !incident?.eligibleAt) {
    transitionUpdate.eligibleAt = now;
  }
  if (input.nextStatus === "repairing") {
    transitionUpdate.repairingAt = now;
  }
  if (input.nextStatus === "cleared") {
    transitionUpdate.clearedAt = now;
  }
  if (input.nextStatus === "exhausted") {
    transitionUpdate.exhaustedAt = now;
  }
  if (input.nextStatus === "manual_required") {
    transitionUpdate.manualRequiredAt = now;
  }
  if (input.nextStatus === "half_open") {
    transitionUpdate.halfOpenAt = now;
  }
  if (input.nextStatus === "quarantined") {
    transitionUpdate.quarantinedAt = now;
  }

  if (incident) {
    return updateSyncIncident(incident.id, transitionUpdate);
  }

  return upsertSyncIncident({
    buildId: input.buildId,
    environment: input.environment,
    providerScope: input.providerScope,
    businessId: input.recommendation.businessId,
    resourceScope: descriptor.resourceScope,
    faultClass: descriptor.faultClass,
    faultSignature: descriptor.faultSignature,
    status: input.nextStatus,
    blockerClass: input.recommendation.blockerClass,
    summary: normalizeOptionalText(input.summary) ?? input.recommendation.reason,
    eligibleAt: input.nextStatus === "eligible" ? now : null,
    repairingAt: input.nextStatus === "repairing" ? now : null,
    cooldownUntil: input.cooldownUntil ?? null,
    clearedAt: input.nextStatus === "cleared" ? now : null,
    exhaustedAt: input.nextStatus === "exhausted" ? now : null,
    manualRequiredAt: input.nextStatus === "manual_required" ? now : null,
    lastError: input.lastError ?? null,
    evidence: input.recommendation.beforeEvidence,
    metadata: {
      recommendedAction: input.recommendation.recommendedAction,
      repairClass: descriptor.repairClass,
      safetyClassification: input.recommendation.safetyClassification,
      ...(input.metadata ?? {}),
    },
    firstSeenAt: now,
    lastSeenAt: now,
  });
}

export async function getSyncIncidentSummary(input?: {
  buildId?: string;
  environment?: string;
  providerScope?: string;
  businessId?: string | null;
}) {
  await assertSyncIncidentTablesReady("sync_incidents:summary");
  const sql = getDb();
  const { buildId, environment, providerScope } = resolveSyncControlPlaneKey(input);
  const businessId = normalizeOptionalText(input?.businessId ?? null);
  const rows = await sql`
    SELECT status, COUNT(*)::int AS count, MAX(last_seen_at) AS latest_seen_at
    FROM sync_incidents
    WHERE build_id = ${buildId}
      AND environment = ${environment}
      AND provider_scope = ${providerScope}
      AND (${businessId}::text IS NULL OR business_id = ${businessId})
    GROUP BY status
  ` as Array<Record<string, unknown>>;
  const counts = emptyIncidentCounts();
  let latestSeenAt: string | null = null;
  for (const row of rows) {
    const status = normalizeStatus(row.status);
    counts[status] = Number(row.count ?? 0);
    const rowLatestSeenAt = normalizeTimestamp(row.latest_seen_at);
    if (rowLatestSeenAt && (!latestSeenAt || rowLatestSeenAt > latestSeenAt)) {
      latestSeenAt = rowLatestSeenAt;
    }
  }
  const openCount =
    counts.detected +
    counts.eligible +
    counts.repairing +
    counts.cooldown +
    counts.half_open +
    counts.quarantined +
    counts.exhausted +
    counts.manual_required;
  const openCircuitCount = counts.exhausted + counts.quarantined;
  return {
    openCount,
    openCircuitCount,
    latestSeenAt,
    degradedServing: openCount > 0,
    counts,
  } satisfies SyncIncidentSummary;
}

export function deriveOperationalSyncState(input: {
  releaseGateVerdict?: string | null;
  recommendationCount?: number;
  incidentSummary?: SyncIncidentSummary | null;
}) : OperationalSyncState {
  const counts = input.incidentSummary?.counts;
  if (counts) {
    if (counts.exhausted > 0) return "exhausted";
    if (counts.quarantined > 0) return "quarantined";
    if (counts.manual_required > 0) return "manual_required";
    if (counts.repairing > 0) return "repairing";
    if (counts.cooldown > 0) return "cooldown";
    if (counts.half_open > 0) return "half_open";
    if (counts.eligible > 0) return "eligible";
    if (counts.detected > 0) return "detected";
    if (input.releaseGateVerdict && input.releaseGateVerdict !== "pass") return "detected";
    return "healthy";
  }

  if ((input.recommendationCount ?? 0) > 0) return "eligible";
  if (input.releaseGateVerdict && input.releaseGateVerdict !== "pass") return "detected";
  return "healthy";
}
