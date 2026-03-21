import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

interface GovernedProviderRequestInput<T> {
  provider: string;
  businessId: string;
  requestType: string;
  execute: () => Promise<T>;
  cooldownMs?: number;
  bypassCooldown?: boolean;
}

interface FailureState {
  failedAt: number;
  message: string;
  count: number;
  status?: number;
}

// Hata tipine göre farklı cooldown süreleri
const COOLDOWN_QUOTA_MS = 5 * 60_000;       // 429 / RESOURCE_EXHAUSTED
const COOLDOWN_AUTH_MS = 10 * 60_000;        // 401 / UNAUTHENTICATED
const COOLDOWN_PERMISSION_MS = 30 * 60_000;  // 403 / PERMISSION_DENIED
const DEFAULT_REQUEST_COOLDOWN_MS = 2 * 60_000;

export class ProviderRequestCooldownError extends Error {
  readonly provider: string;
  readonly businessId: string;
  readonly requestType: string;
  readonly retryAfterMs: number;
  readonly status?: number;

  constructor(input: {
    provider: string;
    businessId: string;
    requestType: string;
    message: string;
    retryAfterMs: number;
    status?: number;
  }) {
    super(input.message);
    this.name = "ProviderRequestCooldownError";
    this.provider = input.provider;
    this.businessId = input.businessId;
    this.requestType = input.requestType;
    this.retryAfterMs = input.retryAfterMs;
    this.status = input.status;
  }
}

function getInFlightStore() {
  const globalStore = globalThis as typeof globalThis & {
    __omniadsProviderRequestInFlight?: Map<string, Promise<unknown>>;
  };
  if (!globalStore.__omniadsProviderRequestInFlight) {
    globalStore.__omniadsProviderRequestInFlight = new Map();
  }
  return globalStore.__omniadsProviderRequestInFlight;
}

function getFailureStore() {
  const globalStore = globalThis as typeof globalThis & {
    __omniadsProviderRequestFailures?: Map<string, FailureState>;
  };
  if (!globalStore.__omniadsProviderRequestFailures) {
    globalStore.__omniadsProviderRequestFailures = new Map();
  }
  return globalStore.__omniadsProviderRequestFailures;
}

function getDbHydratedStore() {
  const globalStore = globalThis as typeof globalThis & {
    __omniadsProviderDbHydrated?: Set<string>;
  };
  if (!globalStore.__omniadsProviderDbHydrated) {
    globalStore.__omniadsProviderDbHydrated = new Set();
  }
  return globalStore.__omniadsProviderDbHydrated;
}

