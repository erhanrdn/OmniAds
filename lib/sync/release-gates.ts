import { getDb } from "@/lib/db";
import { assertDbSchemaReady } from "@/lib/db-schema-readiness";
import {
  collectMetaSyncReadinessSnapshot,
  type MetaSyncBenchmarkSnapshot,
} from "@/lib/meta-sync-benchmark";
import {
  getRuntimeRegistryStatus,
  getSyncReleaseCanaryBusinessIds,
  readSyncGateMode,
  type SyncGateMode,
} from "@/lib/sync/runtime-contract";
import {
  getProviderScopeWorkerObservation,
  getSyncWorkerHealthSummary,
} from "@/lib/sync/worker-health";
import { resolveSyncControlPlaneKey } from "@/lib/sync/control-plane-key";

export type SyncGateKind = "deploy_gate" | "release_gate";
export type SyncGateBaseResult = "pass" | "fail" | "misconfigured";
export type SyncGateVerdict =
  | "pass"
  | "fail"
  | "misconfigured"
  | "measure_only"
  | "warn_only"
  | "blocked";
export type SyncGateScope =
  | "runtime_contract"
  | "service_liveness"
  | "release_readiness";
export type SyncBlockerClass =
  | "none"
  | "runtime_contract_invalid"
  | "service_unavailable"
  | "heartbeat_missing"
  | "worker_unavailable"
  | "not_release_ready"
  | "queue_blocked"
  | "stalled"
  | "misconfigured"
  | "unknown";

