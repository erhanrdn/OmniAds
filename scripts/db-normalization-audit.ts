import path from "node:path";
import { pathToFileURL } from "node:url";
import { getDbWithTimeout } from "@/lib/db";
import {
  buildNormalizationRunDir,
  getOptionalCliValue,
  parseCliArgs,
  writeJsonFile,
  writeTextFile,
} from "./db-normalization-support";
import {
  configureOperationalScriptRuntime,
  withOperationalStartupLogsSilenced,
} from "./_operational-runtime";

type RefCoverageRow = {
  tableName: string;
  refColumn: "business_ref_id" | "provider_account_ref_id";
  totalRows: number;
  nullRefRows: number;
  populatedRefRows: number;
  expectedNullRefRows: number;
  blockingNullRefRows: number;
};

type LegacyCorePhase = "compat_retained" | "removed";

type ExpectedNullRef = {
  tableName: "provider_connections";
  refColumn: "provider_account_ref_id";
  rowCount: number;
  reason: "search_console_not_selected";
};

type LegacyTableState = {
  tableName:
    | "integrations"
    | "provider_account_assignments"
    | "provider_account_snapshots";
  exists: boolean;
  rows: number | null;
};

type CoreLegacyState = {
  legacyPhase: LegacyCorePhase;
  tables: LegacyTableState[];
  providerConnectionsRows: number;
  businessProviderAccountsRows: number;
  snapshotRunsRows: number;
  snapshotItemsRows: number;
};

type AuditSummary = {
  totalRefTables: number;
  tablesWithRefGaps: number;
  tablesWithBlockingRefGaps: number;
  businessRefGapTables: number;
  providerRefGapTables: number;
  businessBlockingRefGapTables: number;
  providerBlockingRefGapTables: number;
  expectedNullRefTables: number;
  expectedNullRefRows: number;
  legacyPhase: LegacyCorePhase;
  retainedLegacyTables: number;
  removedLegacyTables: number;
};

type ExpectedNullRefCandidate = {
  provider: string | null;
  provider_account_id: string | null;
  provider_account_name: string | null;
  business_ref_id: string | null;
};

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

async function collectRefCoverage() {
  const sql = getDbWithTimeout(30_000);
  const refColumns = ["business_ref_id", "provider_account_ref_id"] as const;
  const results: RefCoverageRow[] = [];

  for (const refColumn of refColumns) {
    const tableRows = (await sql.query<{ table_name: string }>(
      `
        SELECT DISTINCT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = $1
        ORDER BY table_name ASC
      `,
      [refColumn],
    )) as Array<{ table_name: string }>;

    for (const row of tableRows) {
      const tableName = String(row.table_name);
      const counts = (await sql.query<{
        total_rows: number | string | null;
        null_ref_rows: number | string | null;
      }>(
        `
          SELECT
            COUNT(*)::bigint AS total_rows,
            COUNT(*) FILTER (WHERE ${quoteIdentifier(refColumn)} IS NULL)::bigint AS null_ref_rows
          FROM ${quoteIdentifier(tableName)}
        `,
      )) as Array<{
        total_rows: number | string | null;
        null_ref_rows: number | string | null;
      }>;

      const totalRows = toNumber(counts[0]?.total_rows);
      const nullRefRows = toNumber(counts[0]?.null_ref_rows);
      results.push({
        tableName,
        refColumn,
        totalRows,
        nullRefRows,
        populatedRefRows: Math.max(0, totalRows - nullRefRows),
        expectedNullRefRows: 0,
        blockingNullRefRows: nullRefRows,
      });
    }
  }

  return results;
}

export function isExpectedNullProviderAccountRef(input: {
  legacyPhase: LegacyCorePhase;
  tableName: string;
  refColumn: "business_ref_id" | "provider_account_ref_id";
  provider: string | null;
  providerAccountId: string | null;
  providerAccountName: string | null;
  businessRefId: string | null;
}) {
  return (
    input.legacyPhase === "removed" &&
    input.tableName === "provider_connections" &&
    input.refColumn === "provider_account_ref_id" &&
    input.provider === "search_console" &&
    input.providerAccountId == null &&
    input.providerAccountName === "Not selected" &&
    input.businessRefId != null
  );
}

