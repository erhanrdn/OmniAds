import { getDb } from "@/lib/db";
import { assertDbSchemaReady } from "@/lib/db-schema-readiness";
import { resolveSyncControlPlaneKey } from "@/lib/sync/control-plane-key";

export type SyncRepairExecutionStatus =
  | "running"
  | "completed"
  | "failed"
  | "locked";

export type SyncRepairExecutionOutcome =
  | "cleared"
  | "improving_not_cleared"
  | "no_change"
  | "worse"
  | "manual_follow_up_required"
  | "locked";

export interface SyncRepairExecutionRecord {
  id: string;
  buildId: string;
  environment: string;
  providerScope: string;
  businessId: string;
  businessName: string | null;
  sourceReleaseGateId: string | null;
  sourceRepairPlanId: string | null;
  recommendedAction: string | null;
  executedAction: string | null;
  workflowRunId: string | null;
  workflowActor: string | null;
  lockOwner: string | null;
  status: SyncRepairExecutionStatus;
  outcomeClassification: SyncRepairExecutionOutcome | null;
  expectedOutcomeMet: boolean | null;
  beforeEvidence: Record<string, unknown>;
  actionResult: Record<string, unknown>;
  afterEvidence: Record<string, unknown>;
  startedAt: string;
  finishedAt: string | null;
}

export interface SyncRepairExecutionSummary {
  buildId: string;
  environment: string;
  providerScope: string;
  latestStartedAt: string | null;
  latestFinishedAt: string | null;
  improvedAny: boolean;
  businessCount: number;
  counts: Record<SyncRepairExecutionOutcome, number>;
}

function nowIso() {
  return new Date().toISOString();
}

function toText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toBoolean(value: unknown) {
  return typeof value === "boolean" ? value : value == null ? null : Boolean(value);
}

function emptyOutcomeCounts(): Record<SyncRepairExecutionOutcome, number> {
  return {
    cleared: 0,
    improving_not_cleared: 0,
    no_change: 0,
    worse: 0,
    manual_follow_up_required: 0,
    locked: 0,
  };
}

async function assertRepairExecutionTablesReady(context: string) {
  await assertDbSchemaReady({
    tables: ["sync_repair_executions"],
    context,
  });
}

function normalizeJsonRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function mapExecutionRow(row: Record<string, unknown>): SyncRepairExecutionRecord {
  return {
    id: String(row.id),
    buildId: String(row.build_id),
    environment: String(row.environment),
    providerScope: String(row.provider_scope),
    businessId: String(row.business_id),
    businessName: toText(row.business_name),
    sourceReleaseGateId: toText(row.source_release_gate_id),
    sourceRepairPlanId: toText(row.source_repair_plan_id),
    recommendedAction: toText(row.recommended_action),
    executedAction: toText(row.executed_action),
    workflowRunId: toText(row.workflow_run_id),
    workflowActor: toText(row.workflow_actor),
    lockOwner: toText(row.lock_owner),
    status:
      row.status === "completed" || row.status === "failed" || row.status === "locked"
        ? row.status
        : "running",
    outcomeClassification:
      row.outcome_classification === "cleared" ||
      row.outcome_classification === "improving_not_cleared" ||
      row.outcome_classification === "no_change" ||
      row.outcome_classification === "worse" ||
      row.outcome_classification === "manual_follow_up_required" ||
      row.outcome_classification === "locked"
        ? row.outcome_classification
        : null,
    expectedOutcomeMet: toBoolean(row.expected_outcome_met),
    beforeEvidence: normalizeJsonRecord(row.before_evidence_json),
    actionResult: normalizeJsonRecord(row.action_result_json),
    afterEvidence: normalizeJsonRecord(row.after_evidence_json),
    startedAt:
      typeof row.started_at === "string"
        ? row.started_at
        : row.started_at instanceof Date
          ? row.started_at.toISOString()
          : nowIso(),
    finishedAt:
      typeof row.finished_at === "string"
        ? row.finished_at
        : row.finished_at instanceof Date
          ? row.finished_at.toISOString()
          : null,
  };
}

