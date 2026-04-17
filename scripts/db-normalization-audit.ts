import path from "node:path";
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
};

type LegacyCorePhase = "compat_retained" | "removed";

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
      });
    }
  }

  return results;
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
  coreLegacyState: CoreLegacyState;
}) {
  const lines: string[] = [];
  const refGaps = input.refCoverage.filter((row) => row.totalRows > 0 && row.nullRefRows > 0);
  const businessRefGaps = refGaps.filter((row) => row.refColumn === "business_ref_id");
  const providerRefGaps = refGaps.filter(
    (row) => row.refColumn === "provider_account_ref_id",
  );

  lines.push("# DB Normalization Audit");
  lines.push("");
  lines.push(`- Captured at: \`${input.capturedAt}\``);
  lines.push(`- Run dir: \`${input.runDir}\``);
  lines.push(`- Tables with business ref gaps: ${businessRefGaps.length}`);
  lines.push(`- Tables with provider-account ref gaps: ${providerRefGaps.length}`);
  lines.push(`- Legacy core phase: ${input.coreLegacyState.legacyPhase}`);
  lines.push(
    `- Normalized core rows: connections=${input.coreLegacyState.providerConnectionsRows}, business_provider_accounts=${input.coreLegacyState.businessProviderAccountsRows}, snapshot_runs=${input.coreLegacyState.snapshotRunsRows}, snapshot_items=${input.coreLegacyState.snapshotItemsRows}`,
  );
  lines.push("");

  if (refGaps.length > 0) {
    lines.push("## Ref Gaps");
    for (const gap of refGaps) {
      lines.push(
        `- ${gap.tableName}.${gap.refColumn}: ${gap.nullRefRows}/${gap.totalRows} rows still null`,
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

async function main() {
  configureOperationalScriptRuntime();
  const parsed = parseCliArgs(process.argv.slice(2));
  const runDir = buildNormalizationRunDir({
    runDir: getOptionalCliValue(parsed, "run-dir", null) ?? undefined,
  });
  const outDir = getOptionalCliValue(parsed, "out-dir", path.join(runDir, "audit"))!;

  const payload = await withOperationalStartupLogsSilenced(async () => {
    const capturedAt = new Date().toISOString();
    const refCoverage = await collectRefCoverage();
    const coreLegacyState = await collectCoreLegacyState();
    const summary = {
      totalRefTables: refCoverage.length,
      tablesWithRefGaps: refCoverage.filter(
        (row) => row.totalRows > 0 && row.nullRefRows > 0,
      ).length,
      businessRefGapTables: refCoverage.filter(
        (row) =>
          row.refColumn === "business_ref_id" &&
          row.totalRows > 0 &&
          row.nullRefRows > 0,
      ).length,
      providerRefGapTables: refCoverage.filter(
        (row) =>
          row.refColumn === "provider_account_ref_id" &&
          row.totalRows > 0 &&
          row.nullRefRows > 0,
      ).length,
      legacyPhase: coreLegacyState.legacyPhase,
      retainedLegacyTables: coreLegacyState.tables.filter((table) => table.exists).length,
      removedLegacyTables: coreLegacyState.tables.filter((table) => !table.exists).length,
    };

    return {
      capturedAt,
      runDir,
      outDir,
      summary,
      refCoverage,
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
      coreLegacyState: payload.coreLegacyState,
    }),
  );

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
