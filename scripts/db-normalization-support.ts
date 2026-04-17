import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getDb, getDbRuntimeDiagnostics, getDbWithTimeout } from "@/lib/db";
import {
  getIntegration,
  upsertIntegration,
  disconnectIntegration,
} from "@/lib/integrations";
import {
  clearProviderAccountAssignments,
  getProviderAccountAssignments,
  upsertProviderAccountAssignments,
} from "@/lib/provider-account-assignments";
import { writeProviderAccountSnapshot } from "@/lib/provider-account-snapshots";
import {
  materializeOverviewSummaryRange,
  materializeOverviewSummaryRows,
} from "@/lib/overview-summary-materializer";
import type { MetaAccountDailyRow, MetaCampaignDailyRow } from "@/lib/meta/warehouse-types";
import {
  upsertMetaAccountDailyRows,
  upsertMetaCampaignDailyRows,
} from "@/lib/meta/warehouse";
import type {
  GoogleAdsWarehouseDailyRow,
  GoogleAdsWarehouseScope,
} from "@/lib/google-ads/warehouse-types";
import { upsertGoogleAdsDailyRows } from "@/lib/google-ads/warehouse";
import type {
  ShopifyOrderLineWarehouseRow,
  ShopifyOrderTransactionWarehouseRow,
  ShopifyOrderWarehouseRow,
  ShopifyRefundWarehouseRow,
  ShopifyReturnWarehouseRow,
} from "@/lib/shopify/warehouse-types";
import {
  upsertShopifyOrderLines,
  upsertShopifyOrderTransactions,
  upsertShopifyOrders,
  upsertShopifyRefunds,
  upsertShopifyReturns,
} from "@/lib/shopify/warehouse";
import type { OverviewSummaryDailyRow } from "@/lib/overview-summary-store";
import { configureOperationalScriptRuntime } from "./_operational-runtime";

export type BenchmarkPhase = "before" | "after";

export interface BenchmarkScenarioResult {
  name: string;
  iterations: number;
  averageMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  sampleCardinality: number | null;
  validityNote: string;
  sourceKey: string | null;
}

export interface BenchmarkSeriesResult {
  selectedBusinessId: string;
  selectionMode: string;
  selectionEvidence: Record<string, unknown>;
  capturedAt: string;
  scenarios: BenchmarkScenarioResult[];
}

export interface DbNormalizationCaptureArtifact {
  phase: BenchmarkPhase;
  capturedAt: string;
  runDir: string;
  artifactDir: string;
  baselineSql: {
    path: string;
    sha256: string;
    sizeBytes: number;
  };
  hostMemory: HostMemorySnapshot;
  postgresConfig: PostgresConfigSnapshot;
  dbSize: DatabaseSizeSnapshot;
  dbRuntime: ReturnType<typeof getDbRuntimeDiagnostics>;
  storage: StorageSnapshot;
  baselineChecks: BaselineChecksSnapshot;
  readBenchmark: BenchmarkSeriesResult;
  writeBenchmark: BenchmarkSeriesResult | null;
}

export interface HostMemorySnapshot {
  platform: NodeJS.Platform;
  source: "linux_proc_meminfo" | "macos_vm_stat" | "os_fallback" | "unavailable";
  totalBytes: number | null;
  availableBytes: number | null;
  freeBytes: number | null;
  swapTotalBytes: number | null;
  swapFreeBytes: number | null;
  details: Record<string, unknown>;
}

export interface PostgresConfigSnapshot {
  serverVersion: string | null;
  settings: Record<string, string | null>;
}

export interface DatabaseSizeSnapshot {
  databaseBytes: number | null;
  tableBytes: number | null;
  indexBytes: number | null;
  relationCount: number;
  byTable: Array<{
    schemaName: string;
    tableName: string;
    family: string;
    approxRows: number;
    tableBytes: number;
    indexBytes: number;
    totalBytes: number;
  }>;
  byFamily: Array<{
    family: string;
    tableCount: number;
    approxRows: number;
    tableBytes: number;
    indexBytes: number;
    totalBytes: number;
  }>;
}

export interface StorageSnapshot {
  relationSizes: Array<{
    relationName: string;
    totalBytes: number;
    tableBytes: number;
    indexBytes: number;
    liveRows: number;
    lastAnalyze: string | null;
    lastAutoAnalyze: string | null;
    lastVacuum: string | null;
    lastAutoVacuum: string | null;
  }>;
  indexSizes: Array<{
    relationName: string;
    indexName: string;
    totalBytes: number;
    idxScan: number;
  }>;
  activitySummary: Array<{
    applicationName: string;
    state: string;
    waitEventType: string;
    waitEvent: string;
    connectionCount: number;
  }>;
  longTransactions: Array<{
    pid: number;
    applicationName: string;
    state: string;
    xactAge: string | null;
    queryAge: string | null;
    waitEventType: string;
    waitEvent: string;
    query: string;
  }>;
  blockedLocks: Array<{
    blockedPid: number;
    blockedApplicationName: string;
    blockerPid: number;
    blockerApplicationName: string;
    blockedQueryAge: string | null;
    blockedQuery: string;
    blockerQuery: string;
  }>;
  pgStatStatements: {
    enabled: boolean;
    error: string | null;
    topStatements: Array<Record<string, unknown>>;
  };
}

export interface BaselineChecksSnapshot {
  file: {
    path: string;
    sha256: string;
    sizeBytes: number;
  };
  tableCoverage: {
    rows: Array<Record<string, unknown>>;
    familyCounts: Array<Record<string, unknown>>;
  };
  duplicateNaturalKeys: Array<Record<string, unknown>>;
  nullAnomalies: Array<Record<string, unknown>>;
  coverageGaps: Array<Record<string, unknown>>;
  projectionParity: Array<Record<string, unknown>>;
  providerSanityAggregates: Array<Record<string, unknown>>;
}

type RawSeriesPoint = {
  label: string;
  value: number;
};

function toIso(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : String(value);
}

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toMaybeNumber(value: unknown) {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percentile(values: number[], percentileRank: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 1) return sorted[0]!;
  const index = (sorted.length - 1) * percentileRank;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function classifyTableFamily(tableName: string) {
  if (
    [
      "users",
      "businesses",
      "memberships",
      "sessions",
      "invites",
      "provider_accounts",
      "provider_connections",
      "integration_credentials",
      "business_provider_accounts",
      "provider_account_snapshot_runs",
      "provider_account_snapshot_items",
      "business_cost_models",
      "shopify_subscriptions",
      "shopify_install_contexts",
      "discount_codes",
      "discount_redemptions",
      "custom_reports",
    ].includes(tableName)
  ) {
    return "core";
  }
  if (tableName.startsWith("meta_sync_") || tableName.startsWith("google_ads_sync_") || tableName.startsWith("sync_") || tableName.endsWith("_leases")) {
    return "control";
  }
  if (tableName.startsWith("meta_raw_") || tableName.startsWith("google_ads_raw_") || tableName.startsWith("shopify_raw_")) {
    return "raw";
  }
  if (
    tableName.startsWith("meta_") ||
    tableName.startsWith("google_ads_") ||
    tableName.startsWith("shopify_") ||
    tableName.startsWith("platform_overview_") ||
    tableName.startsWith("provider_reporting_") ||
    tableName.startsWith("seo_") ||
    tableName.startsWith("ai_")
  ) {
    return "warehouse";
  }
  if (
    tableName.startsWith("creative_") ||
    tableName.includes("_cache") ||
    tableName.includes("_snapshot") ||
    tableName.includes("_summary")
  ) {
    return "serving";
  }
  if (tableName.endsWith("_audit_logs") || tableName.endsWith("_events") || tableName.includes("webhook")) {
    return "audit";
  }
  return "other";
}

function makeStableUuid(seed: string) {
  const hex = createHash("sha1").update(seed).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function parseBenchmarkArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = argv[index + 1] && !argv[index + 1]!.startsWith("--") ? argv[index + 1]! : "true";
    args.set(key, value);
    if (value !== "true") index += 1;
  }
  return args;
}

export interface ParsedCliArgs {
  flags: Set<string>;
  positionals: string[];
  values: Map<string, string>;
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const flags = new Set<string>();
  const positionals: string[] = [];
  const values = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const body = token.slice(2);
    const equalsIndex = body.indexOf("=");
    if (equalsIndex >= 0) {
      const key = body.slice(0, equalsIndex).trim();
      const value = body.slice(equalsIndex + 1).trim();
      if (key) {
        values.set(key, value);
        flags.add(key);
      }
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      values.set(body, next);
      flags.add(body);
      index += 1;
      continue;
    }

    values.set(body, "true");
    flags.add(body);
  }

  return {
    flags,
    positionals,
    values,
  };
}

export function getOptionalCliValue(
  parsed: ParsedCliArgs,
  key: string,
  fallback: string | null = null,
) {
  return parsed.values.get(key) ?? fallback;
}

export function getRequiredCliValue(parsed: ParsedCliArgs, key: string) {
  const value = getOptionalCliValue(parsed, key, null);
  if (!value) {
    throw new Error(`Missing required argument --${key}`);
  }
  return value;
}