async function collectExpectedNullRefs(
  legacyPhase: LegacyCorePhase,
): Promise<ExpectedNullRef[]> {
  if (legacyPhase !== "removed") {
    return [];
  }

  const sql = getDbWithTimeout(30_000);
  const rows = (await sql.query<ExpectedNullRefCandidate>(
    `
      SELECT
        provider,
        provider_account_id::text AS provider_account_id,
        provider_account_name,
        business_ref_id::text AS business_ref_id
      FROM provider_connections
      WHERE provider_account_ref_id IS NULL
    `,
  )) as ExpectedNullRefCandidate[];

  const rowCount = rows.filter((row) =>
    isExpectedNullProviderAccountRef({
      legacyPhase,
      tableName: "provider_connections",
      refColumn: "provider_account_ref_id",
      provider: row.provider,
      providerAccountId: row.provider_account_id,
      providerAccountName: row.provider_account_name,
      businessRefId: row.business_ref_id,
    }),
  ).length;

  if (rowCount === 0) {
    return [];
  }

  return [
    {
      tableName: "provider_connections",
      refColumn: "provider_account_ref_id",
      rowCount,
      reason: "search_console_not_selected",
    },
  ];
}

function applyExpectedNullRefs(
  refCoverage: RefCoverageRow[],
  expectedNullRefs: ExpectedNullRef[],
) {
  const expectedByKey = new Map(
    expectedNullRefs.map((row) => [
      `${row.tableName}:${row.refColumn}`,
      row.rowCount,
    ]),
  );

  return refCoverage.map((row) => {
    const expectedNullRefRows = Math.min(
      row.nullRefRows,
      expectedByKey.get(`${row.tableName}:${row.refColumn}`) ?? 0,
    );
    return {
      ...row,
      expectedNullRefRows,
      blockingNullRefRows: Math.max(0, row.nullRefRows - expectedNullRefRows),
    };
  });
}

async function collectCoreLegacyState(): Promise<CoreLegacyState> {
  const sql = getDbWithTimeout(30_000);
  const doesTableExist = async (tableName: string) => {
    try {
      const rows = (await sql.query<{ exists: boolean | null }>(
        "SELECT to_regclass($1) IS NOT NULL AS exists",
        [`public.${tableName}`],
      )) as Array<{ exists: boolean | null }>;
      return rows[0]?.exists === true;
    } catch {
      return false;
    }
  };
  const safeCount = async (tableName: string) => {
    if (!(await doesTableExist(tableName))) {
      return null;
    }
    try {
      const rows = (await sql.query<{ value: number | string | null }>(
        `SELECT COUNT(*)::bigint AS value FROM ${quoteIdentifier(tableName)}`,
      )) as Array<{ value: number | string | null }>;
      return toNumber(rows[0]?.value);
    } catch {
      return null;
    }
  };

  const tables: LegacyTableState[] = [
    {
      tableName: "integrations",
      exists: await doesTableExist("integrations"),
      rows: await safeCount("integrations"),
    },
    {
      tableName: "provider_account_assignments",
      exists: await doesTableExist("provider_account_assignments"),
      rows: await safeCount("provider_account_assignments"),
    },
    {
      tableName: "provider_account_snapshots",
      exists: await doesTableExist("provider_account_snapshots"),
      rows: await safeCount("provider_account_snapshots"),
    },
  ];

  return {
    legacyPhase: tables.some((table) => table.exists)
      ? "compat_retained"
      : "removed",
    tables,
    providerConnectionsRows: (await safeCount("provider_connections")) ?? 0,
    businessProviderAccountsRows:
      (await safeCount("business_provider_accounts")) ?? 0,
    snapshotRunsRows:
      (await safeCount("provider_account_snapshot_runs")) ?? 0,
    snapshotItemsRows:
      (await safeCount("provider_account_snapshot_items")) ?? 0,
  };
}

