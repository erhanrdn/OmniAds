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

type ArchiveResult = {
  sourceTable: string;
  archivedRows: number;
  deletedRows: number;
};

const ORPHAN_SOURCE_TABLES = [
  "integrations",
  "provider_account_snapshots",
  "provider_connections",
  "provider_account_assignments",
  "business_provider_accounts",
  "provider_account_snapshot_runs",
] as const;

async function doesTableExist(tableName: (typeof ORPHAN_SOURCE_TABLES)[number]) {
  const sql = getDbWithTimeout(60_000);
  const [row] = (await sql.query<{ exists: boolean | null }>(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [`public.${tableName}`],
  )) as Array<{ exists: boolean | null }>;
  return row?.exists === true;
}

async function countAndArchiveSource(tableName: (typeof ORPHAN_SOURCE_TABLES)[number]) {
  const sql = getDbWithTimeout(600_000);
  if (!(await doesTableExist(tableName))) {
    return {
      sourceTable: tableName,
      archivedRows: 0,
      deletedRows: 0,
    } satisfies ArchiveResult;
  }

  const [counts] = (await sql.query<{
    archived_rows: number | string | null;
    deleted_rows: number | string | null;
  }>(
    `
      WITH orphan_rows AS (
        SELECT to_jsonb(source_row) AS payload_json
        FROM ${tableName} AS source_row
        LEFT JOIN businesses AS business
          ON business.id::text = source_row.business_id::text
        WHERE business.id IS NULL
      ),
      inserted AS (
        INSERT INTO db_normalization_orphan_core_legacy (
          source_table,
          business_id,
          provider,
          payload_hash,
          payload_json,
          reason
        )
        SELECT
          $1::text,
          payload_json->>'business_id',
          payload_json->>'provider',
          md5(payload_json::text),
          payload_json,
          'business_missing_during_normalization'
        FROM orphan_rows
        ON CONFLICT (source_table, payload_hash) DO NOTHING
        RETURNING 1
      ),
      deleted AS (
        DELETE FROM ${tableName} AS source_row
        USING orphan_rows
        WHERE to_jsonb(source_row) = orphan_rows.payload_json
        RETURNING 1
      )
      SELECT
        (SELECT COUNT(*)::int FROM inserted) AS archived_rows,
        (SELECT COUNT(*)::int FROM deleted) AS deleted_rows
    `,
    [tableName],
  )) as Array<{
    archived_rows: number | string | null;
    deleted_rows: number | string | null;
  }>;

  return {
    sourceTable: tableName,
    archivedRows: Number(counts?.archived_rows ?? 0),
    deletedRows: Number(counts?.deleted_rows ?? 0),
  } satisfies ArchiveResult;
}

function buildMarkdown(input: {
  capturedAt: string;
  runDir: string;
  results: ArchiveResult[];
}) {
  const lines = [
    "# DB Normalization Orphan Archive",
    "",
    `- Captured at: \`${input.capturedAt}\``,
    `- Run dir: \`${input.runDir}\``,
    "",
    "## Results",
    ...input.results.map(
      (result) =>
        `- ${result.sourceTable}: archived=${result.archivedRows}, deleted=${result.deletedRows}`,
    ),
  ];
  return lines.join("\n");
}

async function main() {
  configureOperationalScriptRuntime();
  const parsed = parseCliArgs(process.argv.slice(2));
  const runDir = buildNormalizationRunDir({
    runDir: getOptionalCliValue(parsed, "run-dir", null) ?? undefined,
  });
  const outDir = getOptionalCliValue(parsed, "out-dir", path.join(runDir, "archive-orphans"))!;

  const payload = await withOperationalStartupLogsSilenced(async () => {
    const sql = getDbWithTimeout(600_000);
    await sql.query(`
      CREATE TABLE IF NOT EXISTS db_normalization_orphan_core_legacy (
        id BIGSERIAL PRIMARY KEY,
        source_table TEXT NOT NULL,
        business_id TEXT,
        provider TEXT,
        payload_hash TEXT NOT NULL,
        payload_json JSONB NOT NULL,
        reason TEXT NOT NULL,
        archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (source_table, payload_hash)
      )
    `);

    const results: ArchiveResult[] = [];
    for (const tableName of ORPHAN_SOURCE_TABLES) {
      results.push(await countAndArchiveSource(tableName));
    }

    return {
      capturedAt: new Date().toISOString(),
      runDir,
      outDir,
      results,
    };
  });

  await writeJsonFile(path.join(outDir, "archive.json"), payload);
  await writeTextFile(
    path.join(outDir, "archive.md"),
    buildMarkdown({
      capturedAt: payload.capturedAt,
      runDir: payload.runDir,
      results: payload.results,
    }),
  );

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