export function normalizeDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const parsed = new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function normalizeTimestamp(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function summarizeDurations(durations: number[]) {
  const points = durations.map((value, index) => ({
    label: `sample-${index + 1}`,
    value,
  }));
  return summarizeBenchmarkResult(points);
}

export function splitSqlStatements(sqlText: string) {
  const statements: string[] = [];
  let current = "";
  let inBlockComment = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inSingleQuote = false;

  for (let index = 0; index < sqlText.length; index += 1) {
    const char = sqlText[index]!;
    const next = sqlText[index + 1] ?? "";

    if (inLineComment) {
      current += char;
      if (char === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      current += char;
      if (char === "*" && next === "/") {
        current += next;
        index += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === "-" && next === "-") {
      current += char;
      current += next;
      index += 1;
      inLineComment = true;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === "/" && next === "*") {
      current += char;
      current += next;
      index += 1;
      inBlockComment = true;
      continue;
    }

    if (!inDoubleQuote && char === "'") {
      current += char;
      if (inSingleQuote && next === "'") {
        current += next;
        index += 1;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (!inSingleQuote && char === "\"") {
      current += char;
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && char === ";") {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = "";
      continue;
    }

    current += char;
  }

  const tail = current.trim();
  if (tail) {
    statements.push(tail);
  }
  return statements;
}

export function loadTrackedTablesFromBaselineSql(repoRoot: string) {
  const sqlPath = path.resolve(repoRoot, "docs/architecture/live-db-baseline-checks.sql");
  const sqlText = readFileSync(sqlPath, "utf8");
  const tableMap = new Map<string, { family: string; tableName: string }>();

  for (const match of sqlText.matchAll(/\('([^']+)',\s*'([^']+)'\)/g)) {
    const family = match[1]?.trim();
    const tableName = match[2]?.trim();
    if (!family || !tableName) continue;
    tableMap.set(`${family}:${tableName}`, { family, tableName });
  }

  return {
    sqlPath,
    sqlText,
    trackedTables: [...tableMap.values()],
  };
}

function tryParseJsonOutput<T>(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const candidates = [
    trimmed,
    trimmed.slice(Math.max(trimmed.lastIndexOf("\n{") + 1, 0)),
    trimmed.slice(Math.max(trimmed.lastIndexOf("\n[") + 1, 0)),
  ].filter((candidate, index, all) => candidate.length > 0 && all.indexOf(candidate) === index);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      continue;
    }
  }

  return null;
}

export async function runTsxScriptJson<T>(scriptPath: string, args: string[]) {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", path.resolve(scriptPath), ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
    },
  );

  if (result.status !== 0) {
    throw new Error(
      [
        `Failed to execute ${scriptPath}`,
        result.stderr?.trim() || null,
        result.stdout?.trim() || null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  const payload = tryParseJsonOutput<T>(result.stdout ?? "");
  if (payload == null) {
    throw new Error(`Failed to parse JSON output from ${scriptPath}`);
  }
  return payload;
}

export async function captureHostMemorySnapshot() {
  return collectHostMemorySnapshot();
}

export function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export async function writeJsonFile(filePath: string, value: unknown) {
  await writeJsonArtifact(filePath, value);
}

export async function writeTextFile(filePath: string, value: string) {
  await writeTextArtifact(filePath, value);
}

export function parsePhase(value: string | null | undefined): BenchmarkPhase {
  return value === "after" ? "after" : "before";
}

export interface BenchmarkProviderCandidate {
  provider: "meta" | "google" | "shopify";
  businessId: string;
  rowCount: number;
}

export function chooseDeterministicBenchmarkBusiness(
  candidates: BenchmarkProviderCandidate[],
) {
  const scoreByBusiness = new Map<
    string,
    { providerCount: number; totalRowCount: number; providers: string[] }
  >();
  for (const candidate of candidates) {
    const current =
      scoreByBusiness.get(candidate.businessId) ??
      { providerCount: 0, totalRowCount: 0, providers: [] as string[] };
    current.providerCount += 1;
    current.totalRowCount += candidate.rowCount;
    current.providers.push(candidate.provider);
    scoreByBusiness.set(candidate.businessId, current);
  }

  const chosen = [...scoreByBusiness.entries()]
    .map(([businessId, score]) => ({ businessId, ...score }))
    .sort(
      (left, right) =>
        right.providerCount - left.providerCount ||
        right.totalRowCount - left.totalRowCount ||
        left.businessId.localeCompare(right.businessId),
    )[0];

  return chosen ?? null;
}

export function buildNormalizationRunDir(input?: { runDir?: string | null; at?: Date }) {
  if (input?.runDir) return path.resolve(input.runDir);
  const timestamp = (input?.at ?? new Date()).toISOString().replace(/[:.]/g, "-");
  return path.resolve("docs/benchmarks/db-normalization", timestamp);
}

export function buildNormalizationArtifactDir(input: { runDir: string; phase: BenchmarkPhase }) {
  return path.join(path.resolve(input.runDir), input.phase);
}

export async function ensureNormalizationArtifactDir(input: {
  runDir: string;
  phase: BenchmarkPhase;
}) {
  const artifactDir = buildNormalizationArtifactDir(input);
  await mkdir(artifactDir, { recursive: true });
  return artifactDir;
}

export async function writeJsonArtifact(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeTextArtifact(filePath: string, value: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

export function getDateRange(days: number, endOffsetDays = 1) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - endOffsetDays);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(0, days - 1));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function collectLinuxMemorySnapshot(): HostMemorySnapshot | null {
  const result = spawnSync("cat", ["/proc/meminfo"], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout) return null;
  const lines = result.stdout.split(/\r?\n/);
  const values = new Map<string, number>();
  for (const line of lines) {
    const match = line.match(/^([A-Za-z_()]+):\s+(\d+)\s+kB$/);
    if (!match) continue;
    values.set(match[1]!, Number(match[2]) * 1024);
  }
  return {
    platform: process.platform,
    source: "linux_proc_meminfo",
    totalBytes: values.get("MemTotal") ?? null,
    availableBytes: values.get("MemAvailable") ?? null,
    freeBytes: values.get("MemFree") ?? null,
    swapTotalBytes: values.get("SwapTotal") ?? null,
    swapFreeBytes: values.get("SwapFree") ?? null,
    details: Object.fromEntries(values.entries()),
  };
}

function collectMacMemorySnapshot(): HostMemorySnapshot | null {
  const vmStat = spawnSync("vm_stat", [], { encoding: "utf8" });
  if (vmStat.status !== 0 || !vmStat.stdout) return null;
  const sysctl = spawnSync("sysctl", ["-n", "hw.memsize"], { encoding: "utf8" });
  const totalBytes = sysctl.status === 0 ? Number(sysctl.stdout.trim()) : null;
  const pageSizeResult = spawnSync("sysctl", ["-n", "hw.pagesize"], { encoding: "utf8" });
  const pageSize = pageSizeResult.status === 0 ? Number(pageSizeResult.stdout.trim()) : 4096;
  const values: Record<string, number> = {};
  for (const line of vmStat.stdout.split(/\r?\n/)) {
    const match = line.match(/^([^:]+):\s+([0-9.]+)\./);
    if (!match) continue;
    values[match[1]!.trim()] = Number(match[2]) * pageSize;
  }
  const availableBytes =
    (values["Pages free"] ?? 0) + (values["Pages speculative"] ?? 0) + (values["Pages inactive"] ?? 0);
  return {
    platform: process.platform,
    source: "macos_vm_stat",
    totalBytes: Number.isFinite(totalBytes ?? NaN) ? totalBytes : null,
    availableBytes,
    freeBytes: values["Pages free"] ?? null,
    swapTotalBytes: null,
    swapFreeBytes: null,
    details: {
      vm_stat: values,
      hw_memsize: totalBytes,
      hw_pagesize: pageSize,
    },
  };
}

export function collectHostMemorySnapshot(): HostMemorySnapshot {
  if (process.platform === "linux") {
    return collectLinuxMemorySnapshot() ?? {
      platform: process.platform,
      source: "os_fallback",
      totalBytes: os.totalmem(),
      availableBytes: os.freemem(),
      freeBytes: os.freemem(),
      swapTotalBytes: null,
      swapFreeBytes: null,
      details: { freemem: os.freemem(), totalmem: os.totalmem() },
    };
  }
  if (process.platform === "darwin") {
    return collectMacMemorySnapshot() ?? {
      platform: process.platform,
      source: "os_fallback",
      totalBytes: os.totalmem(),
      availableBytes: os.freemem(),
      freeBytes: os.freemem(),
      swapTotalBytes: null,
      swapFreeBytes: null,
      details: { freemem: os.freemem(), totalmem: os.totalmem() },
    };
  }
  return {
    platform: process.platform,
    source: "os_fallback",
    totalBytes: os.totalmem(),
    availableBytes: os.freemem(),
    freeBytes: os.freemem(),
    swapTotalBytes: null,
    swapFreeBytes: null,
    details: { freemem: os.freemem(), totalmem: os.totalmem() },
  };
}

export async function collectPostgresConfigSnapshot() {
  const sql = getDbWithTimeout(30_000);
  const rows = (await sql.query(
    `
      SELECT name, setting, unit
      FROM pg_settings
      WHERE name = ANY($1::text[])
      ORDER BY name
    `,
    [[
      "shared_buffers",
      "effective_cache_size",
      "work_mem",
      "maintenance_work_mem",
      "max_connections",
      "checkpoint_timeout",
      "max_wal_size",
      "shared_preload_libraries",
      "autovacuum",
      "autovacuum_max_workers",
      "autovacuum_vacuum_cost_limit",
      "autovacuum_vacuum_scale_factor",
      "autovacuum_analyze_scale_factor",
    ]],
  )) as Array<{ name: string; setting: string | null; unit: string | null }>;

  const settings: Record<string, string | null> = {};
  for (const row of rows) {
    settings[row.name] = row.setting;
  }

  const versionRows = (await sql.query(
    "SELECT version() AS version",
  )) as Array<{ version: string }>;

  return {
    serverVersion: versionRows[0]?.version ?? null,
    settings,
  };
}

export async function collectDatabaseSizeSnapshot() {
  const sql = getDbWithTimeout(30_000);
  const relationRows = (await sql.query(
    `
      SELECT
        s.schemaname AS schema_name,
        s.relname AS table_name,
        COALESCE(s.n_live_tup, c.reltuples::bigint, 0)::bigint AS approx_rows,
        pg_relation_size(s.relid)::bigint AS table_bytes,
        GREATEST(pg_total_relation_size(s.relid) - pg_relation_size(s.relid), 0)::bigint AS index_bytes,
        pg_total_relation_size(s.relid)::bigint AS total_bytes
      FROM pg_stat_user_tables s
      JOIN pg_class c ON c.oid = s.relid
      ORDER BY total_bytes DESC, s.relname ASC
    `,
  )) as Array<{
    schema_name: string;
    table_name: string;
    approx_rows: number;
    table_bytes: number;
    index_bytes: number;
    total_bytes: number;
  }>;

  const byFamily = new Map<
    string,
    { tableCount: number; approxRows: number; tableBytes: number; indexBytes: number; totalBytes: number }
  >();
  for (const row of relationRows) {
    const family = classifyTableFamily(row.table_name);
    const current =
      byFamily.get(family) ??
      { tableCount: 0, approxRows: 0, tableBytes: 0, indexBytes: 0, totalBytes: 0 };
    current.tableCount += 1;
    current.approxRows += toNumber(row.approx_rows);
    current.tableBytes += toNumber(row.table_bytes);
    current.indexBytes += toNumber(row.index_bytes);
    current.totalBytes += toNumber(row.total_bytes);
    byFamily.set(family, current);
  }

  const databaseRows = (await sql.query(
    "SELECT pg_database_size(current_database())::bigint AS database_bytes",
  )) as Array<{ database_bytes: number }>;

  return {
    databaseBytes: toMaybeNumber(databaseRows[0]?.database_bytes),
    tableBytes: relationRows.reduce((sum, row) => sum + toNumber(row.table_bytes), 0),
    indexBytes: relationRows.reduce((sum, row) => sum + toNumber(row.index_bytes), 0),
    relationCount: relationRows.length,
    byTable: relationRows.map((row) => ({
      schemaName: row.schema_name,
      tableName: row.table_name,
      family: classifyTableFamily(row.table_name),
      approxRows: toNumber(row.approx_rows),
      tableBytes: toNumber(row.table_bytes),
      indexBytes: toNumber(row.index_bytes),
      totalBytes: toNumber(row.total_bytes),
    })),
    byFamily: [...byFamily.entries()].map(([family, value]) => ({
      family,
      tableCount: value.tableCount,
      approxRows: value.approxRows,
      tableBytes: value.tableBytes,
      indexBytes: value.indexBytes,
      totalBytes: value.totalBytes,
    })),
  } satisfies DatabaseSizeSnapshot;
}

export async function collectStorageSnapshot() {
  const sql = getDbWithTimeout(30_000);
  const [relationRows, indexRows, activityRows, longTransactionRows, blockedRows, statementsEnabledRows] =
    await Promise.all([
      sql.query(
        `
          SELECT
            stat.relname AS relation_name,
            stat.n_live_tup::bigint AS live_rows,
            pg_total_relation_size(stat.relid)::bigint AS total_bytes,
            pg_relation_size(stat.relid)::bigint AS table_bytes,
            GREATEST(pg_total_relation_size(stat.relid) - pg_relation_size(stat.relid), 0)::bigint AS index_bytes,
            stat.last_analyze,
            stat.last_autoanalyze,
            stat.last_vacuum,
            stat.last_autovacuum
          FROM pg_stat_user_tables stat
          ORDER BY total_bytes DESC, relation_name ASC
        `,
      ),
      sql.query(
        `
          SELECT
            table_stat.relname AS relation_name,
            index_stat.indexrelname AS index_name,
            pg_relation_size(index_stat.indexrelid)::bigint AS total_bytes,
            index_stat.idx_scan::bigint AS idx_scan
          FROM pg_stat_user_indexes index_stat
          JOIN pg_stat_user_tables table_stat
            ON table_stat.relid = index_stat.relid
          ORDER BY total_bytes DESC, relation_name ASC, index_name ASC
        `,
      ),
      sql.query(
        `
          SELECT
            COALESCE(application_name, '') AS application_name,
            COALESCE(state, 'unknown') AS state,
            COALESCE(wait_event_type, '') AS wait_event_type,
            COALESCE(wait_event, '') AS wait_event,
            COUNT(*)::int AS connection_count
          FROM pg_stat_activity
          WHERE datname = current_database()
          GROUP BY application_name, state, wait_event_type, wait_event
          ORDER BY connection_count DESC, application_name ASC
        `,
      ),
      sql.query(
        `
          SELECT
            pid,
            COALESCE(application_name, '') AS application_name,
            COALESCE(state, 'unknown') AS state,
            now() - xact_start AS xact_age,
            now() - query_start AS query_age,
            COALESCE(wait_event_type, '') AS wait_event_type,
            COALESCE(wait_event, '') AS wait_event,
            LEFT(regexp_replace(query, '\\s+', ' ', 'g'), 220) AS query
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND xact_start IS NOT NULL
            AND now() - xact_start > interval '5 minutes'
          ORDER BY xact_start ASC
          LIMIT 10
        `,
      ),
      sql.query(
        `
          SELECT
            blocked_activity.pid AS blocked_pid,
            COALESCE(blocked_activity.application_name, '') AS blocked_application_name,
            blocker_activity.pid AS blocker_pid,
            COALESCE(blocker_activity.application_name, '') AS blocker_application_name,
            now() - blocked_activity.query_start AS blocked_query_age,
            LEFT(regexp_replace(blocked_activity.query, '\\s+', ' ', 'g'), 160) AS blocked_query,
            LEFT(regexp_replace(blocker_activity.query, '\\s+', ' ', 'g'), 160) AS blocker_query
          FROM pg_locks blocked_lock
          JOIN pg_stat_activity blocked_activity
            ON blocked_activity.pid = blocked_lock.pid
          JOIN pg_locks blocker_lock
            ON blocker_lock.locktype = blocked_lock.locktype
           AND blocker_lock.database IS NOT DISTINCT FROM blocked_lock.database
           AND blocker_lock.relation IS NOT DISTINCT FROM blocked_lock.relation
           AND blocker_lock.page IS NOT DISTINCT FROM blocked_lock.page
           AND blocker_lock.tuple IS NOT DISTINCT FROM blocked_lock.tuple
           AND blocker_lock.virtualxid IS NOT DISTINCT FROM blocked_lock.virtualxid
           AND blocker_lock.transactionid IS NOT DISTINCT FROM blocked_lock.transactionid
           AND blocker_lock.classid IS NOT DISTINCT FROM blocked_lock.classid
           AND blocker_lock.objid IS NOT DISTINCT FROM blocked_lock.objid
           AND blocker_lock.objsubid IS NOT DISTINCT FROM blocked_lock.objsubid
           AND blocker_lock.pid <> blocked_lock.pid
          JOIN pg_stat_activity blocker_activity
            ON blocker_activity.pid = blocker_lock.pid
          WHERE NOT blocked_lock.granted
            AND blocker_lock.granted
          ORDER BY blocked_activity.query_start ASC
          LIMIT 10
        `,
      ),
      sql.query(
        `
          SELECT EXISTS (
            SELECT 1
            FROM pg_extension
            WHERE extname = 'pg_stat_statements'
          ) AS enabled
        `,
      ),
    ]);

  let pgStatStatements = {
    enabled: false,
    error: null as string | null,
    topStatements: [] as Array<Record<string, unknown>>,
  };
  try {
    if (Boolean((statementsEnabledRows as Array<{ enabled: boolean }>)[0]?.enabled)) {
      const topStatements = (await sql.query(
        `
          SELECT
            queryid::text AS query_id,
            calls::bigint AS calls,
            ROUND(total_exec_time::numeric, 2) AS total_exec_time_ms,
            ROUND(mean_exec_time::numeric, 2) AS mean_exec_time_ms,
            rows::bigint AS rows,
            shared_blks_hit::bigint AS shared_blks_hit,
            shared_blks_read::bigint AS shared_blks_read,
            LEFT(regexp_replace(query, '\\s+', ' ', 'g'), 220) AS query
          FROM pg_stat_statements
          ORDER BY total_exec_time DESC
          LIMIT 10
        `,
      )) as Array<Record<string, unknown>>;
      pgStatStatements = { enabled: true, error: null, topStatements };
    }
  } catch (error) {
    pgStatStatements = {
      enabled: true,
      error: error instanceof Error ? error.message : String(error),
      topStatements: [],
    };
  }

  return {
    relationSizes: (relationRows as Array<Record<string, unknown>>).map((row) => ({
      relationName: String(row.relation_name),
      totalBytes: toNumber(row.total_bytes),
      tableBytes: toNumber(row.table_bytes),
      indexBytes: toNumber(row.index_bytes),
      liveRows: toNumber(row.live_rows),
      lastAnalyze: toIso(row.last_analyze),
      lastAutoAnalyze: toIso(row.last_autoanalyze),
      lastVacuum: toIso(row.last_vacuum),
      lastAutoVacuum: toIso(row.last_autovacuum),
    })),
    indexSizes: (indexRows as Array<Record<string, unknown>>).map((row) => ({
      relationName: String(row.relation_name),
      indexName: String(row.index_name),
      totalBytes: toNumber(row.total_bytes),
      idxScan: toNumber(row.idx_scan),
    })),
    activitySummary: (activityRows as Array<Record<string, unknown>>).map((row) => ({
      applicationName: String(row.application_name ?? ""),
      state: String(row.state ?? "unknown"),
      waitEventType: String(row.wait_event_type ?? ""),
      waitEvent: String(row.wait_event ?? ""),
      connectionCount: toNumber(row.connection_count),
    })),
    longTransactions: (longTransactionRows as Array<Record<string, unknown>>).map((row) => ({
      pid: toNumber(row.pid),
      applicationName: String(row.application_name ?? ""),
      state: String(row.state ?? "unknown"),
      xactAge: toIso(row.xact_age),
      queryAge: toIso(row.query_age),
      waitEventType: String(row.wait_event_type ?? ""),
      waitEvent: String(row.wait_event ?? ""),
      query: String(row.query ?? ""),
    })),
    blockedLocks: (blockedRows as Array<Record<string, unknown>>).map((row) => ({
      blockedPid: toNumber(row.blocked_pid),
      blockedApplicationName: String(row.blocked_application_name ?? ""),
      blockerPid: toNumber(row.blocker_pid),
      blockerApplicationName: String(row.blocker_application_name ?? ""),
      blockedQueryAge: toIso(row.blocked_query_age),
      blockedQuery: String(row.blocked_query ?? ""),
      blockerQuery: String(row.blocker_query ?? ""),
    })),
    pgStatStatements,
  } satisfies StorageSnapshot;
}

function buildTrackedTableCoverageQuery() {
  return `
    WITH tracked_tables AS (
      SELECT *
      FROM (
        VALUES
          ('core', 'users'),
          ('core', 'businesses'),
          ('core', 'memberships'),
          ('core', 'sessions'),
          ('core', 'invites'),
          ('core', 'provider_accounts'),
          ('core', 'provider_connections'),
          ('core', 'integration_credentials'),
          ('core', 'business_provider_accounts'),
          ('core', 'provider_account_snapshot_runs'),
          ('core', 'provider_account_snapshot_items'),
          ('core', 'business_cost_models'),
          ('core', 'shopify_subscriptions'),
          ('core', 'shopify_install_contexts'),
          ('core', 'discount_codes'),
          ('core', 'discount_redemptions'),
          ('core', 'custom_reports'),
          ('control', 'provider_account_rollover_state'),
          ('control', 'provider_cooldown_state'),
          ('control', 'provider_quota_usage'),
          ('control', 'provider_sync_jobs'),
          ('control', 'meta_sync_jobs'),
          ('control', 'meta_sync_partitions'),
          ('control', 'meta_sync_runs'),
          ('control', 'meta_sync_checkpoints'),
          ('control', 'meta_sync_state'),
          ('control', 'google_ads_sync_jobs'),
          ('control', 'google_ads_sync_partitions'),
          ('control', 'google_ads_sync_runs'),
          ('control', 'google_ads_sync_checkpoints'),
          ('control', 'google_ads_sync_state'),
          ('control', 'google_ads_runner_leases'),
          ('control', 'sync_runner_leases'),
          ('control', 'sync_worker_heartbeats'),
          ('control', 'shopify_sync_state'),
          ('control', 'shopify_repair_intents'),
          ('control', 'shopify_serving_overrides'),
          ('raw', 'meta_raw_snapshots'),
          ('raw', 'google_ads_raw_snapshots'),
          ('raw', 'shopify_raw_snapshots'),
          ('warehouse', 'meta_config_snapshots'),
          ('warehouse', 'meta_account_daily'),
          ('warehouse', 'meta_campaign_daily'),
          ('warehouse', 'meta_adset_daily'),
          ('warehouse', 'meta_breakdown_daily'),
          ('warehouse', 'meta_ad_daily'),
          ('warehouse', 'meta_creative_daily'),
          ('warehouse', 'meta_authoritative_source_manifests'),
          ('warehouse', 'meta_authoritative_slice_versions'),
          ('warehouse', 'meta_authoritative_publication_pointers'),
          ('warehouse', 'google_ads_account_daily'),
          ('warehouse', 'google_ads_campaign_daily'),
          ('warehouse', 'google_ads_ad_group_daily'),
          ('warehouse', 'google_ads_ad_daily'),
          ('warehouse', 'google_ads_keyword_daily'),
          ('warehouse', 'google_ads_search_term_daily'),
          ('warehouse', 'google_ads_asset_group_daily'),
          ('warehouse', 'google_ads_asset_daily'),
          ('warehouse', 'google_ads_audience_daily'),
          ('warehouse', 'google_ads_geo_daily'),
          ('warehouse', 'google_ads_device_daily'),
          ('warehouse', 'google_ads_product_daily'),
          ('warehouse', 'google_ads_query_dictionary'),
          ('warehouse', 'google_ads_search_query_hot_daily'),
          ('warehouse', 'google_ads_top_query_weekly'),
          ('warehouse', 'google_ads_search_cluster_daily'),
          ('warehouse', 'shopify_orders'),
          ('warehouse', 'shopify_order_lines'),
          ('warehouse', 'shopify_order_transactions'),
          ('warehouse', 'shopify_refunds'),
          ('warehouse', 'shopify_returns'),
          ('warehouse', 'shopify_customer_events'),
          ('warehouse', 'shopify_sales_events'),
          ('serving', 'creative_share_snapshots'),
          ('serving', 'custom_report_share_snapshots'),
          ('serving', 'creative_media_cache'),
          ('serving', 'meta_creatives_snapshots'),
          ('serving', 'meta_creative_score_snapshots'),
          ('serving', 'platform_overview_daily_summary'),
          ('serving', 'platform_overview_summary_ranges'),
          ('serving', 'provider_reporting_snapshots'),
          ('serving', 'google_ads_advisor_memory'),
          ('serving', 'google_ads_advisor_snapshots'),
          ('serving', 'ai_daily_insights'),
          ('serving', 'ai_creative_decisions_cache'),
          ('serving', 'seo_ai_monthly_analyses'),
          ('serving', 'seo_results_cache'),
          ('serving', 'shopify_serving_state'),
          ('serving', 'shopify_serving_state_history'),
          ('serving', 'shopify_reconciliation_runs'),
          ('audit', 'admin_audit_logs'),
          ('audit', 'google_ads_advisor_execution_logs'),
          ('audit', 'google_ads_decision_action_outcome_logs'),
          ('audit', 'meta_authoritative_reconciliation_events'),
          ('audit', 'shopify_webhook_deliveries'),
          ('audit', 'sync_reclaim_events')
      ) AS t(family, table_name)
    ),
    table_stats AS (
      SELECT
        tt.family,
        tt.table_name,
        COALESCE(s.n_live_tup, c.reltuples::bigint, 0) AS approx_rows
      FROM tracked_tables tt
      LEFT JOIN pg_class c
        ON c.relname = tt.table_name
      LEFT JOIN pg_namespace n
        ON n.oid = c.relnamespace
       AND n.nspname = 'public'
      LEFT JOIN pg_stat_user_tables s
        ON s.relid = c.oid
    )
    SELECT *
    FROM table_stats
    ORDER BY family, table_name
  `;
}

async function collectBaselineChecksSnapshot() {
  const sql = getDbWithTimeout(30_000);
  const baselineSqlPath = path.resolve("docs/architecture/live-db-baseline-checks.sql");
  const baselineSqlContent = readFileSync(baselineSqlPath, "utf8");
  const file = {
    path: baselineSqlPath,
    sha256: createHash("sha256").update(baselineSqlContent).digest("hex"),
    sizeBytes: Buffer.byteLength(baselineSqlContent),
  };

  const tableCoverageRows = (await sql.query(buildTrackedTableCoverageQuery())) as Array<Record<string, unknown>>;
  const familyCounts = (await sql.query(
    `
      WITH tracked_tables AS (
        SELECT *
        FROM (
          VALUES
          ('core', 'users'),
          ('core', 'businesses'),
          ('core', 'memberships'),
          ('core', 'sessions'),
          ('core', 'invites'),
          ('core', 'provider_accounts'),
          ('core', 'provider_connections'),
          ('core', 'integration_credentials'),
          ('core', 'business_provider_accounts'),
          ('core', 'provider_account_snapshot_runs'),
          ('core', 'provider_account_snapshot_items'),
          ('control', 'provider_account_rollover_state'),
          ('control', 'provider_cooldown_state'),
            ('control', 'provider_quota_usage'),
            ('control', 'provider_sync_jobs'),
            ('control', 'meta_sync_jobs'),
            ('control', 'meta_sync_partitions'),
            ('control', 'meta_sync_runs'),
            ('control', 'meta_sync_checkpoints'),
            ('control', 'meta_sync_state'),
            ('control', 'google_ads_sync_jobs'),
            ('control', 'google_ads_sync_partitions'),
            ('control', 'google_ads_sync_runs'),
            ('control', 'google_ads_sync_checkpoints'),
            ('control', 'google_ads_sync_state'),
            ('control', 'sync_runner_leases'),
            ('control', 'sync_worker_heartbeats'),
            ('raw', 'meta_raw_snapshots'),
            ('raw', 'google_ads_raw_snapshots'),
            ('raw', 'shopify_raw_snapshots'),
            ('warehouse', 'meta_account_daily'),
            ('warehouse', 'meta_campaign_daily'),
            ('warehouse', 'meta_adset_daily'),
            ('warehouse', 'meta_ad_daily'),
            ('warehouse', 'meta_creative_daily'),
            ('warehouse', 'google_ads_account_daily'),
            ('warehouse', 'google_ads_campaign_daily'),
            ('warehouse', 'google_ads_ad_group_daily'),
            ('warehouse', 'google_ads_ad_daily'),
            ('warehouse', 'google_ads_keyword_daily'),
            ('warehouse', 'google_ads_search_term_daily'),
            ('warehouse', 'google_ads_asset_group_daily'),
            ('warehouse', 'google_ads_asset_daily'),
            ('warehouse', 'google_ads_audience_daily'),
            ('warehouse', 'google_ads_geo_daily'),
            ('warehouse', 'google_ads_device_daily'),
            ('warehouse', 'google_ads_product_daily'),
            ('warehouse', 'shopify_orders'),
            ('warehouse', 'shopify_order_lines'),
            ('warehouse', 'shopify_order_transactions'),
            ('warehouse', 'shopify_refunds'),
            ('warehouse', 'shopify_returns'),
            ('warehouse', 'shopify_customer_events'),
            ('warehouse', 'shopify_sales_events'),
            ('serving', 'creative_share_snapshots'),
            ('serving', 'custom_report_share_snapshots'),
            ('serving', 'creative_media_cache'),
            ('serving', 'meta_creatives_snapshots'),
            ('serving', 'meta_creative_score_snapshots'),
            ('serving', 'platform_overview_daily_summary'),
            ('serving', 'platform_overview_summary_ranges'),
            ('serving', 'provider_reporting_snapshots'),
            ('serving', 'google_ads_advisor_memory'),
            ('serving', 'google_ads_advisor_snapshots'),
            ('serving', 'ai_daily_insights'),
            ('serving', 'ai_creative_decisions_cache'),
            ('serving', 'seo_ai_monthly_analyses'),
            ('serving', 'seo_results_cache'),
            ('serving', 'shopify_serving_state'),
            ('serving', 'shopify_serving_state_history'),
            ('serving', 'shopify_reconciliation_runs'),
            ('audit', 'admin_audit_logs'),
            ('audit', 'google_ads_advisor_execution_logs'),
            ('audit', 'google_ads_decision_action_outcome_logs'),
            ('audit', 'meta_authoritative_reconciliation_events'),
            ('audit', 'shopify_webhook_deliveries'),
            ('audit', 'sync_reclaim_events')
        ) AS t(family, table_name)
      )
      SELECT family, COUNT(*)::int AS table_count
      FROM tracked_tables
      GROUP BY family
      ORDER BY family
    `,
  )) as Array<Record<string, unknown>>;

  const duplicateNaturalKeys = (await sql.query(
    `
      WITH duplicate_checks AS (
        SELECT 'provider_connections' AS table_name, business_id || '|' || provider AS natural_key, COUNT(*) AS row_count
        FROM provider_connections
        GROUP BY 1, 2
        HAVING COUNT(*) > 1
        UNION ALL
        SELECT 'business_provider_accounts', business_id || '|' || provider || '|' || provider_account_id, COUNT(*)
        FROM business_provider_accounts
        GROUP BY 1, 2
        HAVING COUNT(*) > 1
        UNION ALL
        SELECT 'provider_account_snapshot_runs', business_id || '|' || provider, COUNT(*)
        FROM provider_account_snapshot_runs
        GROUP BY 1, 2
        HAVING COUNT(*) > 1
        UNION ALL
        SELECT 'meta_account_daily', business_id || '|' || provider_account_id || '|' || date::text, COUNT(*)
        FROM meta_account_daily
        GROUP BY 1, 2
        HAVING COUNT(*) > 1
        UNION ALL
        SELECT 'google_ads_account_daily', business_id || '|' || provider_account_id || '|' || date::text || '|' || entity_key, COUNT(*)
        FROM google_ads_account_daily
        GROUP BY 1, 2
        HAVING COUNT(*) > 1
        UNION ALL
        SELECT 'shopify_orders', business_id || '|' || provider_account_id || '|' || shop_id || '|' || order_id, COUNT(*)
        FROM shopify_orders
        GROUP BY 1, 2
        HAVING COUNT(*) > 1
      )
      SELECT *
      FROM duplicate_checks
      ORDER BY table_name, row_count DESC, natural_key
    `,
  )) as Array<Record<string, unknown>>;

  const nullAnomalies = (await sql.query(
    `
      WITH null_anomalies AS (
        SELECT 'provider_connections' AS table_name, COUNT(*) AS null_rows
        FROM provider_connections
        WHERE business_id IS NULL OR provider IS NULL
        UNION ALL
        SELECT 'business_provider_accounts', COUNT(*)
        FROM business_provider_accounts
        WHERE business_id IS NULL OR provider IS NULL OR provider_account_id IS NULL
        UNION ALL
        SELECT 'provider_account_snapshot_runs', COUNT(*)
        FROM provider_account_snapshot_runs
        WHERE business_id IS NULL OR provider IS NULL
        UNION ALL
        SELECT 'meta_account_daily', COUNT(*)
        FROM meta_account_daily
        WHERE business_id IS NULL OR provider_account_id IS NULL OR date IS NULL
        UNION ALL
        SELECT 'google_ads_account_daily', COUNT(*)
        FROM google_ads_account_daily
        WHERE business_id IS NULL OR provider_account_id IS NULL OR date IS NULL OR entity_key IS NULL
        UNION ALL
        SELECT 'shopify_orders', COUNT(*)
        FROM shopify_orders
        WHERE business_id IS NULL OR provider_account_id IS NULL OR shop_id IS NULL OR order_id IS NULL
      )
      SELECT *
      FROM null_anomalies
      ORDER BY table_name
    `,
  )) as Array<Record<string, unknown>>;

  const coverageGaps = (await sql.query(
    `
      WITH window_days AS (
        SELECT generate_series(current_date - interval '30 day', current_date - interval '1 day', interval '1 day')::date AS day
      ),
      meta_accounts AS (
        SELECT DISTINCT business_id, provider_account_id
        FROM meta_account_daily
        WHERE date >= current_date - interval '30 day'
      ),
      google_accounts AS (
        SELECT DISTINCT business_id, provider_account_id
        FROM google_ads_account_daily
        WHERE date >= current_date - interval '30 day'
      ),
      shopify_accounts AS (
        SELECT DISTINCT business_id, provider_account_id
        FROM shopify_orders
        WHERE COALESCE(order_created_date_local, order_created_at::date) >= current_date - interval '30 day'
      ),
      meta_gaps AS (
        SELECT 'meta_account_daily' AS table_name, a.business_id, a.provider_account_id, d.day
        FROM meta_accounts a
        CROSS JOIN window_days d
        LEFT JOIN meta_account_daily m
          ON m.business_id = a.business_id
         AND m.provider_account_id = a.provider_account_id
         AND m.date = d.day
        WHERE m.id IS NULL
      ),
      google_gaps AS (
        SELECT 'google_ads_account_daily' AS table_name, a.business_id, a.provider_account_id, d.day
        FROM google_accounts a
        CROSS JOIN window_days d
        LEFT JOIN google_ads_account_daily g
          ON g.business_id = a.business_id
         AND g.provider_account_id = a.provider_account_id
         AND g.date = d.day
        WHERE g.id IS NULL
      ),
      shopify_gaps AS (
        SELECT 'shopify_orders' AS table_name, a.business_id, a.provider_account_id, d.day
        FROM shopify_accounts a
        CROSS JOIN window_days d
        LEFT JOIN shopify_orders o
          ON o.business_id = a.business_id
         AND o.provider_account_id = a.provider_account_id
         AND COALESCE(o.order_created_date_local, o.order_created_at::date) = d.day
        WHERE o.id IS NULL
      )
      SELECT *
      FROM (
        SELECT * FROM meta_gaps
        UNION ALL
        SELECT * FROM google_gaps
        UNION ALL
        SELECT * FROM shopify_gaps
      ) gaps
      ORDER BY table_name, business_id, provider_account_id, day
    `,
  )) as Array<Record<string, unknown>>;

  const projectionParity = (await sql.query(
    `
      WITH projection AS (
        SELECT
          business_id,
          provider,
          date::date AS day,
          ROUND(SUM(spend)::numeric, 4) AS spend,
          ROUND(SUM(revenue)::numeric, 4) AS revenue,
          ROUND(SUM(purchases)::numeric, 4) AS purchases
        FROM platform_overview_daily_summary
        WHERE date >= current_date - interval '30 day'
          AND date < current_date
        GROUP BY 1, 2, 3
      ),
      warehouse_meta AS (
        SELECT
          business_id,
          'meta'::text AS provider,
          date::date AS day,
          ROUND(SUM(spend)::numeric, 4) AS spend,
          ROUND(SUM(revenue)::numeric, 4) AS revenue,
          ROUND(SUM(conversions)::numeric, 4) AS purchases
        FROM meta_account_daily
        WHERE date >= current_date - interval '30 day'
          AND date < current_date
          AND truth_state = 'finalized'
        GROUP BY 1, 2, 3
      ),
      warehouse_google AS (
        SELECT
          business_id,
          'google'::text AS provider,
          date::date AS day,
          ROUND(SUM(spend)::numeric, 4) AS spend,
          ROUND(SUM(revenue)::numeric, 4) AS revenue,
          ROUND(SUM(conversions)::numeric, 4) AS purchases
        FROM google_ads_account_daily
        WHERE date >= current_date - interval '30 day'
          AND date < current_date
        GROUP BY 1, 2, 3
      ),
      warehouse_union AS (
        SELECT * FROM warehouse_meta
        UNION ALL
        SELECT * FROM warehouse_google
      )
      SELECT
        COALESCE(p.business_id, w.business_id) AS business_id,
        COALESCE(p.provider, w.provider) AS provider,
        COALESCE(p.day, w.day) AS day,
        p.spend AS projection_spend,
        w.spend AS warehouse_spend,
        ROUND(COALESCE(p.spend, 0) - COALESCE(w.spend, 0), 4) AS spend_delta,
        p.revenue AS projection_revenue,
        w.revenue AS warehouse_revenue,
        ROUND(COALESCE(p.revenue, 0) - COALESCE(w.revenue, 0), 4) AS revenue_delta,
        p.purchases AS projection_purchases,
        w.purchases AS warehouse_purchases,
        ROUND(COALESCE(p.purchases, 0) - COALESCE(w.purchases, 0), 4) AS purchase_delta
      FROM projection p
      FULL OUTER JOIN warehouse_union w
        ON w.business_id = p.business_id
       AND w.provider = p.provider
       AND w.day = p.day
      WHERE
        ABS(COALESCE(p.spend, 0) - COALESCE(w.spend, 0)) > 0.01
        OR ABS(COALESCE(p.revenue, 0) - COALESCE(w.revenue, 0)) > 0.01
        OR ABS(COALESCE(p.purchases, 0) - COALESCE(w.purchases, 0)) > 0.01
      ORDER BY business_id, provider, day
    `,
  )) as Array<Record<string, unknown>>;

  const providerSanityAggregates = (await sql.query(
    `
      WITH meta_agg AS (
        SELECT
          business_id,
          provider_account_id,
          MIN(date) AS min_day,
          MAX(date) AS max_day,
          COUNT(*) AS row_count,
          ROUND(SUM(spend)::numeric, 4) AS spend,
          ROUND(SUM(revenue)::numeric, 4) AS revenue,
          ROUND(SUM(conversions)::numeric, 4) AS purchases
        FROM meta_account_daily
        WHERE date >= current_date - interval '14 day'
          AND date < current_date
        GROUP BY 1, 2
      ),
      google_agg AS (
        SELECT
          business_id,
          provider_account_id,
          MIN(date) AS min_day,
          MAX(date) AS max_day,
          COUNT(*) AS row_count,
          ROUND(SUM(spend)::numeric, 4) AS spend,
          ROUND(SUM(revenue)::numeric, 4) AS revenue,
          ROUND(SUM(conversions)::numeric, 4) AS purchases
        FROM google_ads_account_daily
        WHERE date >= current_date - interval '14 day'
          AND date < current_date
        GROUP BY 1, 2
      ),
      shopify_agg AS (
        SELECT
          business_id,
          provider_account_id,
          MIN(COALESCE(order_created_date_local, order_created_at::date)) AS min_day,
          MAX(COALESCE(order_created_date_local, order_created_at::date)) AS max_day,
          COUNT(*) AS order_rows,
          ROUND(SUM(total_price)::numeric, 4) AS gross_revenue
        FROM shopify_orders
        WHERE COALESCE(order_created_date_local, order_created_at::date) >= current_date - interval '14 day'
          AND COALESCE(order_created_date_local, order_created_at::date) < current_date
        GROUP BY 1, 2
      ),
      shopify_refund_agg AS (
        SELECT
          business_id,
          provider_account_id,
          ROUND(SUM(refunded_sales + refunded_shipping + refunded_taxes)::numeric, 4) AS refunded_revenue,
          COUNT(*) AS refund_rows
        FROM shopify_refunds
        WHERE COALESCE(refunded_date_local, refunded_at::date) >= current_date - interval '14 day'
          AND COALESCE(refunded_date_local, refunded_at::date) < current_date
        GROUP BY 1, 2
      )
      SELECT
        'meta' AS provider,
        business_id,
        provider_account_id,
        min_day,
        max_day,
        row_count,
        spend,
        revenue,
        purchases
      FROM meta_agg
      UNION ALL
      SELECT
        'google' AS provider,
        business_id,
        provider_account_id,
        min_day,
        max_day,
        row_count,
        spend,
        revenue,
        purchases
      FROM google_agg
      UNION ALL
      SELECT
        'shopify' AS provider,
        o.business_id,
        o.provider_account_id,
        o.min_day,
        o.max_day,
        o.order_rows AS row_count,
        NULL::numeric AS spend,
        ROUND(o.gross_revenue - COALESCE(r.refunded_revenue, 0), 4) AS revenue,
        o.order_rows::numeric AS purchases
      FROM shopify_agg o
      LEFT JOIN shopify_refund_agg r
        ON r.business_id = o.business_id
       AND r.provider_account_id = o.provider_account_id
      ORDER BY provider, business_id, provider_account_id
    `,
  )) as Array<Record<string, unknown>>;

  return {
    file,
    tableCoverage: {
      rows: tableCoverageRows,
      familyCounts,
    },
    duplicateNaturalKeys,
    nullAnomalies,
    coverageGaps,
    projectionParity,
    providerSanityAggregates,
  } satisfies BaselineChecksSnapshot;
}

function summarizeBenchmarkResult(values: RawSeriesPoint[]): {
  averageMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
} {
  const durations = values.map((value) => value.value);
  return {
    averageMs: round(average(durations), 2),
    minMs: round(Math.min(...durations), 2),
    maxMs: round(Math.max(...durations), 2),
    p50Ms: round(percentile(durations, 0.5), 2),
    p95Ms: round(percentile(durations, 0.95), 2),
  };
}

async function measureScenario(
  name: string,
  iterations: number,
  operation: () => Promise<{ sampleCardinality: number | null; validityNote: string; sourceKey?: string | null }>,
) {
  const timings: RawSeriesPoint[] = [];
  const sampleCardinalities: Array<number | null> = [];
  const validityNotes: string[] = [];
  const sourceKeys = new Set<string>();

  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    const result = await operation();
    const duration = performance.now() - startedAt;
    timings.push({ label: `${name}-${index + 1}`, value: duration });
    sampleCardinalities.push(result.sampleCardinality);
    validityNotes.push(result.validityNote);
    if (result.sourceKey) sourceKeys.add(result.sourceKey);
  }

  const summary = summarizeBenchmarkResult(timings);
  const sampleCardinality = sampleCardinalities[0] ?? null;
  const sampleCardinalityStable = sampleCardinalities.every((value) => value === sampleCardinality);
  const validityParts = [...new Set(validityNotes)];
  if (!sampleCardinalityStable) validityParts.push("sample_cardinality_changed");
  if (sourceKeys.size > 1) validityParts.push("source_changed");

  return {
    name,
    iterations,
    ...summary,
    sampleCardinality,
    validityNote: validityParts.join("|"),
    sourceKey: sourceKeys.size > 0 ? [...sourceKeys].join(",") : null,
  } satisfies BenchmarkScenarioResult;
}

async function collectReadScenarioData(params: {
  businessId: string;
  range30Start: string;
  range30End: string;
  range90Start: string;
  range90End: string;
}) {
  const {
    businessId,
    range30Start,
    range30End,
    range90Start,
    range90End,
  } = params;
  const baselinePath = path.resolve("docs/benchmarks/overview-release-2026-04-07.json");
  let baseline: Record<string, number> = {};
  try {
    const payload = JSON.parse(readFileSync(baselinePath, "utf8")) as {
      baseline?: Record<string, number>;
      scenarios?: Array<{ name?: string; averageMs?: number }>;
    };
    baseline = {
      ...(payload.baseline ?? {}),
      ...(payload.scenarios ?? []).reduce<Record<string, number>>((acc, scenario) => {
        if (scenario.name && typeof scenario.averageMs === "number") {
          acc[scenario.name] = scenario.averageMs;
        }
        return acc;
      }, {}),
    };
  } catch {
    baseline = {};
  }

  return {
    businessId,
    range30Start,
    range30End,
    range90Start,
    range90End,
    baseline,
  };
}

async function measureReadBenchmarkScenarioSet(input: {
  businessId: string;
  selectionMode: string;
  selectionEvidence: Record<string, unknown>;
  range30Start: string;
  range30End: string;
  range90Start: string;
  range90End: string;
  iterations30: number;
  iterations90: number;
  trendIterations: number;
}) {
  const {
    getOverviewData,
    getOverviewTrendBundle,
    getShopifyOverviewServingData,
  } = await import("@/lib/overview-service");
  const { getMetaCreativesDbPayload } = await import("@/lib/meta/creatives-api");
  const { getGoogleAdsOverviewReport } = await import("@/lib/google-ads/serving");
  const base = await collectReadScenarioData(input);
  const results = [
    await measureScenario("overview_data_no_trends_30d", input.iterations30, async () => {
      const overview = await getOverviewData({
        businessId: input.businessId,
        startDate: input.range30Start,
        endDate: input.range30End,
        includeTrends: false,
      });
      return {
        sampleCardinality: overview.platformEfficiency.length,
        validityNote:
          overview.dateRange.startDate === input.range30Start && overview.dateRange.endDate === input.range30End
            ? "valid"
            : "date_range_mismatch",
        sourceKey: overview.shopifyServing?.source ?? "none",
      };
    }),
    await measureScenario("overview_data_no_trends_90d", input.iterations90, async () => {
      const overview = await getOverviewData({
        businessId: input.businessId,
        startDate: input.range90Start,
        endDate: input.range90End,
        includeTrends: false,
      });
      return {
        sampleCardinality: overview.platformEfficiency.length,
        validityNote:
          overview.dateRange.startDate === input.range90Start && overview.dateRange.endDate === input.range90End
            ? "valid"
            : "date_range_mismatch",
        sourceKey: overview.shopifyServing?.source ?? "none",
      };
    }),
    await measureScenario("overview_trend_bundle_30d", input.trendIterations, async () => {
      const trendBundle = await getOverviewTrendBundle({
        businessId: input.businessId,
        startDate: input.range30Start,
        endDate: input.range30End,
      });
      return {
        sampleCardinality: trendBundle.combined.length,
        validityNote:
          trendBundle.combined.length > 0 &&
          trendBundle.providerTrends.meta?.length === trendBundle.combined.length &&
          trendBundle.providerTrends.google?.length === trendBundle.combined.length
            ? "valid"
            : "trend_shape_mismatch",
        sourceKey: "trend_bundle",
      };
    }),
    await measureScenario("shopify_warehouse_overview_90d", input.iterations90, async () => {
      const shopify = await getShopifyOverviewServingData({
        businessId: input.businessId,
        startDate: input.range90Start,
        endDate: input.range90End,
      });
      return {
        sampleCardinality: shopify.aggregate?.dailyTrends?.length ?? null,
        validityNote: shopify.serving?.source ? `valid:${shopify.serving.source}` : "valid:none",
        sourceKey: shopify.serving?.source ?? "none",
      };
    }),
    await measureScenario("meta_creatives_30d", input.iterations30, async () => {
      const creatives = await getMetaCreativesDbPayload({
        businessId: input.businessId,
        start: input.range30Start,
        end: input.range30End,
        groupBy: "creative",
        format: "all",
        sort: "roas",
        mediaMode: "metadata",
      });
      return {
        sampleCardinality: Array.isArray(creatives.rows) ? creatives.rows.length : null,
        validityNote:
          "snapshot_source" in creatives &&
          creatives.snapshot_source === "persisted" &&
          "freshness_state" in creatives &&
          typeof creatives.freshness_state === "string"
            ? `valid:${creatives.freshness_state}`
            : "missing_persisted_snapshot",
        sourceKey:
          "snapshot_source" in creatives && typeof creatives.snapshot_source === "string"
            ? creatives.snapshot_source
            : "unknown",
      };
    }),
    await measureScenario("google_ads_overview_30d", input.iterations30, async () => {
      const report = await getGoogleAdsOverviewReport({
        businessId: input.businessId,
        accountId: null,
        dateRange: "custom",
        customStart: input.range30Start,
        customEnd: input.range30End,
        compareMode: "none",
        compareStart: null,
        compareEnd: null,
        debug: false,
        source: "db_normalization_benchmark",
      });
      return {
        sampleCardinality: Array.isArray(report.topCampaigns) ? report.topCampaigns.length : null,
        validityNote: report.summary && report.meta ? "valid" : "missing_summary",
        sourceKey:
          typeof (report.meta as { readSource?: unknown } | undefined)?.readSource === "string"
            ? String((report.meta as { readSource?: unknown }).readSource)
            : typeof (report.meta as { source?: unknown } | undefined)?.source === "string"
              ? String((report.meta as { source?: unknown }).source)
              : "unknown",
      };
    }),
  ];

  return {
    selectedBusinessId: input.businessId,
    selectionMode: input.selectionMode,
    selectionEvidence: {
      ...input.selectionEvidence,
      baselineReference: base.baseline,
      range30Start: input.range30Start,
      range30End: input.range30End,
      range90Start: input.range90Start,
      range90End: input.range90End,
    },
    capturedAt: new Date().toISOString(),
    scenarios: results,
  } satisfies BenchmarkSeriesResult;
}

export async function resolveReadBenchmarkBusiness(input: {
  requestedBusinessId?: string | null;
  windowDays?: number;
}) {
  if (input.requestedBusinessId) {
    return {
      businessId: input.requestedBusinessId,
      selectionMode: "explicit",
      selectionEvidence: { requestedBusinessId: input.requestedBusinessId },
    };
  }

  const sql = getDbWithTimeout(30_000);
  const windowDays = Math.max(7, input.windowDays ?? 90);
  const rows = (await sql.query(
    `
      WITH meta AS (
        SELECT business_id, COUNT(*)::bigint AS row_count
        FROM meta_account_daily
        WHERE date >= current_date - $1::int
        GROUP BY business_id
      ),
      google AS (
        SELECT business_id, COUNT(*)::bigint AS row_count
        FROM google_ads_account_daily
        WHERE date >= current_date - $1::int
        GROUP BY business_id
      ),
      shopify AS (
        SELECT business_id, COUNT(*)::bigint AS row_count
        FROM shopify_orders
        WHERE COALESCE(order_created_date_local, order_created_at::date) >= current_date - $1::int
        GROUP BY business_id
      ),
      candidate AS (
        SELECT
          b.id::text AS business_id,
          b.name AS business_name,
          COALESCE(meta.row_count, 0) AS meta_row_count,
          COALESCE(google.row_count, 0) AS google_row_count,
          COALESCE(shopify.row_count, 0) AS shopify_row_count,
          COALESCE(meta.row_count, 0) + COALESCE(google.row_count, 0) + COALESCE(shopify.row_count, 0) AS total_row_count,
          (
            CASE WHEN COALESCE(meta.row_count, 0) > 0 THEN 1 ELSE 0 END +
            CASE WHEN COALESCE(google.row_count, 0) > 0 THEN 1 ELSE 0 END +
            CASE WHEN COALESCE(shopify.row_count, 0) > 0 THEN 1 ELSE 0 END
          ) AS provider_coverage
        FROM businesses b
        LEFT JOIN meta ON meta.business_id = b.id::text
        LEFT JOIN google ON google.business_id = b.id::text
        LEFT JOIN shopify ON shopify.business_id = b.id::text
      ),
      full_coverage AS (
        SELECT *
        FROM candidate
        WHERE provider_coverage = 3
        ORDER BY total_row_count DESC, business_id ASC
        LIMIT 1
      )
      SELECT * FROM full_coverage
    `,
    [windowDays],
  )) as Array<Record<string, unknown>>;

  if (rows.length > 0) {
    const row = rows[0]!;
    return {
      businessId: String(row.business_id),
      selectionMode: "all_providers",
      selectionEvidence: {
        businessName: row.business_name ? String(row.business_name) : null,
        metaRowCount: toNumber(row.meta_row_count),
        googleRowCount: toNumber(row.google_row_count),
        shopifyRowCount: toNumber(row.shopify_row_count),
        totalRowCount: toNumber(row.total_row_count),
      },
    };
  }

  const providerRows = await Promise.all([
    sql.query(
      `
        SELECT business_id, COUNT(*)::bigint AS row_count
        FROM meta_account_daily
        WHERE date >= current_date - $1::int
        GROUP BY business_id
        ORDER BY row_count DESC, business_id ASC
        LIMIT 1
      `,
      [windowDays],
    ),
    sql.query(
      `
        SELECT business_id, COUNT(*)::bigint AS row_count
        FROM google_ads_account_daily
        WHERE date >= current_date - $1::int
        GROUP BY business_id
        ORDER BY row_count DESC, business_id ASC
        LIMIT 1
      `,
      [windowDays],
    ),
    sql.query(
      `
        SELECT business_id, COUNT(*)::bigint AS row_count
        FROM shopify_orders
        WHERE COALESCE(order_created_date_local, order_created_at::date) >= current_date - $1::int
        GROUP BY business_id
        ORDER BY row_count DESC, business_id ASC
        LIMIT 1
      `,
      [windowDays],
    ),
  ]);

  const candidates = providerRows.flatMap((rowsForProvider, index) =>
    (rowsForProvider as Array<Record<string, unknown>>).map((row) => ({
      provider: ["meta", "google", "shopify"][index] as "meta" | "google" | "shopify",
      businessId: String(row.business_id),
      rowCount: toNumber(row.row_count),
    })),
  );

  if (candidates.length === 0) {
    const firstBusinessRows = (await sql.query(
      `
        SELECT id::text AS business_id, name AS business_name
        FROM businesses
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      `,
    )) as Array<Record<string, unknown>>;
    if (firstBusinessRows.length === 0) {
      throw new Error("No business rows are available for deterministic benchmark selection.");
    }
    const row = firstBusinessRows[0]!;
    return {
      businessId: String(row.business_id),
      selectionMode: "first_business_fallback",
      selectionEvidence: {
        businessName: row.business_name ? String(row.business_name) : null,
      },
    };
  }

  const chosen = chooseDeterministicBenchmarkBusiness(candidates);

  if (!chosen) {
    throw new Error("Failed to resolve a deterministic benchmark business.");
  }

  return {
    businessId: chosen.businessId,
    selectionMode: "provider_top_fallback",
    selectionEvidence: chosen,
  };
}

export async function runReadBenchmark(input: {
  businessId?: string | null;
  requestedBusinessId?: string | null;
  iterations30?: number;
  iterations90?: number;
  trendIterations?: number;
}) {
  const selection = await resolveReadBenchmarkBusiness({
    requestedBusinessId: input.businessId ?? input.requestedBusinessId ?? null,
    windowDays: 90,
  });
  const { startDate: range30Start, endDate: range30End } = getDateRange(30);
  const { startDate: range90Start, endDate: range90End } = getDateRange(90);
  return measureReadBenchmarkScenarioSet({
    businessId: selection.businessId,
    selectionMode: selection.selectionMode,
    selectionEvidence: selection.selectionEvidence,
    range30Start,
    range30End,
    range90Start,
    range90End,
    iterations30: Math.max(1, input.iterations30 ?? 2),
    iterations90: Math.max(1, input.iterations90 ?? 2),
    trendIterations: Math.max(1, input.trendIterations ?? 2),
  });
}

async function collectWriteBenchmarkBusiness(input: {
  requestedBusinessId?: string | null;
}) {
  if (input.requestedBusinessId) {
    return {
      businessId: input.requestedBusinessId,
      selectionMode: "explicit",
      selectionEvidence: { requestedBusinessId: input.requestedBusinessId },
    };
  }
  const sql = getDbWithTimeout(30_000);
  const rows = (await sql.query(
    `
      SELECT id::text AS business_id, name AS business_name
      FROM businesses
      WHERE metadata @> '{"dbNormalizationBenchmark": true}'::jsonb
         OR name ILIKE 'db-normalization-benchmark%'
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `,
  )) as Array<Record<string, unknown>>;
  if (rows.length === 0) {
    throw new Error(
      "Missing benchmark business. Pass --business-id or set DB_NORMALIZATION_WRITE_BENCHMARK_BUSINESS_ID.",
    );
  }
  const row = rows[0]!;
  return {
    businessId: String(row.business_id),
    selectionMode: "benchmark_business",
    selectionEvidence: {
      businessName: row.business_name ? String(row.business_name) : null,
    },
  };
}

function buildMetaAccountRow(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
  seed: string;
}): MetaAccountDailyRow {
  return {
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    date: input.date,
    accountTimezone: "UTC",
    accountCurrency: "USD",
    sourceSnapshotId: makeStableUuid(`${input.seed}:meta-account-snapshot`),
    metricSchemaVersion: 1,
    truthState: "finalized",
    truthVersion: 1,
    finalizedAt: new Date().toISOString(),
    validationStatus: "passed",
    sourceRunId: makeStableUuid(`${input.seed}:meta-source-run`),
    spend: 123.45,
    impressions: 1000,
    clicks: 100,
    reach: 800,
    frequency: 1.25,
    conversions: 11,
    revenue: 234.56,
    roas: 1.9,
    cpa: 11.23,
    ctr: 0.1,
    cpc: 1.23,
    accountName: "Benchmark Meta Account",
  };
}

function buildMetaCampaignRow(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
  seed: string;
}): MetaCampaignDailyRow {
  return {
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    date: input.date,
    accountTimezone: "UTC",
    accountCurrency: "USD",
    sourceSnapshotId: makeStableUuid(`${input.seed}:meta-campaign-snapshot`),
    metricSchemaVersion: 1,
    truthState: "finalized",
    truthVersion: 1,
    finalizedAt: new Date().toISOString(),
    validationStatus: "passed",
    sourceRunId: makeStableUuid(`${input.seed}:meta-source-run`),
    spend: 98.76,
    impressions: 900,
    clicks: 90,
    reach: 700,
    frequency: 1.17,
    conversions: 9,
    revenue: 188.88,
    roas: 1.91,
    cpa: 10.97,
    ctr: 0.1,
    cpc: 1.1,
    campaignId: makeStableUuid(`${input.seed}:meta-campaign`),
    campaignNameCurrent: "Benchmark Meta Campaign",
    campaignNameHistorical: "Benchmark Meta Campaign",
    campaignStatus: "ACTIVE",
    objective: "SALES",
    buyingType: "AUCTION",
    optimizationGoal: "CONVERSIONS",
    bidStrategyType: "LOWEST_COST",
    bidStrategyLabel: "Lowest cost",
    manualBidAmount: null,
    bidValue: null,
    bidValueFormat: null,
    dailyBudget: 25,
    lifetimeBudget: null,
    isBudgetMixed: false,
    isConfigMixed: false,
    isOptimizationGoalMixed: false,
    isBidStrategyMixed: false,
    isBidValueMixed: false,
  };
}

function buildGoogleAccountRow(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
  seed: string;
}): GoogleAdsWarehouseDailyRow {
  return {
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    date: input.date,
    accountTimezone: "UTC",
    accountCurrency: "USD",
    entityKey: makeStableUuid(`${input.seed}:google-account-entity`),
    entityLabel: "Benchmark Google Account",
    campaignId: null,
    campaignName: null,
    adGroupId: null,
    adGroupName: null,
    status: "ENABLED",
    channel: "search",
    classification: "benchmark",
    payloadJson: { seed: input.seed },
    spend: 145.67,
    revenue: 260.11,
    conversions: 13,
    impressions: 1200,
    clicks: 140,
    ctr: 11.67,
    cpc: 1.04,
    cpa: 11.2,
    roas: 1.79,
    conversionRate: 9.29,
    interactionRate: 11.67,
    sourceSnapshotId: makeStableUuid(`${input.seed}:google-snapshot`),
  };
}

