import { getCurrentRuntimeBuildId } from "@/lib/build-runtime";
import { getDb } from "@/lib/db";
import { assertDbSchemaReady } from "@/lib/db-schema-readiness";
import {
  collectMetaSyncReadinessSnapshot,
  type MetaSyncBenchmarkSnapshot,
} from "@/lib/meta-sync-benchmark";
import { runSyncSoakGate } from "@/lib/sync/soak-gate";
import {
  getRuntimeRegistryStatus,
  getSyncReleaseCanaryBusinessIds,
  readSyncGateMode,
  type SyncGateMode,
} from "@/lib/sync/runtime-contract";

export type SyncGateKind = "deploy_gate" | "release_gate";
export type SyncGateBaseResult = "pass" | "fail" | "misconfigured";
export type SyncGateVerdict =
  | "pass"
  | "fail"
  | "misconfigured"
  | "measure_only"
  | "warn_only"
  | "blocked";
export type SyncBlockerClass =
  | "none"
  | "runtime_contract_invalid"
  | "worker_unavailable"
  | "not_release_ready"
  | "queue_blocked"
  | "stalled"
  | "misconfigured"
  | "unknown";

export interface SyncGateRecord {
  gateKind: SyncGateKind;
  buildId: string;
  environment: string;
  mode: SyncGateMode;
  baseResult: SyncGateBaseResult;
  verdict: SyncGateVerdict;
  blockerClass: SyncBlockerClass | null;
  summary: string;
  breakGlass: boolean;
  overrideReason: string | null;
  evidence: Record<string, unknown>;
  emittedAt: string;
}

function nowIso() {
  return new Date().toISOString();
}

function gateModeForKind(kind: SyncGateKind, env: NodeJS.ProcessEnv = process.env) {
  return kind === "deploy_gate"
    ? readSyncGateMode("SYNC_DEPLOY_GATE_MODE", env)
    : readSyncGateMode("SYNC_RELEASE_GATE_MODE", env);
}

function mapVerdict(
  baseResult: SyncGateBaseResult,
  mode: SyncGateMode,
): SyncGateVerdict {
  if (baseResult === "pass") return "pass";
  if (baseResult === "misconfigured") return "misconfigured";
  if (mode === "measure_only") return "measure_only";
  if (mode === "warn_only") return "warn_only";
  return "blocked";
}

async function assertGateTablesReady(context: string) {
  await assertDbSchemaReady({
    tables: ["sync_release_gates"],
    context,
  });
}

export async function upsertSyncGateRecord(input: SyncGateRecord) {
  await assertGateTablesReady("sync_release_gates:upsert");
  const sql = getDb();
  await sql`
    INSERT INTO sync_release_gates (
      build_id,
      environment,
      gate_kind,
      mode,
      base_result,
      verdict,
      blocker_class,
      summary,
      break_glass,
      override_reason,
      evidence_json,
      emitted_at,
      updated_at
    )
    VALUES (
      ${input.buildId},
      ${input.environment},
      ${input.gateKind},
      ${input.mode},
      ${input.baseResult},
      ${input.verdict},
      ${input.blockerClass ?? null},
      ${input.summary},
      ${input.breakGlass},
      ${input.overrideReason ?? null},
      ${JSON.stringify(input.evidence ?? {})}::jsonb,
      ${input.emittedAt},
      now()
    )
    ON CONFLICT (build_id, environment, gate_kind)
    DO UPDATE SET
      mode = EXCLUDED.mode,
      base_result = EXCLUDED.base_result,
      verdict = EXCLUDED.verdict,
      blocker_class = EXCLUDED.blocker_class,
      summary = EXCLUDED.summary,
      break_glass = EXCLUDED.break_glass,
      override_reason = EXCLUDED.override_reason,
      evidence_json = EXCLUDED.evidence_json,
      emitted_at = EXCLUDED.emitted_at,
      updated_at = now()
  `;
  return input;
}

