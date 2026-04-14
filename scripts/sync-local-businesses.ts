import { loadEnvConfig } from "@next/env";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { Client } from "pg";

loadEnvConfig(process.cwd());
loadOptionalEnvFile(path.join(process.cwd(), ".env.local.sync"));

const DEFAULT_BUSINESS_NAMES = ["IwaStore", "Grandmix", "TheSwaf"];
const BUSINESS_ROOT_COLUMNS = new Set(["business_id", "preferred_business_id", "active_business_id"]);
const SOURCE_REMOTE_PORT = Number(process.env.LOCAL_SYNC_SOURCE_REMOTE_PORT?.trim() || "5432");
const INSERT_BATCH_SIZE = 250;

type TableMeta = {
  name: string;
  columns: string[];
  columnDataTypes: Record<string, string>;
  pkCols: string[];
  businessRootColumns: string[];
  tempTableName: string;
};

type ForeignKeyMeta = {
  childTable: string;
  childCols: string[];
  parentTable: string;
  parentCols: string[];
  constraintName: string;
};

type BusinessRecord = {
  id: string;
  name: string;
};

function parsePostgresTextArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (typeof value !== "string") return [];
  if (value === "{}") return [];

  return value
    .slice(1, -1)
    .split(",")
    .map((item) => item.replace(/^"(.*)"$/, "$1"))
    .filter(Boolean);
}

function loadOptionalEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] != null) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function parseCliBusinessNames() {
  const names: string[] = [];
  const args = process.argv.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--business") {
      const value = args[index + 1];
      if (!value) throw new Error("--business requires a value.");
      names.push(value);
      index += 1;
      continue;
    }

    if (arg.startsWith("--business=")) {
      names.push(arg.slice("--business=".length));
      continue;
    }
  }

  if (names.length > 0) return names;

  const envValue = process.env.LOCAL_SYNC_DEFAULT_BUSINESS_NAMES?.trim();
  if (envValue) {
    return envValue
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return [...DEFAULT_BUSINESS_NAMES];
}