function buildGoogleCampaignRow(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
  seed: string;
}): GoogleAdsWarehouseDailyRow {
  return {
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    date: input.date,
    accountTimezone: "UTC",
    accountCurrency: "USD",
    entityKey: makeStableUuid(`${input.seed}:google-campaign-entity`),
    entityLabel: "Benchmark Google Campaign",
    campaignId: makeStableUuid(`${input.seed}:google-campaign`),
    campaignName: "Benchmark Google Campaign",
    adGroupId: null,
    adGroupName: null,
    status: "ENABLED",
    channel: "search",
    classification: "benchmark",
    payloadJson: { seed: input.seed, level: "campaign" },
    spend: 64.32,
    revenue: 141.42,
    conversions: 6,
    impressions: 400,
    clicks: 32,
    ctr: 8,
    cpc: 2.01,
    cpa: 10.72,
    roas: 2.2,
    conversionRate: 18.75,
    interactionRate: 8,
    sourceSnapshotId: makeStableUuid(`${input.seed}:google-campaign-snapshot`),
  };
}

function buildShopifyRows(input: {
  businessId: string;
  providerAccountId: string;
  shopId: string;
  orderId: string;
  seed: string;
}) {
  const date = new Date().toISOString();
  const order: ShopifyOrderWarehouseRow = {
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    shopId: input.shopId,
    orderId: input.orderId,
    orderName: `#${input.orderId.slice(0, 8)}`,
    customerId: makeStableUuid(`${input.seed}:shopify-customer`),
    currencyCode: "USD",
    shopCurrencyCode: "USD",
    orderCreatedAt: date,
    orderCreatedDateLocal: date.slice(0, 10),
    orderUpdatedAt: date,
    orderUpdatedDateLocal: date.slice(0, 10),
    orderProcessedAt: date,
    orderCancelledAt: null,
    orderClosedAt: null,
    financialStatus: "paid",
    fulfillmentStatus: "fulfilled",
    customerJourneySummary: { seed: input.seed },
    subtotalPrice: 90,
    totalDiscounts: 5,
    totalShipping: 10,
    totalTax: 8,
    totalRefunded: 0,
    totalPrice: 103,
    originalTotalPrice: 103,
    currentTotalPrice: 103,
    payloadJson: { seed: input.seed, kind: "order" },
    sourceSnapshotId: makeStableUuid(`${input.seed}:shopify-order-snapshot`),
  };
  const orderLine: ShopifyOrderLineWarehouseRow = {
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    shopId: input.shopId,
    orderId: input.orderId,
    lineItemId: makeStableUuid(`${input.seed}:shopify-line`),
    productId: makeStableUuid(`${input.seed}:shopify-product`),
    variantId: makeStableUuid(`${input.seed}:shopify-variant`),
    sku: "BENCH-SKU",
    title: "Benchmark Line",
    variantTitle: "Default",
    quantity: 1,
    discountedTotal: 90,
    originalTotal: 95,
    taxTotal: 8,
    payloadJson: { seed: input.seed, kind: "line" },
    sourceSnapshotId: makeStableUuid(`${input.seed}:shopify-line-snapshot`),
  };
  const refund: ShopifyRefundWarehouseRow = {
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    shopId: input.shopId,
    orderId: input.orderId,
    refundId: makeStableUuid(`${input.seed}:shopify-refund`),
    refundedAt: date,
    refundedDateLocal: date.slice(0, 10),
    refundedSales: 3,
    refundedShipping: 1,
    refundedTaxes: 1,
    totalRefunded: 5,
    payloadJson: { seed: input.seed, kind: "refund" },
    sourceSnapshotId: makeStableUuid(`${input.seed}:shopify-refund-snapshot`),
  };
  const transaction: ShopifyOrderTransactionWarehouseRow = {
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    shopId: input.shopId,
    orderId: input.orderId,
    transactionId: makeStableUuid(`${input.seed}:shopify-transaction`),
    kind: "sale",
    status: "success",
    gateway: "benchmark",
    processedAt: date,
    amount: 103,
    currencyCode: "USD",
    payloadJson: { seed: input.seed, kind: "transaction" },
    sourceSnapshotId: makeStableUuid(`${input.seed}:shopify-transaction-snapshot`),
  };
  const returned: ShopifyReturnWarehouseRow = {
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    shopId: input.shopId,
    orderId: input.orderId,
    returnId: makeStableUuid(`${input.seed}:shopify-return`),
    status: "open",
    createdAt: date,
    createdDateLocal: date.slice(0, 10),
    updatedAt: date,
    updatedDateLocal: date.slice(0, 10),
    payloadJson: { seed: input.seed, kind: "return" },
    sourceSnapshotId: makeStableUuid(`${input.seed}:shopify-return-snapshot`),
  };
  return { order, orderLine, refund, transaction, returned };
}