export async function getLatestSyncGateRecords(input?: {
  buildId?: string;
  environment?: string;
}) : Promise<{
  deployGate: SyncGateRecord | null;
  releaseGate: SyncGateRecord | null;
}> {
  await assertGateTablesReady("sync_release_gates:get_latest");
  const sql = getDb();
  const buildId = input?.buildId ?? getCurrentRuntimeBuildId();
  const environment = input?.environment ?? process.env.NODE_ENV ?? "unknown";
  const rows = await sql`
    SELECT
      build_id,
      environment,
      gate_kind,
      mode,
      base_result,
      verdict,
      blocker_class,
      summary,
      break_glass,
      override_reason,
      evidence_json,
      emitted_at
    FROM sync_release_gates
    WHERE build_id = ${buildId}
      AND environment = ${environment}
    ORDER BY emitted_at DESC
  ` as Array<Record<string, unknown>>;

  const records = rows.reduce<{
    deploy_gate: SyncGateRecord | null;
    release_gate: SyncGateRecord | null;
  }>(
    (accumulator, row) => {
      const record: SyncGateRecord = {
        gateKind: String(row.gate_kind) === "release_gate" ? "release_gate" : "deploy_gate",
        buildId: String(row.build_id),
        environment: String(row.environment),
        mode: row.mode === "warn_only" ? "warn_only" : row.mode === "block" ? "block" : "measure_only",
        baseResult:
          row.base_result === "misconfigured"
            ? "misconfigured"
            : row.base_result === "pass"
              ? "pass"
              : "fail",
        verdict:
          row.verdict === "pass" ||
          row.verdict === "fail" ||
          row.verdict === "misconfigured" ||
          row.verdict === "measure_only" ||
          row.verdict === "warn_only" ||
          row.verdict === "blocked"
            ? row.verdict
            : "fail",
        blockerClass: (row.blocker_class as SyncBlockerClass | null) ?? null,
        summary: String(row.summary ?? ""),
        breakGlass: Boolean(row.break_glass),
        overrideReason: row.override_reason ? String(row.override_reason) : null,
        evidence:
          row.evidence_json && typeof row.evidence_json === "object"
            ? (row.evidence_json as Record<string, unknown>)
            : {},
        emittedAt: typeof row.emitted_at === "string"
          ? row.emitted_at
          : row.emitted_at instanceof Date
            ? row.emitted_at.toISOString()
            : nowIso(),
      };
      if (!accumulator[record.gateKind]) {
        accumulator[record.gateKind] = record;
      }
      return accumulator;
    },
    {
      deploy_gate: null,
      release_gate: null,
    },
  );

  return {
    deployGate: records.deploy_gate,
    releaseGate: records.release_gate,
  };
}

function classifyReleaseSnapshot(snapshot: MetaSyncBenchmarkSnapshot) {
  const truthReady =
    snapshot.userFacing.recentSelectedRangeTruth.truthReady ||
    snapshot.userFacing.priorityWindowTruth.truthReady;
  const healthyActivity =
    snapshot.operator.activityState === "ready" ||
    snapshot.operator.activityState === "busy";
  const draining =
    snapshot.velocity.drainState === "clear" ||
    snapshot.velocity.drainState === "large_but_draining";
  const blocked =
    snapshot.operator.progressState === "blocked" ||
    snapshot.operator.activityState === "blocked";
  const workerUnavailable =
    snapshot.operator.workerOnline === false &&
    snapshot.queue.queueDepth > 0 &&
    snapshot.queue.leasedPartitions === 0;

  const pass = healthyActivity && draining && truthReady && !blocked;
  const blockerClass: SyncBlockerClass =
    workerUnavailable
      ? "worker_unavailable"
      : blocked
        ? "queue_blocked"
        : snapshot.operator.activityState === "stalled" ||
            snapshot.operator.progressState === "partial_stuck"
          ? "stalled"
          : pass
            ? "none"
            : "not_release_ready";

  return {
    pass,
    blockerClass,
    evidence: {
      activityState: snapshot.operator.activityState,
      progressState: snapshot.operator.progressState,
      workerOnline: snapshot.operator.workerOnline,
      queueDepth: snapshot.queue.queueDepth,
      leasedPartitions: snapshot.queue.leasedPartitions,
      drainState: snapshot.velocity.drainState,
      recentTruthState: snapshot.userFacing.recentSelectedRangeTruth.state,
      priorityTruthState: snapshot.userFacing.priorityWindowTruth.state,
      truthReady,
    },
  };
}

export async function evaluateDeployGate(input?: {
  buildId?: string;
  persist?: boolean;
  breakGlass?: boolean;
  overrideReason?: string | null;
  environment?: string;
}) : Promise<SyncGateRecord> {
  const buildId = input?.buildId ?? getCurrentRuntimeBuildId();
  const mode = gateModeForKind("deploy_gate");
  const environment = input?.environment ?? process.env.NODE_ENV ?? "unknown";
  const [soak, registry] = await Promise.all([
    runSyncSoakGate(),
    getRuntimeRegistryStatus({ buildId }),
  ]);
  const baseResult: SyncGateBaseResult =
    soak.result.outcome === "pass" &&
    registry.webPresent &&
    registry.workerPresent &&
    registry.dbFingerprintMatch &&
    registry.configFingerprintMatch &&
    registry.contractValid
      ? "pass"
      : "fail";
  const blockerClass: SyncBlockerClass =
    !registry.contractValid || !registry.dbFingerprintMatch || !registry.configFingerprintMatch
      ? "runtime_contract_invalid"
      : registry.workerPresent === false || registry.webPresent === false
        ? "worker_unavailable"
        : soak.result.outcome !== "pass"
          ? "queue_blocked"
          : "none";
  const record: SyncGateRecord = {
    gateKind: "deploy_gate",
    buildId,
    environment,
    mode,
    baseResult,
    verdict: mapVerdict(baseResult, mode),
    blockerClass: blockerClass === "none" ? null : blockerClass,
    summary:
      baseResult === "pass"
        ? "Synthetic deploy gate passed."
        : `Synthetic deploy gate failed: ${
            registry.issues[0] ??
            soak.result.blockingChecks[0]?.key ??
            "unknown"
          }`,
    breakGlass: Boolean(input?.breakGlass),
    overrideReason: input?.overrideReason ?? null,
    evidence: {
      soakGate: soak.result,
      runtimeRegistry: registry,
    },
    emittedAt: nowIso(),
  };
  if (input?.persist ?? true) {
    await upsertSyncGateRecord(record);
  }
  return record;
}

