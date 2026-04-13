import { randomUUID } from "node:crypto";
import { getDb, getDbWithTimeout } from "@/lib/db";
import { assertDbSchemaReady, getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import {
  META_AUTHORITATIVE_HISTORY_DAYS,
  META_BREAKDOWN_AUTHORITATIVE_HISTORY_DAYS,
} from "@/lib/meta/contract";
import { addDaysToIsoDate } from "@/lib/meta/history";
import type { MetaWarehouseScope } from "@/lib/meta/warehouse-types";
import {
  acquireSyncRunnerLease,
  releaseSyncRunnerLease,
} from "@/lib/sync/worker-health";

export type MetaRetentionTier =
  | "core_authoritative"
  | "breakdown_authoritative";

type MetaRetentionDateColumn = "date" | "day";
type MetaRetentionDeleteStrategy =
  | "date_id"
  | "day_id"
  | "day_ctid"
  | "orphaned_slice_versions"
  | "orphaned_source_manifests";

export interface MetaRetentionPolicyEntry {
  tier: MetaRetentionTier;
  label: string;
  retentionDays: number;
  tableName: string;
  summaryKey: string;
  dateColumn: MetaRetentionDateColumn;
  deleteStrategy: MetaRetentionDeleteStrategy;
  surfaceFilter?: MetaWarehouseScope[] | null;
}

export interface MetaRetentionDryRunRow {
  tier: MetaRetentionTier;
  tableName: string;
  summaryKey: string;
  retentionDays: number;
  cutoffDate: string;
  executionEnabled: boolean;
  surfaceFilter?: MetaWarehouseScope[] | null;
}

export interface MetaRetentionExecutionRow extends MetaRetentionDryRunRow {
  deletedRows: number;
  mode: "dry_run" | "execute";
}

export interface MetaRetentionRunSummary {
  runId: string | null;
  startedAt: string;
  finishedAt: string;
  executionEnabled: boolean;
  mode: "dry_run" | "execute";
  skippedDueToActiveLease: boolean;
  rows: MetaRetentionExecutionRow[];
  totalDeletedRows: number;
  errorMessage?: string | null;
}

export interface MetaRetentionRunRecord {
  id: string;
  executionMode: "dry_run" | "execute";
  executionEnabled: boolean;
  skippedDueToActiveLease: boolean;
  totalDeletedRows: number;
  summaryJson: Record<string, unknown>;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

const CORE_SURFACES: MetaWarehouseScope[] = [
  "account_daily",
  "campaign_daily",
  "adset_daily",
  "ad_daily",
];
const BREAKDOWN_SURFACES: MetaWarehouseScope[] = ["breakdown_daily"];
const RETENTION_LEASE_BUSINESS_ID = "__meta_retention__";
const RETENTION_LEASE_PROVIDER_SCOPE = "meta_retention";

function envNumber(
  name:
    | "META_RETENTION_QUERY_TIMEOUT_MS"
    | "META_RETENTION_BATCH_SIZE"
    | "META_RETENTION_LEASE_MINUTES",
  fallback: number,
  env: NodeJS.ProcessEnv = process.env,
) {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBooleanFlag(
  name: "META_RETENTION_EXECUTION_ENABLED",
  fallback: boolean,
  env: NodeJS.ProcessEnv = process.env,
) {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return fallback;
}

function isMetaRetentionRuntimeAvailable(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.DATABASE_URL?.trim());
}

async function execCount(query: Promise<unknown>) {
  const rows = await query;
  const first = Array.isArray(rows) ? rows[0] : null;
  const raw = (first as { count?: number | string } | undefined)?.count ?? 0;
  const count = typeof raw === "string" ? Number(raw) : Number(raw);
  return Number.isFinite(count) ? count : 0;
}

async function deleteBatches(
  deleteBatch: () => Promise<number>,
  batchSize: number,
) {
  let totalDeleted = 0;
  while (true) {
    const deleted = await deleteBatch();
    totalDeleted += deleted;
    if (deleted < batchSize) break;
  }
  return totalDeleted;
}

function emptyRetentionRunSummary(input: {
  asOfDate: string;
  executionEnabled: boolean;
  mode: "dry_run" | "execute";
  skippedDueToActiveLease?: boolean;
  errorMessage?: string | null;
}) {
  const startedAt = new Date().toISOString();
  return {
    runId: null,
    startedAt,
    finishedAt: startedAt,
    executionEnabled: input.executionEnabled,
    mode: input.mode,
    skippedDueToActiveLease: input.skippedDueToActiveLease ?? false,
    rows: buildMetaRetentionDryRun(input.asOfDate, {
      ...process.env,
      META_RETENTION_EXECUTION_ENABLED: String(input.executionEnabled),
    }).map((row) => ({
      ...row,
      deletedRows: 0,
      mode: input.mode,
    })),
    totalDeletedRows: 0,
    errorMessage: input.errorMessage ?? null,
  } satisfies MetaRetentionRunSummary;
}

export const META_RETENTION_POLICY: MetaRetentionPolicyEntry[] = [
  {
    tier: "core_authoritative",
    label: "Meta core daily authoritative",
    retentionDays: META_AUTHORITATIVE_HISTORY_DAYS,
    tableName: "meta_account_daily",
    summaryKey: "meta_account_daily",
    dateColumn: "date",
    deleteStrategy: "date_id",
  },
  {
    tier: "core_authoritative",
    label: "Meta core daily authoritative",
    retentionDays: META_AUTHORITATIVE_HISTORY_DAYS,
    tableName: "meta_campaign_daily",
    summaryKey: "meta_campaign_daily",
    dateColumn: "date",
    deleteStrategy: "date_id",
  },
  {
    tier: "core_authoritative",
    label: "Meta core daily authoritative",
    retentionDays: META_AUTHORITATIVE_HISTORY_DAYS,
    tableName: "meta_adset_daily",
    summaryKey: "meta_adset_daily",
    dateColumn: "date",
    deleteStrategy: "date_id",
  },
  {
    tier: "core_authoritative",
    label: "Meta core daily authoritative",
    retentionDays: META_AUTHORITATIVE_HISTORY_DAYS,
    tableName: "meta_ad_daily",
    summaryKey: "meta_ad_daily",
    dateColumn: "date",
    deleteStrategy: "date_id",
  },
  {
    tier: "breakdown_authoritative",
    label: "Meta breakdown authoritative",
    retentionDays: META_BREAKDOWN_AUTHORITATIVE_HISTORY_DAYS,
    tableName: "meta_breakdown_daily",
    summaryKey: "meta_breakdown_daily",
    dateColumn: "date",
    deleteStrategy: "date_id",
  },
  {
    tier: "core_authoritative",
    label: "Meta authoritative publication pointers",
    retentionDays: META_AUTHORITATIVE_HISTORY_DAYS,
    tableName: "meta_authoritative_publication_pointers",
    summaryKey: "meta_authoritative_publication_pointers:core",
    dateColumn: "day",
    deleteStrategy: "day_id",
    surfaceFilter: CORE_SURFACES,
  },
  {
    tier: "breakdown_authoritative",
    label: "Meta authoritative publication pointers",
    retentionDays: META_BREAKDOWN_AUTHORITATIVE_HISTORY_DAYS,
    tableName: "meta_authoritative_publication_pointers",
    summaryKey: "meta_authoritative_publication_pointers:breakdown",
    dateColumn: "day",
    deleteStrategy: "day_id",
    surfaceFilter: BREAKDOWN_SURFACES,
  },
  {
    tier: "core_authoritative",
    label: "Meta authoritative slice versions",
    retentionDays: META_AUTHORITATIVE_HISTORY_DAYS,
    tableName: "meta_authoritative_slice_versions",
    summaryKey: "meta_authoritative_slice_versions:core",
    dateColumn: "day",
    deleteStrategy: "orphaned_slice_versions",
    surfaceFilter: CORE_SURFACES,
  },
  {
    tier: "breakdown_authoritative",
    label: "Meta authoritative slice versions",
    retentionDays: META_BREAKDOWN_AUTHORITATIVE_HISTORY_DAYS,
    tableName: "meta_authoritative_slice_versions",
    summaryKey: "meta_authoritative_slice_versions:breakdown",
    dateColumn: "day",
    deleteStrategy: "orphaned_slice_versions",
    surfaceFilter: BREAKDOWN_SURFACES,
  },
  {
    tier: "core_authoritative",
    label: "Meta authoritative source manifests",
    retentionDays: META_AUTHORITATIVE_HISTORY_DAYS,
    tableName: "meta_authoritative_source_manifests",
    summaryKey: "meta_authoritative_source_manifests:core",
    dateColumn: "day",
    deleteStrategy: "orphaned_source_manifests",
    surfaceFilter: CORE_SURFACES,
  },
  {
    tier: "breakdown_authoritative",
    label: "Meta authoritative source manifests",
    retentionDays: META_BREAKDOWN_AUTHORITATIVE_HISTORY_DAYS,
    tableName: "meta_authoritative_source_manifests",
    summaryKey: "meta_authoritative_source_manifests:breakdown",
    dateColumn: "day",
    deleteStrategy: "orphaned_source_manifests",
    surfaceFilter: BREAKDOWN_SURFACES,
  },
  {
    tier: "core_authoritative",
    label: "Meta authoritative reconciliation events",
    retentionDays: META_AUTHORITATIVE_HISTORY_DAYS,
    tableName: "meta_authoritative_reconciliation_events",
    summaryKey: "meta_authoritative_reconciliation_events:core",
    dateColumn: "day",
    deleteStrategy: "day_id",
    surfaceFilter: CORE_SURFACES,
  },
  {
    tier: "breakdown_authoritative",
    label: "Meta authoritative reconciliation events",
    retentionDays: META_BREAKDOWN_AUTHORITATIVE_HISTORY_DAYS,
    tableName: "meta_authoritative_reconciliation_events",
    summaryKey: "meta_authoritative_reconciliation_events:breakdown",
    dateColumn: "day",
    deleteStrategy: "day_id",
    surfaceFilter: BREAKDOWN_SURFACES,
  },
  {
    tier: "core_authoritative",
    label: "Meta authoritative day state",
    retentionDays: META_AUTHORITATIVE_HISTORY_DAYS,
    tableName: "meta_authoritative_day_state",
    summaryKey: "meta_authoritative_day_state:core",
    dateColumn: "day",
    deleteStrategy: "day_ctid",
    surfaceFilter: CORE_SURFACES,
  },
  {
    tier: "breakdown_authoritative",
    label: "Meta authoritative day state",
    retentionDays: META_BREAKDOWN_AUTHORITATIVE_HISTORY_DAYS,
    tableName: "meta_authoritative_day_state",
    summaryKey: "meta_authoritative_day_state:breakdown",
    dateColumn: "day",
    deleteStrategy: "day_ctid",
    surfaceFilter: BREAKDOWN_SURFACES,
  },
];

export const META_RETENTION_REQUIRED_TABLES = [
  "meta_account_daily",
  "meta_campaign_daily",
  "meta_adset_daily",
  "meta_ad_daily",
  "meta_breakdown_daily",
  "meta_authoritative_publication_pointers",
  "meta_authoritative_slice_versions",
  "meta_authoritative_source_manifests",
  "meta_authoritative_reconciliation_events",
  "meta_authoritative_day_state",
  "meta_retention_runs",
] as const;

export function isMetaRetentionExecutionEnabled(env: NodeJS.ProcessEnv = process.env) {
  return readBooleanFlag("META_RETENTION_EXECUTION_ENABLED", false, env);
}

export function getMetaRetentionRuntimeStatus(env: NodeJS.ProcessEnv = process.env) {
  const executionEnabled = isMetaRetentionExecutionEnabled(env);
  return {
    runtimeAvailable: isMetaRetentionRuntimeAvailable(env),
    executionEnabled,
    mode: executionEnabled ? ("execute" as const) : ("dry_run" as const),
    gateReason: executionEnabled
      ? "Meta retention execution is explicitly enabled."
      : "Meta retention execution is disabled by default. Dry-run remains available.",
  };
}

export function buildMetaRetentionDryRun(
  asOfDate: string,
  env: NodeJS.ProcessEnv = process.env,
): MetaRetentionDryRunRow[] {
  const executionEnabled = isMetaRetentionExecutionEnabled(env);
  return META_RETENTION_POLICY.map((entry) => ({
    tier: entry.tier,
    tableName: entry.tableName,
    summaryKey: entry.summaryKey,
    retentionDays: entry.retentionDays,
    cutoffDate: addDaysToIsoDate(asOfDate, -entry.retentionDays),
    executionEnabled,
    surfaceFilter: entry.surfaceFilter ?? null,
  }));
}

async function recordMetaRetentionRun(
  summary: MetaRetentionRunSummary,
): Promise<MetaRetentionRunSummary> {
  const readiness = await getDbSchemaReadiness({
    tables: ["meta_retention_runs"],
  }).catch(() => null);
  if (!readiness?.ready || !isMetaRetentionRuntimeAvailable()) {
    return summary;
  }
  const sql = getDb();
  const rows = (await sql`
    INSERT INTO meta_retention_runs (
      execution_mode,
      execution_enabled,
      skipped_due_to_active_lease,
      total_deleted_rows,
      summary_json,
      error_message,
      started_at,
      finished_at,
      updated_at
    )
    VALUES (
      ${summary.mode},
      ${summary.executionEnabled},
      ${summary.skippedDueToActiveLease},
      ${summary.totalDeletedRows},
      ${JSON.stringify({ rows: summary.rows })}::jsonb,
      ${summary.errorMessage ?? null},
      ${summary.startedAt},
      ${summary.finishedAt},
      now()
    )
    RETURNING id
  `) as Array<{ id: string }>;
  return {
    ...summary,
    runId: rows[0]?.id ?? summary.runId,
  };
}

export async function getLatestMetaRetentionRun() {
  const readiness = await getDbSchemaReadiness({
    tables: ["meta_retention_runs"],
  }).catch(() => null);
  if (!readiness?.ready || !isMetaRetentionRuntimeAvailable()) {
    return null;
  }
  const sql = getDb();
  const rows = (await sql`
    SELECT *
    FROM meta_retention_runs
    ORDER BY finished_at DESC NULLS LAST, created_at DESC
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    executionMode: String(row.execution_mode ?? "dry_run") as "dry_run" | "execute",
    executionEnabled: Boolean(row.execution_enabled),
    skippedDueToActiveLease: Boolean(row.skipped_due_to_active_lease),
    totalDeletedRows: Number(row.total_deleted_rows ?? 0),
    summaryJson:
      row.summary_json && typeof row.summary_json === "object"
        ? (row.summary_json as Record<string, unknown>)
        : {},
    errorMessage: row.error_message ? String(row.error_message) : null,
    startedAt: row.started_at ? new Date(String(row.started_at)).toISOString() : new Date().toISOString(),
    finishedAt: row.finished_at ? new Date(String(row.finished_at)).toISOString() : null,
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null,
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
  } satisfies MetaRetentionRunRecord;
}

function surfaceFilterParams(entry: MetaRetentionPolicyEntry) {
  return (entry.surfaceFilter ?? []) as string[];
}

async function executeMetaRetentionEntryDelete(input: {
  sql: ReturnType<typeof getDbWithTimeout>;
  entry: MetaRetentionPolicyEntry;
  cutoffDate: string;
  batchSize: number;
}) {
  const surfaceFilter = surfaceFilterParams(input.entry);
  switch (input.entry.deleteStrategy) {
    case "date_id":
      return deleteBatches(
        () =>
          execCount(
            input.sql.query(
              `
                WITH candidates AS (
                  SELECT id
                  FROM ${input.entry.tableName}
                  WHERE ${input.entry.dateColumn} < $1
                  ORDER BY ${input.entry.dateColumn} ASC, id ASC
                  LIMIT $2
                  FOR UPDATE SKIP LOCKED
                ),
                deleted AS (
                  DELETE FROM ${input.entry.tableName} target
                  USING candidates
                  WHERE target.id = candidates.id
                  RETURNING 1
                )
                SELECT COUNT(*)::int AS count FROM deleted
              `,
              [input.cutoffDate, input.batchSize],
            ),
          ),
        input.batchSize,
      );
    case "day_id":
      return deleteBatches(
        () =>
          execCount(
            input.sql.query(
              `
                WITH candidates AS (
                  SELECT id
                  FROM ${input.entry.tableName}
                  WHERE ${input.entry.dateColumn} < $1
                    AND surface = ANY($2::text[])
                  ORDER BY ${input.entry.dateColumn} ASC, id ASC
                  LIMIT $3
                  FOR UPDATE SKIP LOCKED
                ),
                deleted AS (
                  DELETE FROM ${input.entry.tableName} target
                  USING candidates
                  WHERE target.id = candidates.id
                  RETURNING 1
                )
                SELECT COUNT(*)::int AS count FROM deleted
              `,
              [input.cutoffDate, surfaceFilter, input.batchSize],
            ),
          ),
        input.batchSize,
      );
    case "day_ctid":
      return deleteBatches(
        () =>
          execCount(
            input.sql.query(
              `
                WITH candidates AS (
                  SELECT ctid
                  FROM ${input.entry.tableName}
                  WHERE ${input.entry.dateColumn} < $1
                    AND surface = ANY($2::text[])
                  ORDER BY ${input.entry.dateColumn} ASC
                  LIMIT $3
                ),
                deleted AS (
                  DELETE FROM ${input.entry.tableName} target
                  USING candidates
                  WHERE target.ctid = candidates.ctid
                  RETURNING 1
                )
                SELECT COUNT(*)::int AS count FROM deleted
              `,
              [input.cutoffDate, surfaceFilter, input.batchSize],
            ),
          ),
        input.batchSize,
      );
    case "orphaned_slice_versions":
      return deleteBatches(
        () =>
          execCount(
            input.sql.query(
              `
                WITH candidates AS (
                  SELECT slice.id
                  FROM meta_authoritative_slice_versions slice
                  LEFT JOIN meta_authoritative_publication_pointers pointer
                    ON pointer.active_slice_version_id = slice.id
                  WHERE slice.day < $1
                    AND slice.surface = ANY($2::text[])
                    AND pointer.id IS NULL
                  ORDER BY slice.day ASC, slice.id ASC
                  LIMIT $3
                  FOR UPDATE SKIP LOCKED
                ),
                deleted AS (
                  DELETE FROM meta_authoritative_slice_versions target
                  USING candidates
                  WHERE target.id = candidates.id
                  RETURNING 1
                )
                SELECT COUNT(*)::int AS count FROM deleted
              `,
              [input.cutoffDate, surfaceFilter, input.batchSize],
            ),
          ),
        input.batchSize,
      );
    case "orphaned_source_manifests":
      return deleteBatches(
        () =>
          execCount(
            input.sql.query(
              `
                WITH candidates AS (
                  SELECT manifest.id
                  FROM meta_authoritative_source_manifests manifest
                  LEFT JOIN meta_authoritative_slice_versions slice
                    ON slice.manifest_id = manifest.id
                  WHERE manifest.day < $1
                    AND manifest.surface = ANY($2::text[])
                    AND slice.id IS NULL
                  ORDER BY manifest.day ASC, manifest.id ASC
                  LIMIT $3
                  FOR UPDATE SKIP LOCKED
                ),
                deleted AS (
                  DELETE FROM meta_authoritative_source_manifests target
                  USING candidates
                  WHERE target.id = candidates.id
                  RETURNING 1
                )
                SELECT COUNT(*)::int AS count FROM deleted
              `,
              [input.cutoffDate, surfaceFilter, input.batchSize],
            ),
          ),
        input.batchSize,
      );
  }
}

export async function executeMetaRetentionPolicy(input: {
  asOfDate: string;
  env?: NodeJS.ProcessEnv;
  forceExecute?: boolean;
}) {
  const env = input.env ?? process.env;
  const runtime = getMetaRetentionRuntimeStatus(env);
  const executionEnabled = runtime.executionEnabled;
  const mode =
    executionEnabled || input.forceExecute ? ("execute" as const) : ("dry_run" as const);

  if (!isMetaRetentionRuntimeAvailable(env)) {
    return emptyRetentionRunSummary({
      asOfDate: input.asOfDate,
      executionEnabled,
      mode,
      errorMessage: "DATABASE_URL is not configured.",
    });
  }

  await assertDbSchemaReady({
    tables: [...META_RETENTION_REQUIRED_TABLES],
    context: "meta_retention",
  });
  const sql = getDbWithTimeout(envNumber("META_RETENTION_QUERY_TIMEOUT_MS", 30_000, env));
  const batchSize = envNumber("META_RETENTION_BATCH_SIZE", 250, env);
  const leaseMinutes = envNumber("META_RETENTION_LEASE_MINUTES", 15, env);
  const leaseOwner = `meta-retention:${process.pid}:${randomUUID().slice(0, 8)}`;
  const leaseAcquired = await acquireSyncRunnerLease({
    businessId: RETENTION_LEASE_BUSINESS_ID,
    providerScope: RETENTION_LEASE_PROVIDER_SCOPE,
    leaseOwner,
    leaseMinutes,
  }).catch(() => false);

  if (!leaseAcquired) {
    return recordMetaRetentionRun(
      emptyRetentionRunSummary({
        asOfDate: input.asOfDate,
        executionEnabled,
        mode,
        skippedDueToActiveLease: true,
      }),
    );
  }

  const startedAt = new Date().toISOString();
  try {
    const rows: MetaRetentionExecutionRow[] = [];
    for (const entry of META_RETENTION_POLICY) {
      const cutoffDate = addDaysToIsoDate(input.asOfDate, -entry.retentionDays);
      let deletedRows = 0;
      if (mode === "execute") {
        deletedRows = await executeMetaRetentionEntryDelete({
          sql,
          entry,
          cutoffDate,
          batchSize,
        });
      }
      rows.push({
        tier: entry.tier,
        tableName: entry.tableName,
        summaryKey: entry.summaryKey,
        retentionDays: entry.retentionDays,
        cutoffDate,
        executionEnabled,
        deletedRows,
        mode,
        surfaceFilter: entry.surfaceFilter ?? null,
      });
    }

    const summary = {
      runId: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      executionEnabled,
      mode,
      skippedDueToActiveLease: false,
      rows,
      totalDeletedRows: rows.reduce((sum, row) => sum + row.deletedRows, 0),
      errorMessage: null,
    } satisfies MetaRetentionRunSummary;
    return await recordMetaRetentionRun(summary);
  } catch (error) {
    const failedSummary = {
      runId: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      executionEnabled,
      mode,
      skippedDueToActiveLease: false,
      rows: buildMetaRetentionDryRun(input.asOfDate, env).map((row) => ({
        ...row,
        deletedRows: 0,
        mode,
      })),
      totalDeletedRows: 0,
      errorMessage: error instanceof Error ? error.message : String(error),
    } satisfies MetaRetentionRunSummary;
    await recordMetaRetentionRun(failedSummary).catch(() => null);
    throw error;
  } finally {
    await releaseSyncRunnerLease({
      businessId: RETENTION_LEASE_BUSINESS_ID,
      providerScope: RETENTION_LEASE_PROVIDER_SCOPE,
      leaseOwner,
    }).catch(() => null);
  }
}

export async function executeMetaRetentionPolicyDryRunOnly(input: {
  asOfDate: string;
  env?: NodeJS.ProcessEnv;
}) {
  return {
    executionEnabled: isMetaRetentionExecutionEnabled(input.env),
    dryRun: buildMetaRetentionDryRun(input.asOfDate, input.env),
  };
}