function buildMarkdown(input: {
  capturedAt: string;
  runDir: string;
  refCoverage: RefCoverageRow[];
  expectedNullRefs: ExpectedNullRef[];
  coreLegacyState: CoreLegacyState;
  summary: AuditSummary;
}) {
  const lines: string[] = [];
  const refGaps = input.refCoverage.filter(
    (row) => row.totalRows > 0 && row.blockingNullRefRows > 0,
  );

  lines.push("# DB Normalization Audit");
  lines.push("");
  lines.push(`- Captured at: \`${input.capturedAt}\``);
  lines.push(`- Run dir: \`${input.runDir}\``);
  lines.push(
    `- Tables with business ref gaps: ${input.summary.businessBlockingRefGapTables}`,
  );
  lines.push(
    `- Tables with provider-account ref gaps: ${input.summary.providerBlockingRefGapTables}`,
  );
  lines.push(`- Expected null-ref tables: ${input.summary.expectedNullRefTables}`);
  lines.push(`- Expected null-ref rows: ${input.summary.expectedNullRefRows}`);
  lines.push(`- Legacy core phase: ${input.coreLegacyState.legacyPhase}`);
  lines.push(
    `- Normalized core rows: connections=${input.coreLegacyState.providerConnectionsRows}, business_provider_accounts=${input.coreLegacyState.businessProviderAccountsRows}, snapshot_runs=${input.coreLegacyState.snapshotRunsRows}, snapshot_items=${input.coreLegacyState.snapshotItemsRows}`,
  );
  lines.push("");

  if (refGaps.length > 0) {
    lines.push("## Ref Gaps");
    for (const gap of refGaps) {
      lines.push(
        `- ${gap.tableName}.${gap.refColumn}: ${gap.blockingNullRefRows}/${gap.totalRows} blocking rows still null`,
      );
    }
    lines.push("");
  }

  if (input.expectedNullRefs.length > 0) {
    lines.push("## Expected Null Refs");
    for (const expected of input.expectedNullRefs) {
      lines.push(
        `- ${expected.tableName}.${expected.refColumn}: ${expected.rowCount} rows intentionally null (${expected.reason})`,
      );
    }
    lines.push("");
  }

  lines.push("## Legacy Compatibility State");
  if (input.coreLegacyState.legacyPhase === "removed") {
    lines.push("- Legacy core tables are absent, which is the expected post-second-window state.");
  } else {
    for (const table of input.coreLegacyState.tables) {
      lines.push(
        `- ${table.tableName}: ${table.exists ? `retained (${table.rows ?? 0} rows)` : "missing"}`,
      );
    }
  }

  return lines.join("\n");
}

export function buildAuditSummary(input: {
  refCoverage: RefCoverageRow[];
  expectedNullRefs: ExpectedNullRef[];
  coreLegacyState: CoreLegacyState;
}): AuditSummary {
  const blockingRefGaps = input.refCoverage.filter(
    (row) => row.totalRows > 0 && row.blockingNullRefRows > 0,
  );
  const businessBlockingRefGaps = blockingRefGaps.filter(
    (row) => row.refColumn === "business_ref_id",
  );
  const providerBlockingRefGaps = blockingRefGaps.filter(
    (row) => row.refColumn === "provider_account_ref_id",
  );
  const expectedNullRefRows = input.expectedNullRefs.reduce(
    (sum, row) => sum + row.rowCount,
    0,
  );

  return {
    totalRefTables: input.refCoverage.length,
    tablesWithRefGaps: blockingRefGaps.length,
    tablesWithBlockingRefGaps: blockingRefGaps.length,
    businessRefGapTables: businessBlockingRefGaps.length,
    providerRefGapTables: providerBlockingRefGaps.length,
    businessBlockingRefGapTables: businessBlockingRefGaps.length,
    providerBlockingRefGapTables: providerBlockingRefGaps.length,
    expectedNullRefTables: input.expectedNullRefs.length,
    expectedNullRefRows,
    legacyPhase: input.coreLegacyState.legacyPhase,
    retainedLegacyTables: input.coreLegacyState.tables.filter((table) => table.exists)
      .length,
    removedLegacyTables: input.coreLegacyState.tables.filter((table) => !table.exists)
      .length,
  };
}

async function main() {
  configureOperationalScriptRuntime();
  const parsed = parseCliArgs(process.argv.slice(2));
  const runDir = buildNormalizationRunDir({
    runDir: getOptionalCliValue(parsed, "run-dir", null) ?? undefined,
  });
  const outDir = getOptionalCliValue(parsed, "out-dir", path.join(runDir, "audit"))!;

  const payload = await withOperationalStartupLogsSilenced(async () => {
    const capturedAt = new Date().toISOString();
    const coreLegacyState = await collectCoreLegacyState();
    const expectedNullRefs = await collectExpectedNullRefs(
      coreLegacyState.legacyPhase,
    );
    const refCoverage = applyExpectedNullRefs(
      await collectRefCoverage(),
      expectedNullRefs,
    );
    const summary = buildAuditSummary({
      refCoverage,
      expectedNullRefs,
      coreLegacyState,
    });

    return {
      capturedAt,
      runDir,
      outDir,
      summary,
      refCoverage,
      expectedNullRefs,
      coreLegacyState,
    };
  });

  const jsonPath = path.join(outDir, "audit.json");
  const markdownPath = path.join(outDir, "audit.md");
  await writeJsonFile(jsonPath, payload);
  await writeTextFile(
    markdownPath,
    buildMarkdown({
      capturedAt: payload.capturedAt,
      runDir: payload.runDir,
      refCoverage: payload.refCoverage,
      expectedNullRefs: payload.expectedNullRefs,
      coreLegacyState: payload.coreLegacyState,
      summary: payload.summary,
    }),
  );

  console.log(JSON.stringify(payload, null, 2));
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
