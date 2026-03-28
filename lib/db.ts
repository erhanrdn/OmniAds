import { neon } from "@neondatabase/serverless";
import { logStartupEvent } from "@/lib/startup-diagnostics";

const DEFAULT_DB_TIMEOUT_MS = 8_000;
const DEFAULT_DB_RETRY_ATTEMPTS = 4;
const DB_RETRY_DELAY_MS = 400;

function getDbTimeoutMs() {
  const raw = process.env.DB_QUERY_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_DB_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DB_TIMEOUT_MS;
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
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return (
    code === "XX000" ||
    code === "08001" ||
    code === "08006" ||
    message.includes("Too many connections attempts") ||
    message.includes("server_login_retry") ||
    message.includes("partial pkt in login phase") ||
    message.includes("server login has been failing") ||
    message.includes("connection closed") ||
    message.includes("server conn crashed")
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

/**
 * Returns a Neon SQL-tagged-template query function.
 * Uses DATABASE_URL by default (pooled connection).
 *
 * Usage:
 *   const sql = getDb();
 *   const rows = await sql`SELECT 1 AS ok`;
 */
export function getDb() {
  const globalStore = globalThis as typeof globalThis & {
    __omniadsDb?: ReturnType<typeof neon>;
    __omniadsDbWrapped?: ReturnType<typeof neon>;
  };
  if (globalStore.__omniadsDbWrapped) {
    return globalStore.__omniadsDbWrapped;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Make sure your Neon database env vars are in .env.local",
    );
  }
  const client = neon(url) as ReturnType<typeof neon>;
  const timeoutMs = getDbTimeoutMs();
  const wrapped = Object.assign(
    ((strings: TemplateStringsArray, ...values: unknown[]) =>
      withDbRetries(() =>
        withTimeout(client(strings, ...values), timeoutMs, "Database query")
      )) as ReturnType<typeof neon>,
    {
      query: ((...args: Parameters<typeof client.query>) =>
        withDbRetries(() =>
          withTimeout(client.query(...args), timeoutMs, "Database query")
        )) as typeof client.query,
    }
  );

  globalStore.__omniadsDb = client;
  globalStore.__omniadsDbWrapped = wrapped;
  logStartupEvent("db_client_initialized", { timeoutMs });
  return wrapped;
}