export async function createSyncRepairExecution(input: {
  buildId?: string;
  environment?: string;
  providerScope: string;
  businessId: string;
  businessName?: string | null;
  sourceReleaseGateId?: string | null;
  sourceRepairPlanId?: string | null;
  recommendedAction?: string | null;
  executedAction?: string | null;
  workflowRunId?: string | null;
  workflowActor?: string | null;
  lockOwner?: string | null;
  status?: SyncRepairExecutionStatus;
  outcomeClassification?: SyncRepairExecutionOutcome | null;
  expectedOutcomeMet?: boolean | null;
  beforeEvidence?: Record<string, unknown>;
  actionResult?: Record<string, unknown>;
  afterEvidence?: Record<string, unknown>;
  startedAt?: string;
  finishedAt?: string | null;
}) {
  await assertRepairExecutionTablesReady("sync_repair_executions:create");
  const sql = getDb();
  const { buildId, environment } = resolveSyncControlPlaneKey({
    buildId: input.buildId,
    environment: input.environment,
    providerScope: input.providerScope,
  });
  const rows = await sql`
    INSERT INTO sync_repair_executions (
      build_id,
      environment,
      provider_scope,
      business_id,
      business_name,
      source_release_gate_id,
      source_repair_plan_id,
      recommended_action,
      executed_action,
      workflow_run_id,
      workflow_actor,
      lock_owner,
      status,
      outcome_classification,
      expected_outcome_met,
      before_evidence_json,
      action_result_json,
      after_evidence_json,
      started_at,
      finished_at,
      updated_at
    )
    VALUES (
      ${buildId},
      ${environment},
      ${input.providerScope},
      ${input.businessId},
      ${input.businessName ?? null},
      ${input.sourceReleaseGateId ?? null},
      ${input.sourceRepairPlanId ?? null},
      ${input.recommendedAction ?? null},
      ${input.executedAction ?? null},
      ${input.workflowRunId ?? null},
      ${input.workflowActor ?? null},
      ${input.lockOwner ?? null},
      ${input.status ?? "running"},
      ${input.outcomeClassification ?? null},
      ${input.expectedOutcomeMet ?? null},
      ${JSON.stringify(input.beforeEvidence ?? {})}::jsonb,
      ${JSON.stringify(input.actionResult ?? {})}::jsonb,
      ${JSON.stringify(input.afterEvidence ?? {})}::jsonb,
      ${input.startedAt ?? nowIso()},
      ${input.finishedAt ?? null},
      now()
    )
    RETURNING *
  ` as Array<Record<string, unknown>>;
  return mapExecutionRow(rows[0] ?? {});
}

export async function updateSyncRepairExecution(
  executionId: string,
  input: {
    businessName?: string | null;
    executedAction?: string | null;
    status?: SyncRepairExecutionStatus;
    outcomeClassification?: SyncRepairExecutionOutcome | null;
    expectedOutcomeMet?: boolean | null;
    beforeEvidence?: Record<string, unknown>;
    actionResult?: Record<string, unknown>;
    afterEvidence?: Record<string, unknown>;
    finishedAt?: string | null;
  },
) {
  await assertRepairExecutionTablesReady("sync_repair_executions:update");
  const sql = getDb();
  const rows = await sql`
    UPDATE sync_repair_executions
    SET
      business_name = COALESCE(${input.businessName ?? null}, business_name),
      executed_action = COALESCE(${input.executedAction ?? null}, executed_action),
      status = COALESCE(${input.status ?? null}, status),
      outcome_classification = COALESCE(${input.outcomeClassification ?? null}, outcome_classification),
      expected_outcome_met = COALESCE(${input.expectedOutcomeMet ?? null}, expected_outcome_met),
      before_evidence_json = CASE
        WHEN ${input.beforeEvidence ? 1 : 0} = 1 THEN ${JSON.stringify(input.beforeEvidence ?? {})}::jsonb
        ELSE before_evidence_json
      END,
      action_result_json = CASE
        WHEN ${input.actionResult ? 1 : 0} = 1 THEN ${JSON.stringify(input.actionResult ?? {})}::jsonb
        ELSE action_result_json
      END,
      after_evidence_json = CASE
        WHEN ${input.afterEvidence ? 1 : 0} = 1 THEN ${JSON.stringify(input.afterEvidence ?? {})}::jsonb
        ELSE after_evidence_json
      END,
      finished_at = COALESCE(${input.finishedAt ?? null}, finished_at),
      updated_at = now()
    WHERE id = ${executionId}
    RETURNING *
  ` as Array<Record<string, unknown>>;
  const row = rows[0];
  return row ? mapExecutionRow(row) : null;
}