export interface SyncGateRecord {
  id?: string | null;
  gateKind: SyncGateKind;
  gateScope: SyncGateScope;
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

function normalizeRequestedReleaseGateProviderScope(
  providerScope?: string | null,
) {
  const normalized = providerScope?.trim();
  return normalized && normalized.length > 0 ? normalized : "meta";
}

function readReleaseGateProviderScope(
  evidence: Record<string, unknown> | null | undefined,
) {
  const value = evidence?.providerScope;
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export type ProviderReleaseTruthInput = {
  activityState: string | null;
  progressState: string | null;
  workerOnline: boolean | null;
  queueDepth: number;
  leasedPartitions: number;
  truthReady: boolean;
  retryableFailedPartitions?: number;
  deadLetterPartitions?: number;
  staleLeasePartitions?: number;
  repairBacklog?: number;
  validationFailures24h?: number;
  reclaimCandidateCount?: number;
  staleRunCount24h?: number;
  d1FinalizeNonTerminalCount?: number;
  recentTruthState?: string | null;
  priorityTruthState?: string | null;
  stallFingerprints?: string[];
};

function nowIso() {
  return new Date().toISOString();
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
  const rows = await sql`
    INSERT INTO sync_release_gates (
      build_id,
      environment,
      gate_kind,
      gate_scope,
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
      ${input.gateScope},
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
    RETURNING id
  ` as Array<{ id: string }>;
  return {
    ...input,
    id: rows[0]?.id ?? input.id ?? null,
  };
}

function hydrateSyncGateRecordRow(row: Record<string, unknown>): SyncGateRecord {
  return {
    id: row.id ? String(row.id) : null,
    gateKind: String(row.gate_kind) === "release_gate" ? "release_gate" : "deploy_gate",
    gateScope:
      row.gate_scope === "runtime_contract"
        ? "runtime_contract"
        : row.gate_scope === "service_liveness"
          ? "service_liveness"
          : "release_readiness",
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
}

export function selectLatestSyncGateRecords(
  records: SyncGateRecord[],
  input?: {
    providerScope?: string | null;
  },
): {
  deployGate: SyncGateRecord | null;
  releaseGate: SyncGateRecord | null;
} {
  const requestedProviderScope = normalizeRequestedReleaseGateProviderScope(
    input?.providerScope,
  );
  const deployGate =
    records.find((record) => record.gateKind === "deploy_gate") ?? null;
  const releaseGate =
    records.find((record) => {
      if (record.gateKind !== "release_gate") return false;
      const recordProviderScope = readReleaseGateProviderScope(record.evidence);
      if (requestedProviderScope === "meta") {
        return recordProviderScope == null || recordProviderScope === "meta";
      }
      return recordProviderScope === requestedProviderScope;
    }) ?? null;

  return {
    deployGate,
    releaseGate,
  };
}

export function mergeLatestSyncGateRecords(input: {
  exact: {
    deployGate: SyncGateRecord | null;
    releaseGate: SyncGateRecord | null;
  };
  fallbackByBuild: {
    deployGate: SyncGateRecord | null;
    releaseGate: SyncGateRecord | null;
  };
}) {
  return {
    deployGate: input.exact.deployGate ?? input.fallbackByBuild.deployGate,
    releaseGate: input.exact.releaseGate,
  };
}

export async function getLatestSyncGateRecords(input?: {
  buildId?: string;
  environment?: string;
  providerScope?: string;
}) : Promise<{
  deployGate: SyncGateRecord | null;
  releaseGate: SyncGateRecord | null;
}> {
  await assertGateTablesReady("sync_release_gates:get_latest");
  const sql = getDb();
  const { buildId, environment } = resolveSyncControlPlaneKey({
    buildId: input?.buildId,
    environment: input?.environment,
  });
  const exactRows = await sql`
    SELECT
      id,
      build_id,
      environment,
      gate_kind,
      gate_scope,
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
  const fallbackRows = await sql`
    SELECT
      id,
      build_id,
      environment,
      gate_kind,
      gate_scope,
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
    ORDER BY emitted_at DESC
  ` as Array<Record<string, unknown>>;

  const exactRecords = selectLatestSyncGateRecords(
    exactRows.map((row) => hydrateSyncGateRecordRow(row)),
    {
      providerScope: input?.providerScope,
    },
  );
  const fallbackRecords = selectLatestSyncGateRecords(
    fallbackRows.map((row) => hydrateSyncGateRecordRow(row)),
    {
      providerScope: input?.providerScope,
    },
  );

  return mergeLatestSyncGateRecords({
    exact: exactRecords,
    fallbackByBuild: fallbackRecords,
  });
}

export async function getSyncGateRecordById(input: {
  id: string;
}): Promise<SyncGateRecord | null> {
  await assertGateTablesReady("sync_release_gates:get_by_id");
  const sql = getDb();
  const rows = await sql`
    SELECT
      id,
      build_id,
      environment,
      gate_kind,
      gate_scope,
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
    WHERE id = ${input.id}
    LIMIT 1
  ` as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  return hydrateSyncGateRecordRow(row);
}

export function classifyReleaseSnapshot(snapshot: MetaSyncBenchmarkSnapshot) {
  return classifyProviderReleaseTruth({
    activityState: snapshot.operator.activityState,
    progressState: snapshot.operator.progressState,
    workerOnline: snapshot.operator.workerOnline,
    queueDepth: snapshot.queue.queueDepth,
    leasedPartitions: snapshot.queue.leasedPartitions,
    truthReady:
      snapshot.userFacing.recentSelectedRangeTruth.truthReady ||
      snapshot.userFacing.priorityWindowTruth.truthReady,
    retryableFailedPartitions: snapshot.queue.retryableFailedPartitions,
    deadLetterPartitions: snapshot.queue.deadLetterPartitions,
    staleLeasePartitions: snapshot.queue.staleLeasePartitions,
    repairBacklog: snapshot.authoritative.repairBacklog,
    validationFailures24h: snapshot.authoritative.validationFailures24h,
    reclaimCandidateCount: snapshot.operator.reclaimCandidateCount ?? 0,
    staleRunCount24h: snapshot.operator.staleRunCount24h ?? 0,
    d1FinalizeNonTerminalCount: snapshot.operator.d1FinalizeNonTerminalCount,
    recentTruthState: snapshot.userFacing.recentSelectedRangeTruth.state,
    priorityTruthState: snapshot.userFacing.priorityWindowTruth.state,
    stallFingerprints: snapshot.operator.stallFingerprints,
  });
}

export function classifyProviderReleaseTruth(input: ProviderReleaseTruthInput) {
  const healthyActivity = input.activityState === "ready" || input.activityState === "busy";
  const draining = input.queueDepth === 0 || input.leasedPartitions > 0;
  const blocked =
    input.progressState === "blocked" || input.activityState === "blocked";
  const workerUnavailable =
    input.workerOnline === false &&
    input.queueDepth > 0 &&
    input.leasedPartitions === 0;
  const stalled =
    input.activityState === "stalled" || input.progressState === "partial_stuck";
  const pass = healthyActivity && draining && input.truthReady && !blocked;
  const blockerClass: SyncBlockerClass =
    workerUnavailable
      ? "worker_unavailable"
      : blocked
        ? "queue_blocked"
        : stalled
          ? "stalled"
          : pass
            ? "none"
            : "not_release_ready";

  return {
    pass,
    blockerClass,
    evidence: {
      activityState: input.activityState,
      progressState: input.progressState,
      workerOnline: input.workerOnline,
      queueDepth: input.queueDepth,
      leasedPartitions: input.leasedPartitions,
      recentTruthState: input.recentTruthState ?? null,
      priorityTruthState: input.priorityTruthState ?? null,
      truthReady: input.truthReady,
      retryableFailedPartitions: input.retryableFailedPartitions ?? 0,
      deadLetterPartitions: input.deadLetterPartitions ?? 0,
      staleLeasePartitions: input.staleLeasePartitions ?? 0,
      repairBacklog: input.repairBacklog ?? 0,
      validationFailures24h: input.validationFailures24h ?? 0,
      reclaimCandidateCount: input.reclaimCandidateCount ?? 0,
      staleRunCount24h: input.staleRunCount24h ?? 0,
      d1FinalizeNonTerminalCount: input.d1FinalizeNonTerminalCount ?? 0,
      stallFingerprints: input.stallFingerprints ?? [],
    },
  };
}

async function collectReleaseGateCanarySnapshot(input: {
  businessId: string;
  recentDays: number;
  priorityWindowDays: number;
  recentWindowMinutes: number;
}) {
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const snapshot = await collectMetaSyncReadinessSnapshot({
        businessId: input.businessId,
        recentDays: input.recentDays,
        priorityWindowDays: input.priorityWindowDays,
        recentWindowMinutes: input.recentWindowMinutes,
      });
      return {
        businessId: input.businessId,
        businessName: snapshot.businessName ?? null,
        snapshot,
        snapshotError: null,
        attempts: attempt,
      };
    } catch (error) {
      lastError = toErrorMessage(error);
      console.error("[release-gates] canary_snapshot_failed", {
        businessId: input.businessId,
        attempt,
        error: lastError,
      });
    }
  }

  return {
    businessId: input.businessId,
    businessName: null,
    snapshot: null,
    snapshotError: lastError ?? "unknown_release_snapshot_error",
    attempts: 3,
  };
}

export async function evaluateDeployGate(input?: {
  buildId?: string;
  persist?: boolean;
  breakGlass?: boolean;
  overrideReason?: string | null;
  environment?: string;
}) : Promise<SyncGateRecord> {
  const { buildId, environment } = resolveSyncControlPlaneKey({
    buildId: input?.buildId,
    environment: input?.environment,
  });
  const mode = gateModeForKind("deploy_gate");
  const [registry, workerHealth] = await Promise.all([
    getRuntimeRegistryStatus({ buildId }),
    getSyncWorkerHealthSummary({
      providerScopes: ["meta"],
      onlineWindowMinutes: 5,
    }),
  ]);
  const metaWorker = getProviderScopeWorkerObservation({
    providerScope: "meta",
    workers: workerHealth.workers,
    staleThresholdMs: 5 * 60_000,
  });
  const servicesHealthy =
    registry.webPresent &&
    registry.workerPresent &&
    registry.serviceHealth.web?.healthState === "healthy" &&
    registry.serviceHealth.worker?.healthState === "healthy";
  const baseResult: SyncGateBaseResult =
    servicesHealthy &&
    metaWorker.hasFreshHeartbeat &&
    registry.dbFingerprintMatch &&
    registry.configFingerprintMatch &&
    registry.contractValid
      ? "pass"
      : "fail";
  const blockerClass: SyncBlockerClass =
    !registry.contractValid || !registry.dbFingerprintMatch || !registry.configFingerprintMatch
      ? "runtime_contract_invalid"
      : !servicesHealthy
        ? "service_unavailable"
        : !metaWorker.hasFreshHeartbeat
          ? "heartbeat_missing"
          : "none";
  const record: SyncGateRecord = {
    id: null,
    gateKind: "deploy_gate",
    gateScope:
      blockerClass === "runtime_contract_invalid" ? "runtime_contract" : "service_liveness",
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
            (blockerClass === "heartbeat_missing"
              ? "meta_heartbeat_missing"
              : blockerClass === "service_unavailable"
                ? "service_unavailable"
                : "unknown")
          }`,
    breakGlass: Boolean(input?.breakGlass),
    overrideReason: input?.overrideReason ?? null,
    evidence: {
      buildId,
      metaHeartbeat: {
        onlineWorkers: workerHealth.onlineWorkers,
        workerInstances: workerHealth.workerInstances,
        lastHeartbeatAt: workerHealth.lastHeartbeatAt,
        workerId: metaWorker.workerId,
        hasFreshHeartbeat: metaWorker.hasFreshHeartbeat,
        heartbeatAgeMs: metaWorker.heartbeatAgeMs,
      },
      runtimeRegistry: registry,
    },
    emittedAt: nowIso(),
  };
  if (input?.persist ?? true) {
    return upsertSyncGateRecord(record);
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
  const { buildId, environment } = resolveSyncControlPlaneKey({
    buildId: input?.buildId,
    environment: input?.environment,
  });
  const mode = gateModeForKind("release_gate");
  const canaryBusinessIds = getSyncReleaseCanaryBusinessIds();
  const missingMandatoryCanaries = ["172d0ab8-495b-4679-a4c6-ffa404c389d3"].filter(
    (businessId) => !canaryBusinessIds.includes(businessId),
  );

  if (canaryBusinessIds.length === 0 || missingMandatoryCanaries.length > 0) {
    const record: SyncGateRecord = {
      id: null,
      gateKind: "release_gate",
      gateScope: "release_readiness",
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
      return upsertSyncGateRecord(record);
    }
    return record;
  }

  const canarySnapshots = [] as Awaited<
    ReturnType<typeof collectReleaseGateCanarySnapshot>
  >[];
  for (const businessId of canaryBusinessIds) {
    canarySnapshots.push(
      await collectReleaseGateCanarySnapshot({
        businessId,
        recentDays: 7,
        priorityWindowDays: 3,
        recentWindowMinutes: 15,
      }),
    );
  }

  const evaluations = canarySnapshots.map((row) => {
    if (row.snapshot) {
      const classified = classifyReleaseSnapshot(row.snapshot);
      return {
        businessId: row.businessId,
        businessName: row.businessName,
        ...classified,
        evidence: {
          ...classified.evidence,
          snapshotCollectionAttempts: row.attempts,
        },
      };
    }

    return {
      businessId: row.businessId,
      businessName: row.businessName,
      pass: false,
      blockerClass: "service_unavailable" as const,
      evidence: {
        activityState: null,
        progressState: null,
        workerOnline: null,
        queueDepth: 0,
        leasedPartitions: 0,
        drainState: "unknown",
        recentTruthState: null,
        priorityTruthState: null,
        truthReady: false,
        retryableFailedPartitions: 0,
        deadLetterPartitions: 0,
        staleLeasePartitions: 0,
        repairBacklog: 0,
        validationFailures24h: 0,
        reclaimCandidateCount: 0,
        staleRunCount24h: 0,
        d1FinalizeNonTerminalCount: 0,
        stallFingerprints: [],
        snapshotError: row.snapshotError,
        snapshotCollectionAttempts: row.attempts,
      },
    };
  });
  const failing = evaluations.filter((row) => !row.pass);
  const baseResult: SyncGateBaseResult = failing.length === 0 ? "pass" : "fail";
  const blockerClass =
    failing[0]?.blockerClass && failing[0].blockerClass !== "none"
      ? failing[0].blockerClass
      : null;
  const record: SyncGateRecord = {
    id: null,
    gateKind: "release_gate",
    gateScope: "release_readiness",
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
    return upsertSyncGateRecord(record);
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

export function shouldEnforceSyncGateFailure(
  records: Array<Pick<SyncGateRecord, "verdict"> | null | undefined>,
) {
  return records.some(
    (record) =>
      record != null &&
      (record.verdict === "blocked" || record.verdict === "misconfigured"),
  );
}
