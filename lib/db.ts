import { Pool } from "pg";
import { logStartupEvent } from "@/lib/startup-diagnostics";

const DEFAULT_DB_TIMEOUT_MS = 8_000;
const DEFAULT_WORKER_DB_TIMEOUT_MS = 30_000;
const DEFAULT_DB_RETRY_ATTEMPTS = 4;
const DB_RETRY_DELAY_MS = 400;
const DEFAULT_DB_POOL_MAX = 10;
const DEFAULT_WORKER_DB_POOL_MAX = 20;

type DbRow = Record<string, any>;

export type DbClient = (<TRow extends DbRow = DbRow>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<TRow[]>) & {
  query: <TRow extends DbRow = DbRow>(
    queryText: string,
    params?: unknown[],
  ) => Promise<TRow[]>;
};

export function resolveDbTimeoutMs(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.DB_QUERY_TIMEOUT_MS?.trim();
  const workerMode = env.SYNC_WORKER_MODE?.trim().toLowerCase();
  const fallback =
    workerMode === "1" || workerMode === "true"
      ? DEFAULT_WORKER_DB_TIMEOUT_MS
      : DEFAULT_DB_TIMEOUT_MS;
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveDbPoolMax(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.DB_POOL_MAX?.trim();
  const workerMode = env.SYNC_WORKER_MODE?.trim().toLowerCase();
  const fallback =
    workerMode === "1" || workerMode === "true"
      ? DEFAULT_WORKER_DB_POOL_MAX
      : DEFAULT_DB_POOL_MAX;
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getDbTimeoutMs() {
  return resolveDbTimeoutMs(process.env);
}

function getDbPoolMax() {
  return resolveDbPoolMax(process.env);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${operation} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
      promise.finally(() => clearTimeout(timer)).catch(() => clearTimeout(timer));
    }),
  ]);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableDbError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  return (
    code === "XX000" ||
    code === "08001" ||
    code === "08006" ||
    code === "57P01" ||
    code === "57P02" ||
    code === "57P03" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    message.includes("Too many connections attempts") ||
    message.includes("server_login_retry") ||
    message.includes("partial pkt in login phase") ||
    message.includes("server login has been failing") ||
    message.includes("connection closed") ||
    message.includes("server conn crashed") ||
    message.includes("terminating connection") ||
    message.includes("Connection terminated unexpectedly")
  );
}

async function withDbRetries<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= DEFAULT_DB_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= DEFAULT_DB_RETRY_ATTEMPTS || !isRetryableDbError(error)) {
        throw error;
      }
      await sleep(DB_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Make sure your PostgreSQL connection string is configured.",
    );
  }
  return url;
}

function normalizeQueryValue(value: unknown) {
  return value === undefined ? null : value;
}

export function buildParameterizedQuery(strings: TemplateStringsArray, values: unknown[]) {
  let text = strings[0] ?? "";
  const params: unknown[] = [];

  for (let index = 0; index < values.length; index += 1) {
    params.push(normalizeQueryValue(values[index]));
    text += `$${index + 1}${strings[index + 1] ?? ""}`;
  }

  return {
    text,
    values: params,
  };
}

function createPool(poolMax: number) {
  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });

  pool.on("error", (error) => {
    logStartupEvent("db_pool_error", {
      code: "code" in error ? String(error.code ?? "") : "",
      message: error.message,
    });
  });

  return pool;
}

function createWrappedDb(pool: Pool, timeoutMs: number): DbClient {
  const executeQuery = async <TRow extends DbRow = DbRow>(
    queryText: string,
    params: unknown[] = [],
  ) =>
    withDbRetries(async () => {
      const result = await withTimeout(
        pool.query<TRow>(queryText, params.map(normalizeQueryValue)),
        timeoutMs,
        "Database query",
      );
      return result.rows as TRow[];
    });

  const wrapped = Object.assign(
    (<TRow extends DbRow = DbRow>(
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => {
      const query = buildParameterizedQuery(strings, values);
      return executeQuery<TRow>(query.text, query.values);
    }) as DbClient,
    {
      query: executeQuery,
    },
  );

  return wrapped;
}

/**
 * Returns a PostgreSQL SQL-tagged-template query function.
 * Uses DATABASE_URL by default.
 *
 * Usage:
 *   const sql = getDb();
 *   const rows = await sql`SELECT 1 AS ok`;
 */
export function getDb() {
  const globalStore = globalThis as typeof globalThis & {
    __omniadsDbPool?: Pool;
    __omniadsDbWrapped?: DbClient;
  };
  if (globalStore.__omniadsDbWrapped) {
    return globalStore.__omniadsDbWrapped;
  }

  const timeoutMs = getDbTimeoutMs();
  const poolMax = getDbPoolMax();
  const pool = globalStore.__omniadsDbPool ?? createPool(poolMax);
  const wrapped = createWrappedDb(pool, timeoutMs);

  globalStore.__omniadsDbPool = pool;
  globalStore.__omniadsDbWrapped = wrapped;
  logStartupEvent("db_client_initialized", { timeoutMs, poolMax });
  return wrapped;
}

export function getDbWithTimeout(timeoutMs: number) {
  const globalStore = globalThis as typeof globalThis & {
    __omniadsDbPool?: Pool;
    __omniadsDbWrappedByTimeout?: Map<number, DbClient>;
  };
  if (!globalStore.__omniadsDbPool) {
    globalStore.__omniadsDbPool = createPool(getDbPoolMax());
  }
  if (!globalStore.__omniadsDbWrappedByTimeout) {
    globalStore.__omniadsDbWrappedByTimeout = new Map();
  }
  const existing = globalStore.__omniadsDbWrappedByTimeout.get(timeoutMs);
  if (existing) return existing;

  const wrapped = createWrappedDb(globalStore.__omniadsDbPool, timeoutMs);
  globalStore.__omniadsDbWrappedByTimeout.set(timeoutMs, wrapped);
  logStartupEvent("db_client_initialized", { timeoutMs, poolMax: getDbPoolMax() });
  return wrapped;
}

export function resetDbClientCache() {
  const globalStore = globalThis as typeof globalThis & {
    __omniadsDbPool?: Pool;
    __omniadsDbWrapped?: DbClient;
    __omniadsDbWrappedByTimeout?: Map<number, DbClient>;
  };

  void globalStore.__omniadsDbPool?.end().catch(() => undefined);
  delete globalStore.__omniadsDbPool;
  delete globalStore.__omniadsDbWrapped;
  globalStore.__omniadsDbWrappedByTimeout?.clear();
  delete globalStore.__omniadsDbWrappedByTimeout;
}