export async function evaluateReleaseGate(input?: {
  buildId?: string;
  persist?: boolean;
  breakGlass?: boolean;
  overrideReason?: string | null;
  environment?: string;
}) : Promise<SyncGateRecord> {
  const buildId = input?.buildId ?? getCurrentRuntimeBuildId();
  const environment = input?.environment ?? process.env.NODE_ENV ?? "unknown";
  const mode = gateModeForKind("release_gate");
  const canaryBusinessIds = getSyncReleaseCanaryBusinessIds();
  const missingMandatoryCanaries = ["172d0ab8-495b-4679-a4c6-ffa404c389d3"].filter(
    (businessId) => !canaryBusinessIds.includes(businessId),
  );

  if (canaryBusinessIds.length === 0 || missingMandatoryCanaries.length > 0) {
    const record: SyncGateRecord = {
      gateKind: "release_gate",
      buildId,
      environment,
      mode,
      baseResult: "misconfigured",
      verdict: "misconfigured",
      blockerClass: "misconfigured",
      summary:
        canaryBusinessIds.length === 0
          ? "Release gate is misconfigured: SYNC_RELEASE_CANARY_BUSINESSES is empty."
          : `Release gate is misconfigured: missing mandatory canary ${missingMandatoryCanaries.join(", ")}.`,
      breakGlass: Boolean(input?.breakGlass),
      overrideReason: input?.overrideReason ?? null,
      evidence: {
        canaryBusinessIds,
        missingMandatoryCanaries,
      },
      emittedAt: nowIso(),
    };
    if (input?.persist ?? true) {
      await upsertSyncGateRecord(record);
    }
    return record;
  }

  const canarySnapshots = await Promise.all(
    canaryBusinessIds.map(async (businessId) => {
      const snapshot = await collectMetaSyncReadinessSnapshot({
        businessId,
        recentDays: 7,
        priorityWindowDays: 3,
        recentWindowMinutes: 15,
      });
      return {
        businessId,
        businessName: snapshot.businessName ?? null,
        snapshot,
      };
    }),
  );

  const evaluations = canarySnapshots.map((row) => ({
    businessId: row.businessId,
    businessName: row.businessName,
    ...classifyReleaseSnapshot(row.snapshot),
  }));
  const failing = evaluations.filter((row) => !row.pass);
  const baseResult: SyncGateBaseResult = failing.length === 0 ? "pass" : "fail";
  const blockerClass =
    failing[0]?.blockerClass && failing[0].blockerClass !== "none"
      ? failing[0].blockerClass
      : null;
  const record: SyncGateRecord = {
    gateKind: "release_gate",
    buildId,
    environment,
    mode,
    baseResult,
    verdict: mapVerdict(baseResult, mode),
    blockerClass,
    summary:
      baseResult === "pass"
        ? "Release gate canary snapshot passed."
        : `Release gate canary snapshot failed for ${failing
            .map((row) => row.businessName ?? row.businessId)
            .join(", ")}.`,
    breakGlass: Boolean(input?.breakGlass),
    overrideReason: input?.overrideReason ?? null,
    evidence: {
      canaryBusinessIds,
      canaries: evaluations,
    },
    emittedAt: nowIso(),
  };
  if (input?.persist ?? true) {
    await upsertSyncGateRecord(record);
  }
  return record;
}

export async function evaluateAndPersistSyncGates(input?: {
  buildId?: string;
  environment?: string;
  breakGlass?: boolean;
  overrideReason?: string | null;
}) {
  const [deployGate, releaseGate] = await Promise.all([
    evaluateDeployGate({
      buildId: input?.buildId,
      environment: input?.environment,
      breakGlass: input?.breakGlass,
      overrideReason: input?.overrideReason,
      persist: true,
    }),
    evaluateReleaseGate({
      buildId: input?.buildId,
      environment: input?.environment,
      breakGlass: input?.breakGlass,
      overrideReason: input?.overrideReason,
      persist: true,
    }),
  ]);
  return {
    checkedAt: nowIso(),
    deployGate,
    releaseGate,
  };
}
