import {
  executeMetaRetentionPolicy,
  getMetaRetentionCanaryRuntimeStatus,
  getMetaRetentionDeleteScope,
  getMetaRetentionRuntimeStatus,
  summarizeMetaRetentionRunRows,
  type MetaRetentionCanaryRuntimeStatus,
  type MetaRetentionDeleteScope,
  type MetaRetentionExecutionDisposition,
  type MetaRetentionTier,
} from "@/lib/meta/warehouse-retention";

function todayIsoUtc() {
  return new Date().toISOString().slice(0, 10);
}

export interface MetaRetentionCanaryResult {
  businessId: string;
  asOfDate: string;
  executeRequested: boolean;
  passed: boolean;
  blockers: string[];
  globalRetentionRuntime: ReturnType<typeof getMetaRetentionRuntimeStatus> & {
    defaultExecutionDisabled: boolean;
  };
  canaryRuntime: MetaRetentionCanaryRuntimeStatus;
  run: {
    mode: "dry_run" | "execute";
    executionDisposition: MetaRetentionExecutionDisposition;
    skippedDueToActiveLease: boolean;
    totalDeletedRows: number;
    errorMessage?: string | null;
  };
  protectionProof: ReturnType<typeof summarizeMetaRetentionRunRows> & {
    tablesWithDeletedRows: number;
  };
  protectedTruth: string[];
  allowedDeleteScope: string[];
  tables: Array<{
    tier: MetaRetentionTier;
    tableName: string;
    summaryKey: string;
    deleteScope: MetaRetentionDeleteScope;
    retentionDays: number;
    cutoffDate: string;
    protectedRows: number | null;
    protectedDistinctDays: number | null;
    latestProtectedValue: string | null;
    deletableRows: number | null;
    deletableDistinctDays: number | null;
    oldestDeletableValue: string | null;
    newestDeletableValue: string | null;
    deletedRows: number;
  }>;
}

export async function runMetaRetentionCanary(input: {
  businessId: string;
  asOfDate?: string | null;
  execute?: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<MetaRetentionCanaryResult> {
  const asOfDate = input.asOfDate?.slice(0, 10) ?? todayIsoUtc();
  const executeRequested = Boolean(input.execute);
  const canaryRuntime = getMetaRetentionCanaryRuntimeStatus({
    businessId: input.businessId,
    executeRequested,
    env: input.env,
  });
  const globalRetentionRuntime = getMetaRetentionRuntimeStatus(input.env);
  const run = await executeMetaRetentionPolicy({
    asOfDate,
    env: input.env,
    businessIds: [input.businessId],
    forceExecute: canaryRuntime.executeAllowed,
    executionDisposition: executeRequested
      ? canaryRuntime.executeAllowed
        ? "canary_execute"
        : "gated_canary_execute"
      : "canary_dry_run",
    canary: canaryRuntime,
  });
  const protectionProof = {
    ...summarizeMetaRetentionRunRows(run.rows),
    tablesWithDeletedRows: run.rows.filter((row) => row.deletedRows > 0).length,
  };

  const blockers: string[] = [];
  if (canaryRuntime.globalExecutionEnabled) {
    blockers.push(
      "META_RETENTION_EXECUTION_ENABLED must remain disabled to keep the canary isolated.",
    );
  }
  if (!canaryRuntime.runtimeAvailable) {
    blockers.push(canaryRuntime.gateReason);
  }
  if (executeRequested && !canaryRuntime.executeAllowed) {
    blockers.push(canaryRuntime.gateReason);
  }
  if (run.skippedDueToActiveLease) {
    blockers.push(
      "Meta retention canary was skipped because another retention lease is already active.",
    );
  }
  if (run.errorMessage) {
    blockers.push(run.errorMessage);
  }

  return {
    businessId: input.businessId,
    asOfDate,
    executeRequested,
    passed: blockers.length === 0,
    blockers,
    globalRetentionRuntime: {
      ...globalRetentionRuntime,
      defaultExecutionDisabled: !globalRetentionRuntime.executionEnabled,
    },
    canaryRuntime,
    run: {
      mode: run.mode,
      executionDisposition: run.executionDisposition,
      skippedDueToActiveLease: run.skippedDueToActiveLease,
      totalDeletedRows: run.totalDeletedRows,
      errorMessage: run.errorMessage,
    },
    protectionProof,
    protectedTruth: [
      "active publication pointers inside the locked Meta horizons",
      "active published slice versions referenced by those pointers",
      "active source manifests referenced by published slices",
      "published day-state rows tied to active publication pointers",
      "currently required core published truth inside 761 days",
      "currently required breakdown published truth inside 394 days",
    ],
    allowedDeleteScope: [
      "core daily residue older than 761 days",
      "breakdown daily residue older than 394 days",
      "horizon-outside publication pointers, reconciliation rows, and day-state rows older than the applicable horizon",
      "orphaned unpublished slice versions older than the applicable horizon",
      "orphaned source manifests older than the applicable horizon",
    ],
    tables: run.rows.map((row) => ({
      tier: row.tier,
      tableName: row.tableName,
      summaryKey: row.summaryKey,
      deleteScope: getMetaRetentionDeleteScope(row),
      retentionDays: row.retentionDays,
      cutoffDate: row.cutoffDate,
      protectedRows: row.protectedRows,
      protectedDistinctDays: row.protectedDistinctDays,
      latestProtectedValue: row.latestProtectedValue,
      deletableRows: row.eligibleRows,
      deletableDistinctDays: row.eligibleDistinctDays,
      oldestDeletableValue: row.oldestEligibleValue,
      newestDeletableValue: row.newestEligibleValue,
      deletedRows: row.deletedRows,
    })),
  };
}