export async function getLatestSyncRepairExecution(input: {
  buildId?: string;
  environment?: string;
  providerScope?: string;
  businessId: string;
}) {
  await assertRepairExecutionTablesReady("sync_repair_executions:get_latest_business");
  const sql = getDb();
  const { buildId, environment, providerScope } = resolveSyncControlPlaneKey(input);
  const rows = await sql`
    SELECT *
    FROM sync_repair_executions
    WHERE build_id = ${buildId}
      AND environment = ${environment}
      AND provider_scope = ${providerScope}
      AND business_id = ${input.businessId}
    ORDER BY started_at DESC, created_at DESC
    LIMIT 1
  ` as Array<Record<string, unknown>>;
  return rows[0] ? mapExecutionRow(rows[0]) : null;
}

export async function getLatestSyncRepairExecutions(input?: {
  buildId?: string;
  environment?: string;
  providerScope?: string;
  businessIds?: string[] | null;
}) {
  await assertRepairExecutionTablesReady("sync_repair_executions:get_latest");
  const sql = getDb();
  const { buildId, environment, providerScope } = resolveSyncControlPlaneKey(input);
  const businessIds = input?.businessIds ?? null;
  const rows = await sql`
    SELECT DISTINCT ON (business_id) *
    FROM sync_repair_executions
    WHERE build_id = ${buildId}
      AND environment = ${environment}
      AND provider_scope = ${providerScope}
      AND (${businessIds}::text[] IS NULL OR business_id = ANY(${businessIds}::text[]))
    ORDER BY business_id, started_at DESC, created_at DESC
  ` as Array<Record<string, unknown>>;
  return rows.map(mapExecutionRow);
}

export async function getLatestSyncRepairExecutionSummary(input?: {
  buildId?: string;
  environment?: string;
  providerScope?: string;
}) {
  const { buildId, environment, providerScope } = resolveSyncControlPlaneKey(input);
  const executions = await getLatestSyncRepairExecutions({
    buildId,
    environment,
    providerScope,
  }).catch(() => []);
  if (executions.length === 0) return null;
  const counts = emptyOutcomeCounts();
  let latestStartedAt: string | null = null;
  let latestFinishedAt: string | null = null;
  for (const execution of executions) {
    if (execution.outcomeClassification) {
      counts[execution.outcomeClassification] += 1;
    }
    if (!latestStartedAt || new Date(execution.startedAt).getTime() > new Date(latestStartedAt).getTime()) {
      latestStartedAt = execution.startedAt;
    }
    if (
      execution.finishedAt &&
      (!latestFinishedAt || new Date(execution.finishedAt).getTime() > new Date(latestFinishedAt).getTime())
    ) {
      latestFinishedAt = execution.finishedAt;
    }
  }
  return {
    buildId,
    environment,
    providerScope,
    latestStartedAt,
    latestFinishedAt,
    improvedAny:
      counts.cleared > 0 || counts.improving_not_cleared > 0,
    businessCount: executions.length,
    counts,
  } satisfies SyncRepairExecutionSummary;
}