function buildOverviewSummaryRows(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
  seed: string;
}) {
  const metaRow: OverviewSummaryDailyRow = {
    businessId: input.businessId,
    provider: "meta",
    providerAccountId: input.providerAccountId,
    date: input.date,
    spend: 123.45,
    revenue: 234.56,
    purchases: 11,
    impressions: 1000,
    clicks: 100,
    sourceUpdatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const googleRow: OverviewSummaryDailyRow = {
    businessId: input.businessId,
    provider: "google",
    providerAccountId: input.providerAccountId,
    date: input.date,
    spend: 145.67,
    revenue: 260.11,
    purchases: 13,
    impressions: 1200,
    clicks: 140,
    sourceUpdatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return {
    rows: [metaRow, googleRow],
    range: {
      businessId: input.businessId,
      providerAccountIds: [input.providerAccountId],
      startDate: input.date,
      endDate: input.date,
      rowCount: 2,
      expectedRowCount: 2,
      coverageComplete: true,
      maxSourceUpdatedAt: new Date().toISOString(),
      truthState: "finalized",
      projectionVersion: 1,
    },
  };
}

async function cleanupWriteBenchmarkRows(input: {
  businessId: string;
  providerAccountId: string;
  shopId: string;
  orderId: string;
  metaProviderAccountId: string;
  googleProviderAccountId: string;
  date: string;
  userEmail: string;
  userId: string;
  businessRowId: string;
}) {
  const sql = getDb();
  await Promise.all([
    sql`DELETE FROM shopify_order_lines WHERE business_id = ${input.businessId} AND provider_account_id = ${input.providerAccountId} AND shop_id = ${input.shopId} AND order_id = ${input.orderId}`,
    sql`DELETE FROM shopify_refunds WHERE business_id = ${input.businessId} AND provider_account_id = ${input.providerAccountId} AND shop_id = ${input.shopId} AND order_id = ${input.orderId}`,
    sql`DELETE FROM shopify_order_transactions WHERE business_id = ${input.businessId} AND provider_account_id = ${input.providerAccountId} AND shop_id = ${input.shopId} AND order_id = ${input.orderId}`,
    sql`DELETE FROM shopify_returns WHERE business_id = ${input.businessId} AND provider_account_id = ${input.providerAccountId} AND shop_id = ${input.shopId} AND return_id = ${makeStableUuid(`${input.businessId}:${input.providerAccountId}:${input.orderId}:shopify-return`)}`,
    sql`DELETE FROM shopify_orders WHERE business_id = ${input.businessId} AND provider_account_id = ${input.providerAccountId} AND shop_id = ${input.shopId} AND order_id = ${input.orderId}`,
    sql`DELETE FROM google_ads_campaign_daily WHERE business_id = ${input.businessId} AND provider_account_id = ${input.googleProviderAccountId} AND date = ${input.date} AND entity_key = ${makeStableUuid(`${input.businessId}:${input.googleProviderAccountId}:${input.date}:google-campaign-entity`)}`,
    sql`DELETE FROM google_ads_account_daily WHERE business_id = ${input.businessId} AND provider_account_id = ${input.googleProviderAccountId} AND date = ${input.date} AND entity_key = ${makeStableUuid(`${input.businessId}:${input.googleProviderAccountId}:${input.date}:google-account-entity`)}`,
    sql`DELETE FROM meta_campaign_daily WHERE business_id = ${input.businessId} AND provider_account_id = ${input.metaProviderAccountId} AND date = ${input.date} AND campaign_id = ${makeStableUuid(`${input.businessId}:${input.metaProviderAccountId}:${input.date}:meta-campaign`)}`,
    sql`DELETE FROM meta_account_daily WHERE business_id = ${input.businessId} AND provider_account_id = ${input.metaProviderAccountId} AND date = ${input.date}`,
    sql`DELETE FROM provider_reporting_snapshots WHERE business_id = ${input.businessId} AND provider = 'overview' AND report_type = 'db-normalization-benchmark' AND date_range_key = ${`${input.date}:${input.date}`}`,
    sql`DELETE FROM platform_overview_summary_ranges WHERE business_id = ${input.businessId} AND provider = 'meta' AND start_date = ${input.date} AND end_date = ${input.date}`,
    sql`DELETE FROM platform_overview_summary_ranges WHERE business_id = ${input.businessId} AND provider = 'google' AND start_date = ${input.date} AND end_date = ${input.date}`,
    sql`DELETE FROM platform_overview_daily_summary WHERE business_id = ${input.businessId} AND provider_account_id = ${input.providerAccountId} AND date = ${input.date}`,
    sql`DELETE FROM provider_account_snapshot_items
      WHERE snapshot_run_id IN (
        SELECT id FROM provider_account_snapshot_runs
        WHERE business_id = ${input.businessRowId}
          AND provider = 'meta'
      )`,
    sql`DELETE FROM provider_account_snapshot_runs WHERE business_id = ${input.businessRowId} AND provider = 'meta'`,
    sql`DELETE FROM business_provider_accounts WHERE business_id = ${input.businessRowId} AND provider = 'meta'`,
    sql`DELETE FROM integration_credentials
      WHERE provider_connection_id IN (
        SELECT id FROM provider_connections
        WHERE business_id = ${input.businessRowId}
          AND provider = 'meta'
      )`,
    sql`DELETE FROM provider_connections WHERE business_id = ${input.businessRowId} AND provider = 'meta'`,
    sql`DELETE FROM provider_accounts
      WHERE (provider = 'meta' AND external_account_id = ${input.metaProviderAccountId})
         OR (provider = 'google' AND external_account_id = ${input.googleProviderAccountId})
         OR (provider = 'shopify' AND external_account_id = ${input.providerAccountId})`,
    sql`DELETE FROM memberships WHERE user_id = ${input.userId} AND business_id = ${input.businessRowId}::uuid`,
    sql`DELETE FROM businesses WHERE id = ${input.businessRowId}::uuid`,
    sql`DELETE FROM users WHERE id = ${input.userId}::uuid`,
  ]);
}

async function runCoreWriteCycle(input: {
  businessId: string;
  iterationSeed: string;
}) {
  const sql = getDb();
  const userId = makeStableUuid(`${input.iterationSeed}:user`);
  const businessRowId = makeStableUuid(`${input.iterationSeed}:business`);
  const email = `${input.iterationSeed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32)}@db-normalization-benchmark.local`;
  const providerAccountId = makeStableUuid(`${input.iterationSeed}:core-provider-account`);
  const snapshot = [{
    id: providerAccountId,
    name: "Benchmark Meta Account",
    currency: "USD",
    timezone: "UTC",
    isManager: false,
  }];

  await sql`
    INSERT INTO users (id, name, email, password_hash, language, created_at)
    VALUES (${userId}, 'Benchmark User', ${email}, 'benchmark-hash', 'en', now())
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      password_hash = EXCLUDED.password_hash
  `;
  await sql`
    INSERT INTO businesses (id, name, owner_id, timezone, timezone_source, currency, is_demo_business, industry, platform, metadata, created_at)
    VALUES (${businessRowId}::uuid, 'Benchmark Business', ${userId}::uuid, 'UTC', 'benchmark', 'USD', false, 'benchmark', 'benchmark', '{"dbNormalizationBenchmark": true}'::jsonb, now())
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      owner_id = EXCLUDED.owner_id,
      timezone = EXCLUDED.timezone,
      timezone_source = EXCLUDED.timezone_source,
      currency = EXCLUDED.currency,
      is_demo_business = EXCLUDED.is_demo_business,
      industry = EXCLUDED.industry,
      platform = EXCLUDED.platform,
      metadata = EXCLUDED.metadata
  `;
  await sql`
    INSERT INTO memberships (user_id, business_id, role, status, joined_at, created_at)
    VALUES (${userId}::uuid, ${businessRowId}::uuid, 'admin', 'active', now(), now())
    ON CONFLICT (user_id, business_id) DO UPDATE SET
      role = EXCLUDED.role,
      status = EXCLUDED.status
  `;
  await upsertIntegration({
    businessId: businessRowId,
    provider: "meta",
    status: "connected",
    providerAccountId,
    providerAccountName: "Benchmark Meta Integration",
    metadata: { dbNormalizationBenchmark: true, seed: input.iterationSeed },
  });
  await upsertProviderAccountAssignments({
    businessId: businessRowId,
    provider: "meta",
    accountIds: [providerAccountId],
  });
  await writeProviderAccountSnapshot({
    businessId: businessRowId,
    provider: "meta",
    accountsPayload: snapshot,
    refreshFailed: false,
    lastError: null,
    sourceReason: "db-normalization-benchmark",
  });

  await disconnectIntegration(businessRowId, "meta");
  await clearProviderAccountAssignments(businessRowId, "meta");
  await writeProviderAccountSnapshot({
    businessId: businessRowId,
    provider: "meta",
    accountsPayload: snapshot,
    refreshFailed: false,
    lastError: null,
    sourceReason: "db-normalization-benchmark",
  });

  await cleanupWriteBenchmarkRows({
    businessId: businessRowId,
    providerAccountId: "unused-shopify-benchmark-account",
    shopId: "unused",
    orderId: "unused",
    metaProviderAccountId: providerAccountId,
    googleProviderAccountId: "unused",
    date: new Date().toISOString().slice(0, 10),
    userEmail: email,
    userId,
    businessRowId,
  });
}

async function runWarehouseMetaWriteCycle(input: {
  businessId: string;
  providerAccountId: string;
  iterationSeed: string;
  date: string;
}) {
  const accountRow = buildMetaAccountRow({
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    date: input.date,
    seed: input.iterationSeed,
  });
  const campaignRow = buildMetaCampaignRow({
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    date: input.date,
    seed: input.iterationSeed,
  });
  await upsertMetaAccountDailyRows([accountRow]);
  await upsertMetaCampaignDailyRows([campaignRow]);
  await upsertMetaAccountDailyRows([
    { ...accountRow, spend: accountRow.spend + 1, revenue: accountRow.revenue + 2, clicks: accountRow.clicks + 1 },
  ]);
  await upsertMetaCampaignDailyRows([
    { ...campaignRow, spend: campaignRow.spend + 1, revenue: campaignRow.revenue + 2, clicks: campaignRow.clicks + 1 },
  ]);
  const sql = getDb();
  await sql`DELETE FROM meta_campaign_daily WHERE business_id = ${input.businessId} AND provider_account_id = ${input.providerAccountId} AND date = ${input.date} AND campaign_id = ${campaignRow.campaignId}`;
  await sql`DELETE FROM meta_account_daily WHERE business_id = ${input.businessId} AND provider_account_id = ${input.providerAccountId} AND date = ${input.date}`;
}

async function runWarehouseGoogleWriteCycle(input: {
  businessId: string;
  providerAccountId: string;
  iterationSeed: string;
  date: string;
}) {
  const accountRow = buildGoogleAccountRow({
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    date: input.date,
    seed: input.iterationSeed,
  });
  const campaignRow = buildGoogleCampaignRow({
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    date: input.date,
    seed: input.iterationSeed,
  });
  await upsertGoogleAdsDailyRows("account_daily", [accountRow]);
  await upsertGoogleAdsDailyRows("campaign_daily", [campaignRow]);
  await upsertGoogleAdsDailyRows("account_daily", [
    { ...accountRow, spend: accountRow.spend + 1, revenue: accountRow.revenue + 2, clicks: accountRow.clicks + 1 },
  ]);
  await upsertGoogleAdsDailyRows("campaign_daily", [
    { ...campaignRow, spend: campaignRow.spend + 1, revenue: campaignRow.revenue + 2, clicks: campaignRow.clicks + 1 },
  ]);
  const sql = getDb();
  await sql`DELETE FROM google_ads_campaign_daily WHERE business_id = ${input.businessId} AND provider_account_id = ${input.providerAccountId} AND date = ${input.date} AND entity_key = ${campaignRow.entityKey}`;
  await sql`DELETE FROM google_ads_account_daily WHERE business_id = ${input.businessId} AND provider_account_id = ${input.providerAccountId} AND date = ${input.date} AND entity_key = ${accountRow.entityKey}`;
}

async function runWarehouseShopifyWriteCycle(input: {
  businessId: string;
  providerAccountId: string;
  iterationSeed: string;
}) {
  const shopId = makeStableUuid(`${input.iterationSeed}:shopify-shop`);
  const orderId = makeStableUuid(`${input.iterationSeed}:shopify-order`);
  const rows = buildShopifyRows({
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    shopId,
    orderId,
    seed: input.iterationSeed,
  });
  await upsertShopifyOrders([rows.order]);
  await upsertShopifyOrderLines([rows.orderLine]);
  await upsertShopifyRefunds([rows.refund]);
  await upsertShopifyOrderTransactions([rows.transaction]);
  await upsertShopifyReturns([rows.returned]);
  await upsertShopifyOrders([{
    ...rows.order,
    totalPrice: Number(rows.order.totalPrice ?? 0) + 1,
    subtotalPrice: Number(rows.order.subtotalPrice ?? 0) + 1,
  }]);
  const sql = getDb();
  await sql`DELETE FROM shopify_order_lines WHERE business_id = ${input.businessId} AND provider_account_id = ${input.providerAccountId} AND shop_id = ${shopId} AND order_id = ${orderId}`;
  await sql`DELETE FROM shopify_refunds WHERE business_id = ${input.businessId} AND provider_account_id = ${input.providerAccountId} AND shop_id = ${shopId} AND order_id = ${orderId}`;
  await sql`DELETE FROM shopify_order_transactions WHERE business_id = ${input.businessId} AND provider_account_id = ${input.providerAccountId} AND shop_id = ${shopId} AND order_id = ${orderId}`;
  await sql`DELETE FROM shopify_returns WHERE business_id = ${input.businessId} AND provider_account_id = ${input.providerAccountId} AND shop_id = ${shopId} AND return_id = ${rows.returned.returnId}`;
  await sql`DELETE FROM shopify_orders WHERE business_id = ${input.businessId} AND provider_account_id = ${input.providerAccountId} AND shop_id = ${shopId} AND order_id = ${orderId}`;
}

async function runServingWriteCycle(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
  iterationSeed: string;
}) {
  const overview = buildOverviewSummaryRows({
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    date: input.date,
    seed: input.iterationSeed,
  });
  await materializeOverviewSummaryRows(overview.rows);
  await materializeOverviewSummaryRange({
    businessId: input.businessId,
    provider: "meta",
    providerAccountIds: overview.range.providerAccountIds,
    startDate: overview.range.startDate,
    endDate: overview.range.endDate,
    rowCount: overview.range.rowCount,
    expectedRowCount: overview.range.expectedRowCount,
    coverageComplete: overview.range.coverageComplete,
    maxSourceUpdatedAt: overview.range.maxSourceUpdatedAt,
    truthState: overview.range.truthState,
    projectionVersion: overview.range.projectionVersion,
  });
  await materializeOverviewSummaryRange({
    businessId: input.businessId,
    provider: "google",
    providerAccountIds: overview.range.providerAccountIds,
    startDate: overview.range.startDate,
    endDate: overview.range.endDate,
    rowCount: overview.range.rowCount,
    expectedRowCount: overview.range.expectedRowCount,
    coverageComplete: overview.range.coverageComplete,
    maxSourceUpdatedAt: overview.range.maxSourceUpdatedAt,
    truthState: overview.range.truthState,
    projectionVersion: overview.range.projectionVersion,
  });
  const sql = getDb();
  await sql`DELETE FROM platform_overview_summary_ranges WHERE business_id = ${input.businessId} AND provider IN ('meta', 'google') AND start_date = ${input.date} AND end_date = ${input.date}`;
  await sql`DELETE FROM platform_overview_daily_summary WHERE business_id = ${input.businessId} AND provider_account_id = ${input.providerAccountId} AND date = ${input.date}`;
}

async function summarizeWriteScenario(
  name: string,
  iterations: number,
  operation: (iterationIndex: number) => Promise<{ sampleCardinality: number | null; validityNote: string; sourceKey?: string | null }>,
) {
  return measureScenario(name, iterations, async () => operation(0));
}

export async function runWriteBenchmark(input: {
  businessId?: string | null;
  requestedBusinessId?: string | null;
  iterations?: number;
}) {
  const selection = await collectWriteBenchmarkBusiness({
    requestedBusinessId: input.businessId ?? input.requestedBusinessId ?? null,
  });
  const iterations = Math.max(1, input.iterations ?? 2);
  const date = new Date().toISOString().slice(0, 10);
  const results: BenchmarkScenarioResult[] = [];
  const iterationSeeds = Array.from({ length: iterations }, (_, index) =>
    `${selection.businessId}:db-normalization:${index + 1}:${date}`,
  );

  results.push(
    await measureScenario("core_write_cycle", iterations, async () => {
      const iterationSeed = iterationSeeds.shift() ?? `${selection.businessId}:db-normalization:fallback:${date}`;
      await runCoreWriteCycle({ businessId: selection.businessId, iterationSeed });
      return {
        sampleCardinality: 6,
        validityNote: "valid",
        sourceKey: "core_cycle",
      };
    }),
  );

  const metaProviderAccountId = makeStableUuid(`${selection.businessId}:meta:db-normalization`);
  results.push(
    await measureScenario("warehouse_write_cycle_meta", iterations, async () => {
      const iterationSeed = `${selection.businessId}:meta:${performance.now().toFixed(0)}`;
      await runWarehouseMetaWriteCycle({
        businessId: selection.businessId,
        providerAccountId: metaProviderAccountId,
        iterationSeed,
        date,
      });
      return {
        sampleCardinality: 2,
        validityNote: "valid",
        sourceKey: "meta_warehouse",
      };
    }),
  );

  const googleProviderAccountId = makeStableUuid(`${selection.businessId}:google:db-normalization`);
  results.push(
    await measureScenario("warehouse_write_cycle_google", iterations, async () => {
      const iterationSeed = `${selection.businessId}:google:${performance.now().toFixed(0)}`;
      await runWarehouseGoogleWriteCycle({
        businessId: selection.businessId,
        providerAccountId: googleProviderAccountId,
        iterationSeed,
        date,
      });
      return {
        sampleCardinality: 2,
        validityNote: "valid",
        sourceKey: "google_warehouse",
      };
    }),
  );

  const shopifyProviderAccountId = makeStableUuid(`${selection.businessId}:shopify:db-normalization`);
  results.push(
    await measureScenario("warehouse_write_cycle_shopify", iterations, async () => {
      const iterationSeed = `${selection.businessId}:shopify:${performance.now().toFixed(0)}`;
      await runWarehouseShopifyWriteCycle({
        businessId: selection.businessId,
        providerAccountId: shopifyProviderAccountId,
        iterationSeed,
      });
      return {
        sampleCardinality: 5,
        validityNote: "valid",
        sourceKey: "shopify_warehouse",
      };
    }),
  );

  results.push(
    await measureScenario("serving_write_cycle", iterations, async () => {
      await runServingWriteCycle({
        businessId: selection.businessId,
        providerAccountId: metaProviderAccountId,
        date,
        iterationSeed: `${selection.businessId}:serving:${performance.now().toFixed(0)}`,
      });
      return {
        sampleCardinality: 2,
        validityNote: "valid",
        sourceKey: "overview_projection",
      };
    }),
  );

  return {
    selectedBusinessId: selection.businessId,
    selectionMode: selection.selectionMode,
    selectionEvidence: selection.selectionEvidence,
    capturedAt: new Date().toISOString(),
    scenarios: results,
  } satisfies BenchmarkSeriesResult;
}

function diffValue(before: number | null, after: number | null) {
  if (before == null && after == null) {
    return { before: null, after: null, delta: null, deltaPercent: null };
  }
  if (before == null) {
    return { before: null, after, delta: null, deltaPercent: null };
  }
  if (after == null) {
    return { before, after: null, delta: null, deltaPercent: null };
  }
  const delta = after - before;
  return {
    before,
    after,
    delta,
    deltaPercent: before === 0 ? null : round((delta / before) * 100, 2),
  };
}

function diffBenchmarkScenarios(
  beforeScenarios: BenchmarkScenarioResult[],
  afterScenarios: BenchmarkScenarioResult[],
) {
  const beforeByName = new Map(beforeScenarios.map((scenario) => [scenario.name, scenario]));
  return afterScenarios.map((after) => {
    const before = beforeByName.get(after.name) ?? null;
    return {
      name: after.name,
      before: before
        ? {
            averageMs: before.averageMs,
            minMs: before.minMs,
            maxMs: before.maxMs,
            p50Ms: before.p50Ms,
            p95Ms: before.p95Ms,
            sampleCardinality: before.sampleCardinality,
          }
        : null,
      after: {
        averageMs: after.averageMs,
        minMs: after.minMs,
        maxMs: after.maxMs,
        p50Ms: after.p50Ms,
        p95Ms: after.p95Ms,
        sampleCardinality: after.sampleCardinality,
      },
      delta: before
        ? {
            averageMs: round(after.averageMs - before.averageMs, 2),
            p50Ms: round(after.p50Ms - before.p50Ms, 2),
            p95Ms: round(after.p95Ms - before.p95Ms, 2),
          }
        : null,
      validityNote: `${before?.validityNote ?? "missing"} -> ${after.validityNote}`,
    };
  });
}

function diffArrayByName(
  before: Array<Record<string, unknown>>,
  after: Array<Record<string, unknown>>,
  nameKey: string,
  valueKeys: string[],
) {
  const beforeByName = new Map<string, Record<string, unknown>>();
  for (const row of before) {
    beforeByName.set(String(row[nameKey] ?? ""), row);
  }
  return after.map((row) => {
    const beforeRow = beforeByName.get(String(row[nameKey] ?? ""));
    const result: Record<string, unknown> = {
      [nameKey]: row[nameKey],
      before: beforeRow ?? null,
      after: row,
    };
    for (const valueKey of valueKeys) {
      const beforeValue = beforeRow ? toMaybeNumber(beforeRow[valueKey]) : null;
      const afterValue = toMaybeNumber(row[valueKey]);
      result[valueKey] = diffValue(beforeValue, afterValue);
    }
    return result;
  });
}

export function compareNormalizationArtifacts(before: DbNormalizationCaptureArtifact, after: DbNormalizationCaptureArtifact) {
  const dbSize = {
    databaseBytes: diffValue(before.dbSize.databaseBytes, after.dbSize.databaseBytes),
    tableBytes: diffValue(before.dbSize.tableBytes, after.dbSize.tableBytes),
    indexBytes: diffValue(before.dbSize.indexBytes, after.dbSize.indexBytes),
    relationCount: diffValue(before.dbSize.relationCount, after.dbSize.relationCount),
  };

  const familyBefore = new Map(before.dbSize.byFamily.map((row) => [row.family, row]));
  const familyDiff = after.dbSize.byFamily.map((row) => {
    const previous = familyBefore.get(row.family);
    return {
      family: row.family,
      tableCount: diffValue(previous?.tableCount ?? null, row.tableCount),
      approxRows: diffValue(previous?.approxRows ?? null, row.approxRows),
      tableBytes: diffValue(previous?.tableBytes ?? null, row.tableBytes),
      indexBytes: diffValue(previous?.indexBytes ?? null, row.indexBytes),
      totalBytes: diffValue(previous?.totalBytes ?? null, row.totalBytes),
    };
  });

  const beforeTables = new Map(before.dbSize.byTable.map((row) => [`${row.schemaName}.${row.tableName}`, row]));
  const tableDiff = after.dbSize.byTable.map((row) => {
    const key = `${row.schemaName}.${row.tableName}`;
    const previous = beforeTables.get(key);
    return {
      schemaName: row.schemaName,
      tableName: row.tableName,
      family: row.family,
      approxRows: diffValue(previous?.approxRows ?? null, row.approxRows),
      tableBytes: diffValue(previous?.tableBytes ?? null, row.tableBytes),
      indexBytes: diffValue(previous?.indexBytes ?? null, row.indexBytes),
      totalBytes: diffValue(previous?.totalBytes ?? null, row.totalBytes),
    };
  });

  const byScenario = {
    read: diffBenchmarkScenarios(before.readBenchmark.scenarios, after.readBenchmark.scenarios),
    write: before.writeBenchmark && after.writeBenchmark
      ? diffBenchmarkScenarios(before.writeBenchmark.scenarios, after.writeBenchmark.scenarios)
      : null,
  };

  return {
    capturedAt: new Date().toISOString(),
    runDir: after.runDir,
    phases: {
      before: {
        capturedAt: before.capturedAt,
        selectedBusinessId: before.readBenchmark.selectedBusinessId,
      },
      after: {
        capturedAt: after.capturedAt,
        selectedBusinessId: after.readBenchmark.selectedBusinessId,
      },
    },
    dbSize,
    families: familyDiff,
    tables: tableDiff,
    hostMemory: {
      totalBytes: diffValue(before.hostMemory.totalBytes, after.hostMemory.totalBytes),
      availableBytes: diffValue(before.hostMemory.availableBytes, after.hostMemory.availableBytes),
      freeBytes: diffValue(before.hostMemory.freeBytes, after.hostMemory.freeBytes),
    },
    postgresConfig: {
      before: before.postgresConfig.settings,
      after: after.postgresConfig.settings,
    },
    storage: {
      relationCount: diffValue(before.storage.relationSizes.length, after.storage.relationSizes.length),
      pgStatStatementsEnabled: {
        before: before.storage.pgStatStatements.enabled,
        after: after.storage.pgStatStatements.enabled,
      },
    },
    baselineChecks: {
      duplicateNaturalKeys: diffArrayByName(before.baselineChecks.duplicateNaturalKeys, after.baselineChecks.duplicateNaturalKeys, "table_name", ["row_count"]),
      nullAnomalies: diffArrayByName(before.baselineChecks.nullAnomalies, after.baselineChecks.nullAnomalies, "table_name", ["null_rows"]),
      coverageGaps: {
        beforeCount: before.baselineChecks.coverageGaps.length,
        afterCount: after.baselineChecks.coverageGaps.length,
        delta: after.baselineChecks.coverageGaps.length - before.baselineChecks.coverageGaps.length,
      },
      projectionParity: {
        beforeCount: before.baselineChecks.projectionParity.length,
        afterCount: after.baselineChecks.projectionParity.length,
        delta: after.baselineChecks.projectionParity.length - before.baselineChecks.projectionParity.length,
      },
      providerSanityAggregates: {
        beforeCount: before.baselineChecks.providerSanityAggregates.length,
        afterCount: after.baselineChecks.providerSanityAggregates.length,
        delta: after.baselineChecks.providerSanityAggregates.length - before.baselineChecks.providerSanityAggregates.length,
      },
    },
    benchmarks: byScenario,
  };
}

export function formatNormalizationComparisonMarkdown(input: ReturnType<typeof compareNormalizationArtifacts>) {
  const lines = [
    "# DB Normalization Evidence Comparison",
    "",
    `- Run dir: \`${input.runDir}\``,
    `- Before captured at: \`${input.phases.before.capturedAt}\``,
    `- After captured at: \`${input.phases.after.capturedAt}\``,
    `- Before business: \`${input.phases.before.selectedBusinessId}\``,
    `- After business: \`${input.phases.after.selectedBusinessId}\``,
    "",
    "## Size",
    `- Database bytes delta: ${input.dbSize.databaseBytes.delta ?? "n/a"}`,
    `- Table bytes delta: ${input.dbSize.tableBytes.delta ?? "n/a"}`,
    `- Index bytes delta: ${input.dbSize.indexBytes.delta ?? "n/a"}`,
    "",
    "## Read Benchmarks",
  ];
  for (const scenario of input.benchmarks.read) {
    lines.push(
      `- ${scenario.name}: ${scenario.before ? scenario.before.averageMs : "n/a"} -> ${scenario.after.averageMs} ms${scenario.delta ? ` (delta ${scenario.delta.averageMs} ms)` : ""}`,
    );
  }
  if (input.benchmarks.write) {
    lines.push("", "## Write Benchmarks");
    for (const scenario of input.benchmarks.write) {
      lines.push(
        `- ${scenario.name}: ${scenario.before ? scenario.before.averageMs : "n/a"} -> ${scenario.after.averageMs} ms${scenario.delta ? ` (delta ${scenario.delta.averageMs} ms)` : ""}`,
      );
    }
  }
  lines.push("", "## Baseline Checks", `- Duplicate key checks compared: ${input.baselineChecks.duplicateNaturalKeys.length}`);
  return lines.join("\n");
}

export async function captureNormalizationArtifact(input: {
  phase: BenchmarkPhase;
  runDir?: string | null;
  businessId?: string | null;
  readIterations?: number;
  writeIterations?: number;
}) {
  configureOperationalScriptRuntime();
  const runDir = buildNormalizationRunDir({ runDir: input.runDir ?? null });
  const artifactDir = await ensureNormalizationArtifactDir({ runDir, phase: input.phase });
  const baselineSqlPath = path.resolve("docs/architecture/live-db-baseline-checks.sql");
  const baselineSqlContent = readFileSync(baselineSqlPath, "utf8");
  const capturedAt = new Date().toISOString();

  const readBenchmark = await runReadBenchmark({
    businessId: input.businessId ?? null,
    iterations30: input.readIterations ?? 2,
    iterations90: input.readIterations ?? 2,
    trendIterations: input.readIterations ?? 2,
  });

  const writeBenchmark = input.writeIterations === 0
    ? null
    : await runWriteBenchmark({
        businessId: input.businessId ?? null,
        iterations: input.writeIterations ?? 2,
      }).catch((error) => {
        return null;
      });

  const payload: DbNormalizationCaptureArtifact = {
    phase: input.phase,
    capturedAt,
    runDir,
    artifactDir,
    baselineSql: {
      path: baselineSqlPath,
      sha256: createHash("sha256").update(baselineSqlContent).digest("hex"),
      sizeBytes: Buffer.byteLength(baselineSqlContent),
    },
    hostMemory: collectHostMemorySnapshot(),
    postgresConfig: await collectPostgresConfigSnapshot(),
    dbSize: await collectDatabaseSizeSnapshot(),
    dbRuntime: getDbRuntimeDiagnostics(),
    storage: await collectStorageSnapshot(),
    baselineChecks: await collectBaselineChecksSnapshot(),
    readBenchmark,
    writeBenchmark,
  };

  const captureFile = path.join(artifactDir, "capture.json");
  await writeJsonArtifact(captureFile, payload);
  await writeTextArtifact(
    path.join(artifactDir, "capture.md"),
    [
      `# DB Normalization Capture (${input.phase})`,
      "",
      `- Captured at: \`${capturedAt}\``,
      `- Business: \`${readBenchmark.selectedBusinessId}\``,
      `- Baseline SQL: \`${baselineSqlPath}\``,
    ].join("\n"),
  );

  return payload;
}

export function loadNormalizationCaptureArtifact(filePath: string): DbNormalizationCaptureArtifact {
  return JSON.parse(readFileSync(filePath, "utf8")) as DbNormalizationCaptureArtifact;
}
