import { neon } from "@neondatabase/serverless";
import { logStartupEvent } from "@/lib/startup-diagnostics";

const DEFAULT_DB_TIMEOUT_MS = 8_000;

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
      withTimeout(client(strings, ...values), timeoutMs, "Database query")) as ReturnType<typeof neon>,
    {
      query: ((...args: Parameters<typeof client.query>) =>
        withTimeout(client.query(...args), timeoutMs, "Database query")) as typeof client.query,
    }
  );

  globalStore.__omniadsDb = client;
  globalStore.__omniadsDbWrapped = wrapped;
  logStartupEvent("db_client_initialized", { timeoutMs });
  return wrapped;
}
