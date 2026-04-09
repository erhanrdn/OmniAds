import { getDb } from "@/lib/db";

const DEFAULT_SCHEMA_READINESS_TTL_MS = 15_000;

export interface DbSchemaReadinessResult {
  ready: boolean;
  missingTables: string[];
  checkedAt: string;
}

export class DbSchemaNotReadyError extends Error {
  readonly code = "DB_SCHEMA_NOT_READY";
  readonly missingTables: string[];
  readonly checkedAt: string;

  constructor(input: {
    context?: string;
    missingTables: string[];
    checkedAt: string;
  }) {
    const contextPrefix = input.context ? `${input.context}: ` : "";
    super(
      `${contextPrefix}database schema is not ready for request-time reads (${input.missingTables.join(", ")})`,
    );
    this.name = "DbSchemaNotReadyError";
    this.missingTables = input.missingTables;
    this.checkedAt = input.checkedAt;
  }
}

interface SchemaReadinessCacheEntry {
  expiresAt: number;
  promise: Promise<DbSchemaReadinessResult>;
}

function getSchemaReadinessCache() {
  const globalStore = globalThis as typeof globalThis & {
    __omniadsDbSchemaReadinessCache?: Map<string, SchemaReadinessCacheEntry>;
  };
  if (!globalStore.__omniadsDbSchemaReadinessCache) {
    globalStore.__omniadsDbSchemaReadinessCache = new Map();
  }
  return globalStore.__omniadsDbSchemaReadinessCache;
}

function normalizeTableName(tableName: string) {
  const trimmed = tableName.trim();
  if (!trimmed) return null;
  return trimmed.includes(".") ? trimmed : `public.${trimmed}`;
}

function normalizeTableList(tableNames: string[]) {
  return Array.from(
    new Set(
      tableNames
        .map((tableName) => normalizeTableName(tableName))
        .filter((tableName): tableName is string => Boolean(tableName)),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

function buildCacheKey(tableNames: string[]) {
  return tableNames.join("|");
}

function stripPublicPrefix(tableName: string) {
  return tableName.startsWith("public.") ? tableName.slice("public.".length) : tableName;
}

export async function getDbSchemaReadiness(input: {
  tables: string[];
  ttlMs?: number;
}): Promise<DbSchemaReadinessResult> {
  const normalizedTables = normalizeTableList(input.tables);
  const checkedAt = new Date().toISOString();

  if (normalizedTables.length === 0) {
    return {
      ready: true,
      missingTables: [],
      checkedAt,
    };
  }

  const ttlMs = Math.max(0, input.ttlMs ?? DEFAULT_SCHEMA_READINESS_TTL_MS);
  const cacheKey = buildCacheKey(normalizedTables);
  const cache = getSchemaReadinessCache();
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const readinessPromise = (async () => {
    const sql = getDb();
    const rows = (await sql.query(
      `
        WITH requested(table_name) AS (
          SELECT UNNEST($1::text[])
        )
        SELECT
          table_name,
          to_regclass(table_name) IS NOT NULL AS is_ready
        FROM requested
      `,
      [normalizedTables],
    )) as Array<{
      table_name: string;
      is_ready: boolean;
    }>;

    const missingTables = rows
      .filter((row) => !row.is_ready)
      .map((row) => stripPublicPrefix(row.table_name));

    return {
      ready: missingTables.length === 0,
      missingTables,
      checkedAt: new Date().toISOString(),
    };
  })();

  cache.set(cacheKey, {
    expiresAt: now + ttlMs,
    promise: readinessPromise,
  });

  try {
    return await readinessPromise;
  } catch (error) {
    cache.delete(cacheKey);
    throw error;
  }
}

export async function assertDbSchemaReady(input: {
  tables: string[];
  ttlMs?: number;
  context?: string;
}): Promise<DbSchemaReadinessResult> {
  const readiness = await getDbSchemaReadiness({
    tables: input.tables,
    ttlMs: input.ttlMs,
  });
  if (!readiness.ready) {
    throw new DbSchemaNotReadyError({
      context: input.context,
      missingTables: readiness.missingTables,
      checkedAt: readiness.checkedAt,
    });
  }
  return readiness;
}

export function isMissingRelationError(error: unknown, tableNames?: string[]) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  if (candidate.code === "42P01") {
    return true;
  }

  const message = candidate.message?.toLowerCase() ?? "";
  if (!message.includes("does not exist") || !message.includes("relation")) {
    return false;
  }
  if (!tableNames || tableNames.length === 0) {
    return true;
  }

  return tableNames.some((tableName) => {
    const normalized = stripPublicPrefix(normalizeTableName(tableName) ?? "");
    return normalized.length > 0 && message.includes(normalized.toLowerCase());
  });
}