function getRequestKey(provider: string, businessId: string, requestType: string) {
  return `${provider}:${businessId}:${requestType}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

// Hata tipini ayrıştır: quota, auth, permission veya generic
function classifyError(error: unknown): "quota" | "auth" | "permission" | "generic" | null {
  const status = getErrorStatus(error);
  const message = getErrorMessage(error).toUpperCase();

  if (status === 429 || message.includes("QUOTA") || message.includes("RESOURCE_EXHAUSTED") || message.includes("RATE LIMIT") || message.includes("TOO MANY REQUESTS")) {
    return "quota";
  }
  if (status === 401 || message.includes("UNAUTHENTICATED") || message.includes("AUTHENTICATION") || message.includes("TOKEN") || message.includes("DEVELOPER_TOKEN")) {
    return "auth";
  }
  if (status === 403 || message.includes("PERMISSION") || message.includes("SCOPE")) {
    return "permission";
  }
  if (message.includes("DISCONNECTED") || message.includes("NOT CONNECTED")) {
    return "generic";
  }
  return null;
}

function getCooldownMsForErrorType(errorType: "quota" | "auth" | "permission" | "generic"): number {
  switch (errorType) {
    case "quota": return COOLDOWN_QUOTA_MS;
    case "auth": return COOLDOWN_AUTH_MS;
    case "permission": return COOLDOWN_PERMISSION_MS;
    default: return DEFAULT_REQUEST_COOLDOWN_MS;
  }
}

function shouldEnterCooldown(error: unknown): boolean {
  return classifyError(error) !== null;
}

// DB'den cooldown state'ini in-memory'ye yükle (lazy, per key)
async function hydrateFromDbIfNeeded(
  provider: string,
  businessId: string,
  requestType: string,
): Promise<void> {
  const key = getRequestKey(provider, businessId, requestType);
  const hydrated = getDbHydratedStore();
  if (hydrated.has(key)) return;
  hydrated.add(key);

  try {
    await runMigrations();
    const sql = getDb();
    const rows = await sql`
      SELECT error_message, http_status, failure_count, failed_at, cooldown_until
      FROM provider_cooldown_state
      WHERE business_id = ${businessId}
        AND provider = ${provider}
        AND request_type = ${requestType}
        AND cooldown_until > now()
      LIMIT 1
    ` as Array<{
      error_message: string | null;
      http_status: number | null;
      failure_count: number;
      failed_at: string;
      cooldown_until: string;
    }>;

    if (rows.length > 0) {
      const row = rows[0];
      const failures = getFailureStore();
      failures.set(key, {
        failedAt: new Date(row.failed_at).getTime(),
        message: row.error_message ?? "Provider request failed",
        count: row.failure_count,
        status: row.http_status ?? undefined,
      });
      console.log("[provider-request] hydrated_from_db", {
        provider, businessId, requestType,
        cooldownUntil: row.cooldown_until,
      });
    }
  } catch {
    // DB hydration hatası governance'ı engellememeli
  }
}

// Cooldown state'ini DB'ye yaz (fire-and-forget)
function persistCooldownToDb(
  provider: string,
  businessId: string,
  requestType: string,
  state: FailureState,
  cooldownMs: number,
): void {
  const cooldownUntil = new Date(state.failedAt + cooldownMs).toISOString();
  runMigrations().then(() => {
    const sql = getDb();
    return sql`
      INSERT INTO provider_cooldown_state (
        business_id, provider, request_type,
        failed_at, failure_count, error_message, http_status, cooldown_until, updated_at
      ) VALUES (
        ${businessId}, ${provider}, ${requestType},
        ${new Date(state.failedAt).toISOString()}, ${state.count},
        ${state.message}, ${state.status ?? null},
        ${cooldownUntil}, now()
      )
      ON CONFLICT (business_id, provider, request_type) DO UPDATE SET
        failed_at     = EXCLUDED.failed_at,
        failure_count = EXCLUDED.failure_count,
        error_message = EXCLUDED.error_message,
        http_status   = EXCLUDED.http_status,
        cooldown_until = EXCLUDED.cooldown_until,
        updated_at    = now()
    `;
  }).catch(() => {});
}

// Cooldown kaldırıldığında DB'den de sil
function clearCooldownFromDb(provider: string, businessId: string, requestType: string): void {
  runMigrations().then(() => {
    const sql = getDb();
    return sql`
      DELETE FROM provider_cooldown_state
      WHERE business_id = ${businessId}
        AND provider = ${provider}
        AND request_type = ${requestType}
    `;
  }).catch(() => {});
}

// Quota kullanımını logla (fire-and-forget)
function logQuotaUsage(
  provider: string,
  businessId: string,
  isError: boolean,
): void {
  runMigrations().then(() => {
    const sql = getDb();
    return sql`
      INSERT INTO provider_quota_usage (business_id, provider, quota_date, call_count, error_count, last_called_at)
      VALUES (${businessId}, ${provider}, CURRENT_DATE, 1, ${isError ? 1 : 0}, now())
      ON CONFLICT (business_id, provider, quota_date) DO UPDATE SET
        call_count     = provider_quota_usage.call_count + 1,
        error_count    = provider_quota_usage.error_count + ${isError ? 1 : 0},
        last_called_at = now()
    `;
  }).catch(() => {});
}

export async function runProviderRequestWithGovernance<T>(
  input: GovernedProviderRequestInput<T>,
): Promise<T> {
  const key = getRequestKey(input.provider, input.businessId, input.requestType);
  const failures = getFailureStore();
  const inflight = getInFlightStore();

  // In-memory store boşsa DB'den hydrate et
  await hydrateFromDbIfNeeded(input.provider, input.businessId, input.requestType);

  const existingFailure = failures.get(key);
  if (existingFailure && !input.bypassCooldown) {
    const errorType = classifyError({ status: existingFailure.status, message: existingFailure.message }) ?? "generic";
    const cooldownMs = getCooldownMsForErrorType(errorType);
    const retryAfterMs = existingFailure.failedAt + cooldownMs - Date.now();
    if (retryAfterMs > 0) {
      console.warn("[provider-request] cooldown_hit", {
        provider: input.provider,
        businessId: input.businessId,
        requestType: input.requestType,
        retryAfterMs,
        failureCount: existingFailure.count,
        status: existingFailure.status ?? null,
        errorType,
      });
      throw new ProviderRequestCooldownError({
        provider: input.provider,
        businessId: input.businessId,
        requestType: input.requestType,
        message: existingFailure.message,
        retryAfterMs,
        status: existingFailure.status,
      });
    }
    failures.delete(key);
    clearCooldownFromDb(input.provider, input.businessId, input.requestType);
  }

  const existingRequest = inflight.get(key) as Promise<T> | undefined;
  if (existingRequest) {
    console.log("[provider-request] deduped", {
      provider: input.provider,
      businessId: input.businessId,
      requestType: input.requestType,
    });
    return existingRequest;
  }

  console.log("[provider-request] start", {
    provider: input.provider,
    businessId: input.businessId,
    requestType: input.requestType,
    bypassCooldown: input.bypassCooldown === true,
  });

  const requestPromise = input
    .execute()
    .then((result) => {
      failures.delete(key);
      clearCooldownFromDb(input.provider, input.businessId, input.requestType);
      logQuotaUsage(input.provider, input.businessId, false);
      console.log("[provider-request] success", {
        provider: input.provider,
        businessId: input.businessId,
        requestType: input.requestType,
      });
      return result;
    })
    .catch((error: unknown) => {
      const errorType = classifyError(error);
      logQuotaUsage(input.provider, input.businessId, true);
      if (errorType !== null) {
        const previousCount = failures.get(key)?.count ?? 0;
        const cooldownMs = getCooldownMsForErrorType(errorType);
        const newState: FailureState = {
          failedAt: Date.now(),
          message: getErrorMessage(error),
          count: previousCount + 1,
          status: getErrorStatus(error),
        };
        failures.set(key, newState);
        persistCooldownToDb(input.provider, input.businessId, input.requestType, newState, cooldownMs);
      }
      console.error("[provider-request] failure", {
        provider: input.provider,
        businessId: input.businessId,
        requestType: input.requestType,
        status: getErrorStatus(error) ?? null,
        errorType: errorType ?? "not_governed",
        message: getErrorMessage(error),
      });
      throw error;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, requestPromise);
  return requestPromise;
}