function normalizeBusinessName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function quotedIdent(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function qualifiedTable(tableName: string) {
  return `${quotedIdent("public")}.${quotedIdent(tableName)}`;
}

function buildJoinCondition(
  leftAlias: string,
  leftCols: string[],
  rightAlias: string,
  rightCols: string[],
) {
  return leftCols
    .map((columnName, index) => {
      const rightColumnName = rightCols[index];
      return `${leftAlias}.${quotedIdent(columnName)} = ${rightAlias}.${quotedIdent(rightColumnName)}`;
    })
    .join(" AND ");
}

function buildPkProjection(alias: string, pkCols: string[]) {
  return pkCols.map((columnName) => `${alias}.${quotedIdent(columnName)}`).join(", ");
}

function ensureDatabaseUrl(value: string | undefined, envName: string) {
  const url = value?.trim();
  if (!url) {
    throw new Error(
      `${envName} is not set. Local sync needs a source and a target PostgreSQL connection string.`,
    );
  }
  return url;
}

function parseConnectionHostAndPort(connectionString: string) {
  const match = connectionString.match(/^[a-z]+:\/\/.*@([^/:?#]+)(?::(\d+))?/i);
  if (!match) {
    throw new Error("Could not parse host and port from LOCAL_SYNC_SOURCE_DATABASE_URL.");
  }

  return {
    host: match[1],
    port: Number(match[2] || "5432"),
  };
}

function requiresTunnel(sourceHost: string) {
  return (
    (sourceHost === "127.0.0.1" || sourceHost === "localhost") &&
    Boolean(process.env.LOCAL_SYNC_SOURCE_SSH_HOST?.trim())
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function canConnectToPort(port: number, host: string) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ port, host });
    const finish = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

async function waitForPort(host: string, port: number, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await canConnectToPort(port, host)) return;
    await delay(250);
  }
  throw new Error(`Timed out waiting for SSH tunnel on ${host}:${port}.`);
}

async function ensureSourceTunnel(sourceHost: string, sourcePort: number) {
  if (!requiresTunnel(sourceHost)) return null;

  const host = sourceHost;
  const port = sourcePort;
  const sshHost = process.env.LOCAL_SYNC_SOURCE_SSH_HOST!.trim();

  if (await canConnectToPort(port, host)) {
    return null;
  }

  const tunnelProcess = spawn(
    "ssh",
    [
      "-o",
      "ExitOnForwardFailure=yes",
      "-o",
      "ServerAliveInterval=60",
      "-N",
      "-L",
      `${port}:127.0.0.1:${SOURCE_REMOTE_PORT}`,
      sshHost,
    ],
    {
      stdio: "ignore",
    },
  );

  const prematureExit = new Promise<never>((_, reject) => {
    tunnelProcess.once("exit", (code, signal) => {
      reject(
        new Error(
          `SSH tunnel exited before becoming ready (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
        ),
      );
    });
  });

  await Promise.race([waitForPort(host, port, 10_000), prematureExit]);
  return tunnelProcess;
}

async function withClient<T>(connectionString: string, handler: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await handler(client);
  } finally {
    await client.end();
  }
}

async function getMetadata(sourceClient: Client) {
  const columnRows = await sourceClient.query<{
    table_name: string;
    column_name: string;
    ordinal_position: number;
    data_type: string;
  }>(`
    SELECT table_name, column_name, ordinal_position, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  const pkRows = await sourceClient.query<{
    table_name: string;
    pk_cols: unknown;
  }>(`
    SELECT
      tc.table_name,
      array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS pk_cols
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
     AND tc.table_name = kcu.table_name
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'PRIMARY KEY'
    GROUP BY tc.table_name
    ORDER BY tc.table_name
  `);
  const fkRows = await sourceClient.query<{
    child_table: string;
    child_cols: unknown;
    parent_table: string;
    parent_cols: unknown;
    constraint_name: string;
  }>(`
    SELECT
      tc.table_name AS child_table,
      array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS child_cols,
      ccu.table_name AS parent_table,
      array_agg(ccu.column_name ORDER BY kcu.ordinal_position) AS parent_cols,
      tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'FOREIGN KEY'
    GROUP BY tc.table_name, ccu.table_name, tc.constraint_name
    ORDER BY tc.table_name, tc.constraint_name
  `);

  const columnsByTable = new Map<string, string[]>();
  const columnTypesByTable = new Map<string, Record<string, string>>();
  for (const row of columnRows.rows) {
    const existing = columnsByTable.get(row.table_name) ?? [];
    existing.push(row.column_name);
    columnsByTable.set(row.table_name, existing);

    const typeMap = columnTypesByTable.get(row.table_name) ?? {};
    typeMap[row.column_name] = row.data_type;
    columnTypesByTable.set(row.table_name, typeMap);
  }

  const businessRootColumnsByTable = new Map<string, Set<string>>();
  for (const [tableName, columns] of columnsByTable.entries()) {
    const set = new Set<string>();
    for (const columnName of columns) {
      if (BUSINESS_ROOT_COLUMNS.has(columnName)) {
        set.add(columnName);
      }
    }
    businessRootColumnsByTable.set(tableName, set);
  }

  for (const row of fkRows.rows) {
    if (row.parent_table !== "businesses") continue;
    const existing = businessRootColumnsByTable.get(row.child_table) ?? new Set<string>();
    for (const columnName of parsePostgresTextArray(row.child_cols)) {
      existing.add(columnName);
    }
    businessRootColumnsByTable.set(row.child_table, existing);
  }

  const tables = pkRows.rows.map<TableMeta>((row, index) => ({
    name: row.table_name,
    columns: columnsByTable.get(row.table_name) ?? [],
    columnDataTypes: columnTypesByTable.get(row.table_name) ?? {},
    pkCols: parsePostgresTextArray(row.pk_cols),
    businessRootColumns: [...(businessRootColumnsByTable.get(row.table_name) ?? new Set<string>())],
    tempTableName: `tmp_sync_${index + 1}`,
  }));

  return {
    tables,
    foreignKeys: fkRows.rows.map<ForeignKeyMeta>((row) => ({
      childTable: row.child_table,
      childCols: parsePostgresTextArray(row.child_cols),
      parentTable: row.parent_table,
      parentCols: parsePostgresTextArray(row.parent_cols),
      constraintName: row.constraint_name,
    })),
  };
}

async function resolveBusinesses(sourceClient: Client, requestedNames: string[]) {
  const businesses = await sourceClient.query<BusinessRecord>(
    `SELECT id::text AS id, name FROM ${qualifiedTable("businesses")} ORDER BY name`,
  );

  const byNormalizedName = new Map<string, BusinessRecord>();
  for (const business of businesses.rows) {
    byNormalizedName.set(normalizeBusinessName(business.name), business);
  }

  const selected: BusinessRecord[] = [];
  const missing: string[] = [];
  for (const requestedName of requestedNames) {
    const business = byNormalizedName.get(normalizeBusinessName(requestedName));
    if (!business) {
      missing.push(requestedName);
      continue;
    }
    selected.push(business);
  }

  if (missing.length > 0) {
    throw new Error(
      `Unknown business name(s): ${missing.join(", ")}. Available names: ${businesses.rows
        .map((business) => business.name)
        .join(", ")}`,
    );
  }

  return selected;
}

async function createTempSelectionTables(sourceClient: Client, tables: TableMeta[]) {
  for (const table of tables) {
    const pkSelect = table.pkCols.map((columnName) => quotedIdent(columnName)).join(", ");
    await sourceClient.query(
      `CREATE TEMP TABLE ${quotedIdent(table.tempTableName)} AS
       SELECT ${pkSelect}
       FROM ${qualifiedTable(table.name)}
       WHERE FALSE`,
    );
    await sourceClient.query(
      `ALTER TABLE ${quotedIdent(table.tempTableName)}
       ADD PRIMARY KEY (${pkSelect})`,
    );
  }
}

async function seedBusinessScopedTables(
  sourceClient: Client,
  tables: TableMeta[],
  selectedBusinessIds: string[],
) {
  for (const table of tables) {
    if (table.name === "businesses") {
      await sourceClient.query(
        `INSERT INTO ${quotedIdent(table.tempTableName)} (${table.pkCols.map(quotedIdent).join(", ")})
         SELECT ${table.pkCols.map(quotedIdent).join(", ")}
         FROM ${qualifiedTable(table.name)}
         WHERE id::text = ANY($1::text[])
         ON CONFLICT DO NOTHING`,
        [selectedBusinessIds],
      );
      continue;
    }

    if (table.businessRootColumns.length === 0) continue;

    const whereClause = table.businessRootColumns
      .map((columnName) => `${quotedIdent(columnName)}::text = ANY($1::text[])`)
      .join(" OR ");

    await sourceClient.query(
      `INSERT INTO ${quotedIdent(table.tempTableName)} (${table.pkCols.map(quotedIdent).join(", ")})
       SELECT ${table.pkCols.map(quotedIdent).join(", ")}
       FROM ${qualifiedTable(table.name)}
       WHERE ${whereClause}
       ON CONFLICT DO NOTHING`,
      [selectedBusinessIds],
    );
  }
}

async function seedManualShareTables(sourceClient: Client, tableByName: Map<string, TableMeta>) {
  const customReportShares = tableByName.get("custom_report_share_snapshots");
  const customReports = tableByName.get("custom_reports");

  if (customReportShares && customReports) {
    await sourceClient.query(
      `INSERT INTO ${quotedIdent(customReportShares.tempTableName)} (${customReportShares.pkCols
        .map(quotedIdent)
        .join(", ")})
       SELECT share.id
       FROM ${qualifiedTable("custom_report_share_snapshots")} share
       JOIN ${quotedIdent(customReports.tempTableName)} report_keys
         ON share.report_id::text = report_keys.id::text
       ON CONFLICT DO NOTHING`,
    );
  }
}

async function propagateParents(
  sourceClient: Client,
  tableByName: Map<string, TableMeta>,
  foreignKeys: ForeignKeyMeta[],
) {
  let totalInserted = 0;

  for (const foreignKey of foreignKeys) {
    const childTable = tableByName.get(foreignKey.childTable);
    const parentTable = tableByName.get(foreignKey.parentTable);
    if (!childTable || !parentTable) continue;

    const result = await sourceClient.query(
      `INSERT INTO ${quotedIdent(parentTable.tempTableName)} (${parentTable.pkCols
        .map(quotedIdent)
        .join(", ")})
       SELECT DISTINCT ${buildPkProjection("parent_row", parentTable.pkCols)}
       FROM ${qualifiedTable(childTable.name)} child_row
       JOIN ${quotedIdent(childTable.tempTableName)} child_keys
         ON ${buildJoinCondition("child_row", childTable.pkCols, "child_keys", childTable.pkCols)}
       JOIN ${qualifiedTable(parentTable.name)} parent_row
         ON ${buildJoinCondition("child_row", foreignKey.childCols, "parent_row", foreignKey.parentCols)}
       ON CONFLICT DO NOTHING`,
    );

    totalInserted += result.rowCount ?? 0;
  }

  return totalInserted;
}

async function getIncludedRowCounts(sourceClient: Client, tables: TableMeta[]) {
  const counts = new Map<string, number>();
  for (const table of tables) {
    const result = await sourceClient.query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count FROM ${quotedIdent(table.tempTableName)}`,
    );
    counts.set(table.name, Number(result.rows[0]?.count ?? "0"));
  }
  return counts;
}

async function truncateTarget(targetClient: Client, tables: TableMeta[]) {
  await targetClient.query("BEGIN");
  try {
    await targetClient.query("SET LOCAL session_replication_role = replica");
    await targetClient.query(
      `TRUNCATE TABLE ${tables.map((table) => qualifiedTable(table.name)).join(", ")} RESTART IDENTITY CASCADE`,
    );
    await targetClient.query("COMMIT");
  } catch (error) {
    await targetClient.query("ROLLBACK");
    throw error;
  }
}

async function insertRows(
  targetClient: Client,
  table: TableMeta,
  rows: Record<string, unknown>[],
) {
  if (rows.length === 0) return;

  const quotedColumns = table.columns.map(quotedIdent);

  for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
    const batch = rows.slice(start, start + INSERT_BATCH_SIZE);
    const params: unknown[] = [];
    const valuesSql = batch
      .map((row) => {
        const placeholders = table.columns.map((columnName) => {
          const rawValue = row[columnName] ?? null;
          const dataType = table.columnDataTypes[columnName];
          const normalizedValue =
            rawValue != null &&
            (dataType === "json" || dataType === "jsonb") &&
            typeof rawValue === "object"
              ? JSON.stringify(rawValue)
              : rawValue;
          params.push(normalizedValue);
          return `$${params.length}`;
        });
        return `(${placeholders.join(", ")})`;
      })
      .join(", ");

    await targetClient.query(
      `INSERT INTO ${qualifiedTable(table.name)} (${quotedColumns.join(", ")})
       VALUES ${valuesSql}
       ON CONFLICT DO NOTHING`,
      params,
    );
  }
}

async function copyIncludedRows(
  sourceClient: Client,
  targetClient: Client,
  tables: TableMeta[],
  includedCounts: Map<string, number>,
) {
  await targetClient.query("BEGIN");
  try {
    await targetClient.query("SET LOCAL session_replication_role = replica");

    for (const table of tables) {
      const rowCount = includedCounts.get(table.name) ?? 0;
      if (rowCount === 0) continue;

      const sourceRows = await sourceClient.query<Record<string, unknown>>(
        `SELECT source_row.*
         FROM ${qualifiedTable(table.name)} source_row
         JOIN ${quotedIdent(table.tempTableName)} included_keys
           ON ${buildJoinCondition("source_row", table.pkCols, "included_keys", table.pkCols)}
         ORDER BY ${table.pkCols.map((columnName) => `source_row.${quotedIdent(columnName)}`).join(", ")}`,
      );

      try {
        await insertRows(targetClient, table, sourceRows.rows);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed while copying ${table.name}: ${message}`);
      }
      console.log(`[local-sync] copied ${table.name}: ${sourceRows.rows.length} row(s)`);
    }

    await targetClient.query("COMMIT");
  } catch (error) {
    await targetClient.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const requestedBusinessNames = parseCliBusinessNames();
  const sourceDatabaseUrl = ensureDatabaseUrl(
    process.env.LOCAL_SYNC_SOURCE_DATABASE_URL,
    "LOCAL_SYNC_SOURCE_DATABASE_URL",
  );
  const targetDatabaseUrl = ensureDatabaseUrl(
    process.env.LOCAL_SYNC_TARGET_DATABASE_URL || process.env.DATABASE_URL,
    "LOCAL_SYNC_TARGET_DATABASE_URL or DATABASE_URL",
  );

  const sourceConnectionTarget = parseConnectionHostAndPort(sourceDatabaseUrl);
  const tunnelProcess = await ensureSourceTunnel(
    sourceConnectionTarget.host,
    sourceConnectionTarget.port,
  );

  try {
    await withClient(sourceDatabaseUrl, async (sourceClient) => {
      await withClient(targetDatabaseUrl, async (targetClient) => {
        const { tables, foreignKeys } = await getMetadata(sourceClient);
        const tableByName = new Map(tables.map((table) => [table.name, table]));
        const selectedBusinesses = await resolveBusinesses(sourceClient, requestedBusinessNames);
        const selectedBusinessIds = selectedBusinesses.map((business) => business.id);

        console.log(
          `[local-sync] selected businesses: ${selectedBusinesses
            .map((business) => business.name)
            .join(", ")}`,
        );

        await createTempSelectionTables(sourceClient, tables);
        await seedBusinessScopedTables(sourceClient, tables, selectedBusinessIds);

        let iteration = 0;
        while (true) {
          iteration += 1;
          const insertedParentRows = await propagateParents(sourceClient, tableByName, foreignKeys);
          await seedManualShareTables(sourceClient, tableByName);
          if (insertedParentRows === 0) break;
          console.log(`[local-sync] fk parent closure iteration ${iteration}: +${insertedParentRows}`);
        }

        const includedCounts = await getIncludedRowCounts(sourceClient, tables);
        const populatedTables = [...includedCounts.entries()]
          .filter(([, count]) => count > 0)
          .sort((left, right) => right[1] - left[1]);

        console.log(
          `[local-sync] tables selected: ${populatedTables.length}, rows: ${populatedTables.reduce(
            (total, [, count]) => total + count,
            0,
          )}`,
        );

        await truncateTarget(targetClient, tables);
        await copyIncludedRows(sourceClient, targetClient, tables, includedCounts);
      });
    });
  } finally {
    if (tunnelProcess) {
      tunnelProcess.kill("SIGTERM");
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
