import { getDb } from "@/lib/db";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import type { GoogleRequestAuditSource } from "@/lib/google-request-audit";
import { logRuntimeDebug } from "@/lib/runtime-logging";

interface GovernedProviderRequestInput<T> {
  provider: string;
  businessId: string;
  requestType: string;
  execute: () => Promise<T>;
  cooldownMs?: number;
  bypassCooldown?: boolean;
  requestSource?: GoogleRequestAuditSource;
  requestPath?: string | null;
  tripGlobalBreakerFor?: Array<"quota" | "auth" | "permission" | "generic">;
}

interface FailureState {
  failedAt: number;
  message: string;
  count: number;
  status?: number;
}

export interface ProviderQuotaBudgetState {
  provider: string;
  businessId: string;
  quotaDate: string;
  callCount: number;
  errorCount: number;
  dailyBudget: number;
  maintenanceBudget: number;
  extendedBudget: number;
  pressure: number;
  withinDailyBudget: boolean;
  maintenanceAllowed: boolean;
  extendedAllowed: boolean;
}

// Hata tipine göre farklı cooldown süreleri
const COOLDOWN_QUOTA_MS = 5 * 60_000;       // 429 / RESOURCE_EXHAUSTED
const COOLDOWN_AUTH_MS = 10 * 60_000;        // 401 / UNAUTHENTICATED
const COOLDOWN_PERMISSION_MS = 30 * 60_000;  // 403 / PERMISSION_DENIED
const DEFAULT_REQUEST_COOLDOWN_MS = 2 * 60_000;
export const GLOBAL_CIRCUIT_BREAKER_REQUEST_TYPE = "__global_circuit_breaker__";
export const GLOBAL_CIRCUIT_BREAKER_RECOVERY_REQUEST_TYPE =
  "__global_circuit_breaker_recovery__";
const DAILY_QUOTA_BUDGET_REQUEST_TYPE = "__daily_quota_budget__";

function envNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const GOOGLE_DAILY_REQUEST_BUDGET_PER_BUSINESS = envNumber(
  "GOOGLE_ADS_DAILY_REQUEST_BUDGET_PER_BUSINESS",
  5000
);
const GOOGLE_MAINTENANCE_REQUEST_SHARE = Math.min(
  1,
  Math.max(
    0,
    envNumber("GOOGLE_ADS_MAINTENANCE_REQUEST_SHARE_PERCENT", 85) / 100
  )
);
const GOOGLE_EXTENDED_REQUEST_SHARE = Math.min(
  1,
  Math.max(
    0,
    envNumber("GOOGLE_ADS_EXTENDED_REQUEST_SHARE_PERCENT", 60) / 100
  )
);
const GOOGLE_REQUESTS_PER_SECOND = envNumber("GOOGLE_ADS_REQUESTS_PER_SECOND", 4);

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

interface ProviderRequestAuditDelta {
  provider: string;
  businessId: string;
  requestType: string;
  requestSource?: GoogleRequestAuditSource;
  requestPath?: string | null;
  requestCount?: number;
  errorCount?: number;
  cooldownHitCount?: number;
  dedupedCount?: number;
  failureClass?: "quota" | "auth" | "permission" | "generic" | null;
  errorMessage?: string | null;
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

function getPacingStore() {
  const globalStore = globalThis as typeof globalThis & {
    __omniadsProviderPacingState?: Map<string, number>;
  };
  if (!globalStore.__omniadsProviderPacingState) {
    globalStore.__omniadsProviderPacingState = new Map();
  }
  return globalStore.__omniadsProviderPacingState;
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

async function isProviderCooldownSchemaReady() {
  const readiness = await getDbSchemaReadiness({
    tables: ["provider_cooldown_state"],
  }).catch(() => null);
  return Boolean(readiness?.ready);
}

async function isProviderQuotaUsageSchemaReady() {
  const readiness = await getDbSchemaReadiness({
    tables: ["provider_quota_usage"],
  }).catch(() => null);
  return Boolean(readiness?.ready);
}

async function isProviderRequestAuditSchemaReady() {
  const readiness = await getDbSchemaReadiness({
    tables: ["provider_request_audit_daily"],
  }).catch(() => null);
  return Boolean(readiness?.ready);
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

function normalizeRequestAuditPath(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized.slice(0, 200) : "";
}

function logProviderRequestAudit(delta: ProviderRequestAuditDelta): void {
  isProviderRequestAuditSchemaReady().then((ready) => {
    if (!ready) {
      return;
    }
    const sql = getDb();
    const failureClass = delta.failureClass ?? null;
    return sql`
      INSERT INTO provider_request_audit_daily (
        business_id,
        provider,
        audit_date,
        request_type,
        audit_source,
        audit_path,
        request_count,
        error_count,
        quota_error_count,
        auth_error_count,
        permission_error_count,
        generic_error_count,
        cooldown_hit_count,
        deduped_count,
        last_error_at,
        last_error_message,
        updated_at
      ) VALUES (
        ${delta.businessId},
        ${delta.provider},
        CURRENT_DATE,
        ${delta.requestType},
        ${delta.requestSource ?? "unknown"},
        ${normalizeRequestAuditPath(delta.requestPath)},
        ${Math.max(0, delta.requestCount ?? 0)},
        ${Math.max(0, delta.errorCount ?? 0)},
        ${failureClass === "quota" ? Math.max(0, delta.errorCount ?? 0) : 0},
        ${failureClass === "auth" ? Math.max(0, delta.errorCount ?? 0) : 0},
        ${failureClass === "permission" ? Math.max(0, delta.errorCount ?? 0) : 0},
        ${failureClass === "generic" ? Math.max(0, delta.errorCount ?? 0) : 0},
        ${Math.max(0, delta.cooldownHitCount ?? 0)},
        ${Math.max(0, delta.dedupedCount ?? 0)},
        ${delta.errorCount ? new Date().toISOString() : null},
        ${delta.errorCount ? delta.errorMessage ?? null : null},
        now()
      )
      ON CONFLICT (business_id, provider, audit_date, request_type, audit_source, audit_path)
      DO UPDATE SET
        request_count = provider_request_audit_daily.request_count + EXCLUDED.request_count,
        error_count = provider_request_audit_daily.error_count + EXCLUDED.error_count,
        quota_error_count =
          provider_request_audit_daily.quota_error_count + EXCLUDED.quota_error_count,
        auth_error_count =
          provider_request_audit_daily.auth_error_count + EXCLUDED.auth_error_count,
        permission_error_count =
          provider_request_audit_daily.permission_error_count + EXCLUDED.permission_error_count,
        generic_error_count =
          provider_request_audit_daily.generic_error_count + EXCLUDED.generic_error_count,
        cooldown_hit_count =
          provider_request_audit_daily.cooldown_hit_count + EXCLUDED.cooldown_hit_count,
        deduped_count = provider_request_audit_daily.deduped_count + EXCLUDED.deduped_count,
        last_error_at =
          COALESCE(EXCLUDED.last_error_at, provider_request_audit_daily.last_error_at),
        last_error_message =
          COALESCE(EXCLUDED.last_error_message, provider_request_audit_daily.last_error_message),
        updated_at = now()
    `;
  }).catch(() => {});
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
    if (!(await isProviderCooldownSchemaReady())) {
      return;
    }
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
      logRuntimeDebug("provider-request", "hydrated_from_db", {
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
  isProviderCooldownSchemaReady().then((ready) => {
    if (!ready) {
      return;
    }
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
  isProviderCooldownSchemaReady().then((ready) => {
    if (!ready) {
      return;
    }
    const sql = getDb();
    return sql`
      DELETE FROM provider_cooldown_state
      WHERE business_id = ${businessId}
        AND provider = ${provider}
        AND request_type = ${requestType}
    `;
  }).catch(() => {});
}

async function upsertExplicitCooldownState(input: {
  provider: string;
  businessId: string;
  requestType: string;
  message: string;
  status?: number;
  failureCount?: number;
  cooldownUntil: string;
}) {
  if (!(await isProviderCooldownSchemaReady())) {
    return;
  }
  const sql = getDb();
  await sql`
    INSERT INTO provider_cooldown_state (
      business_id, provider, request_type,
      failed_at, failure_count, error_message, http_status, cooldown_until, updated_at
    ) VALUES (
      ${input.businessId}, ${input.provider}, ${input.requestType},
      now(), ${Math.max(1, input.failureCount ?? 1)}, ${input.message}, ${input.status ?? null},
      ${input.cooldownUntil}, now()
    )
    ON CONFLICT (business_id, provider, request_type) DO UPDATE SET
      failed_at = EXCLUDED.failed_at,
      failure_count = GREATEST(provider_cooldown_state.failure_count, EXCLUDED.failure_count),
      error_message = EXCLUDED.error_message,
      http_status = EXCLUDED.http_status,
      cooldown_until = EXCLUDED.cooldown_until,
      updated_at = now()
  `;
}

export async function getProviderGlobalCircuitBreaker(input: {
  provider: string;
  businessId: string;
}) {
  if (!(await isProviderCooldownSchemaReady())) {
    return null;
  }
  const sql = getDb();
  const rows = await sql`
    SELECT error_message, http_status, failure_count, failed_at, cooldown_until
    FROM provider_cooldown_state
    WHERE business_id = ${input.businessId}
      AND provider = ${input.provider}
      AND request_type = ${GLOBAL_CIRCUIT_BREAKER_REQUEST_TYPE}
      AND cooldown_until > now()
    LIMIT 1
  ` as Array<{
    error_message: string | null;
    http_status: number | null;
    failure_count: number;
    failed_at: string;
    cooldown_until: string;
  }>;

  const row = rows[0];
  if (!row) return null;
  return {
    message: row.error_message ?? "Provider circuit breaker is active.",
    status: row.http_status ?? undefined,
    failureCount: row.failure_count,
    failedAt: row.failed_at,
    cooldownUntil: row.cooldown_until,
    retryAfterMs: Math.max(0, new Date(row.cooldown_until).getTime() - Date.now()),
  };
}

export async function getProviderCircuitBreakerRecoveryState(input: {
  provider: string;
  businessId: string;
}): Promise<"open" | "half_open" | "closed"> {
  const cooldownSchemaReady = await isProviderCooldownSchemaReady();
  if (!cooldownSchemaReady) {
    return "closed";
  }
  const [breaker, recovery] = await Promise.all([
    getProviderGlobalCircuitBreaker(input).catch(() => null),
    (async () => {
      const sql = getDb();
      const rows = await sql`
        SELECT cooldown_until
        FROM provider_cooldown_state
        WHERE business_id = ${input.businessId}
          AND provider = ${input.provider}
          AND request_type = ${GLOBAL_CIRCUIT_BREAKER_RECOVERY_REQUEST_TYPE}
          AND cooldown_until > now()
        LIMIT 1
      ` as Array<{ cooldown_until: string }>;
      return rows[0] ?? null;
    })().catch(() => null),
  ]);

  if (breaker) return "open";
  if (recovery) return "half_open";
  return "closed";
}

export async function enterProviderGlobalCircuitBreakerRecoveryState(input: {
  provider: string;
  businessId: string;
  message?: string;
  cooldownMs?: number;
}) {
  const cooldownMs = Math.max(60_000, input.cooldownMs ?? 5 * 60_000);
  const cooldownUntil = new Date(Date.now() + cooldownMs).toISOString();
  return {
    state: "half_open" as const,
    cooldownUntil,
  };
}

export async function clearProviderGlobalCircuitBreakerRecoveryState(input: {
  provider: string;
  businessId: string;
}) {
  if (!(await isProviderCooldownSchemaReady())) {
    return;
  }
  const sql = getDb();
  await sql`
    DELETE FROM provider_cooldown_state
    WHERE business_id = ${input.businessId}
      AND provider = ${input.provider}
      AND request_type = ${GLOBAL_CIRCUIT_BREAKER_RECOVERY_REQUEST_TYPE}
  `;
}

export async function openProviderGlobalCircuitBreaker(input: {
  provider: string;
  businessId: string;
  message: string;
  status?: number;
  cooldownMs: number;
}) {
  await clearProviderGlobalCircuitBreakerRecoveryState({
    provider: input.provider,
    businessId: input.businessId,
  }).catch(() => null);
  const failureStore = getFailureStore();
  const key = getRequestKey(
    input.provider,
    input.businessId,
    GLOBAL_CIRCUIT_BREAKER_REQUEST_TYPE
  );
  const current = failureStore.get(key);
  const nextCount = (current?.count ?? 0) + 1;
  const failedAt = Date.now();
  const cooldownUntil = new Date(failedAt + input.cooldownMs).toISOString();

  failureStore.set(key, {
    failedAt,
    message: input.message,
    count: nextCount,
    status: input.status,
  });
  getDbHydratedStore().add(key);

  if (!(await isProviderCooldownSchemaReady())) {
    return {
      message: input.message,
      status: input.status,
      failureCount: nextCount,
      failedAt: new Date(failedAt).toISOString(),
      cooldownUntil,
    };
  }

  const sql = getDb();

  await sql`
    INSERT INTO provider_cooldown_state (
      business_id, provider, request_type,
      failed_at, failure_count, error_message, http_status, cooldown_until, updated_at
    ) VALUES (
      ${input.businessId}, ${input.provider}, ${GLOBAL_CIRCUIT_BREAKER_REQUEST_TYPE},
      ${new Date(failedAt).toISOString()}, ${nextCount}, ${input.message}, ${input.status ?? null},
      ${cooldownUntil}, now()
    )
    ON CONFLICT (business_id, provider, request_type) DO UPDATE SET
      failed_at = EXCLUDED.failed_at,
      failure_count = GREATEST(provider_cooldown_state.failure_count, EXCLUDED.failure_count),
      error_message = EXCLUDED.error_message,
      http_status = EXCLUDED.http_status,
      cooldown_until = EXCLUDED.cooldown_until,
      updated_at = now()
  `;

  return {
    message: input.message,
    status: input.status,
    failureCount: nextCount,
    failedAt: new Date(failedAt).toISOString(),
    cooldownUntil,
  };
}

export async function clearProviderGlobalCircuitBreaker(input: {
  provider: string;
  businessId: string;
}) {
  const key = getRequestKey(
    input.provider,
    input.businessId,
    GLOBAL_CIRCUIT_BREAKER_REQUEST_TYPE
  );
  getFailureStore().delete(key);
  getDbHydratedStore().add(key);
  if (!(await isProviderCooldownSchemaReady())) {
    return;
  }
  const sql = getDb();
  await sql`
    DELETE FROM provider_cooldown_state
    WHERE business_id = ${input.businessId}
      AND provider = ${input.provider}
      AND request_type = ${GLOBAL_CIRCUIT_BREAKER_REQUEST_TYPE}
  `;
}

export function buildProviderQuotaBudgetState(input: {
  provider: string;
  businessId: string;
  quotaDate: string;
  callCount: number;
  errorCount: number;
}) {
  const normalizedProvider = input.provider.toLowerCase();
  const dailyBudget =
    normalizedProvider === "google"
      ? GOOGLE_DAILY_REQUEST_BUDGET_PER_BUSINESS
      : GOOGLE_DAILY_REQUEST_BUDGET_PER_BUSINESS;
  const maintenanceBudget = Math.max(1, Math.floor(dailyBudget * GOOGLE_MAINTENANCE_REQUEST_SHARE));
  const extendedBudget = Math.max(1, Math.floor(dailyBudget * GOOGLE_EXTENDED_REQUEST_SHARE));
  const pressure = dailyBudget > 0 ? input.callCount / dailyBudget : 0;
  return {
    provider: input.provider,
    businessId: input.businessId,
    quotaDate: input.quotaDate,
    callCount: input.callCount,
    errorCount: input.errorCount,
    dailyBudget,
    maintenanceBudget,
    extendedBudget,
    pressure,
    withinDailyBudget: input.callCount < dailyBudget,
    maintenanceAllowed: input.callCount < maintenanceBudget,
    extendedAllowed: input.callCount < extendedBudget,
  } satisfies ProviderQuotaBudgetState;
}

export async function getProviderQuotaBudgetState(input: {
  provider: string;
  businessId: string;
}): Promise<ProviderQuotaBudgetState> {
  if (!(await isProviderQuotaUsageSchemaReady())) {
    return buildProviderQuotaBudgetState({
      provider: input.provider,
      businessId: input.businessId,
      quotaDate: new Date().toISOString().slice(0, 10),
      callCount: 0,
      errorCount: 0,
    });
  }
  const sql = getDb();
  const rows = await sql`
    SELECT quota_date, call_count, error_count
    FROM provider_quota_usage
    WHERE business_id = ${input.businessId}
      AND provider = ${input.provider}
      AND quota_date = CURRENT_DATE
    LIMIT 1
  ` as Array<{
    quota_date: string;
    call_count: number;
    error_count: number;
  }>;

  const row = rows[0];
  return buildProviderQuotaBudgetState({
    provider: input.provider,
    businessId: input.businessId,
    quotaDate: row?.quota_date ?? new Date().toISOString().slice(0, 10),
    callCount: row?.call_count ?? 0,
    errorCount: row?.error_count ?? 0,
  });
}

async function enforceProviderPacing(provider: string) {
  if (provider !== "google") return;
  const store = getPacingStore();
  const minIntervalMs = Math.max(50, Math.ceil(1000 / Math.max(1, GOOGLE_REQUESTS_PER_SECOND)));
  const nextAllowedAt = store.get(provider) ?? 0;
  const waitMs = nextAllowedAt - Date.now();
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  store.set(provider, Date.now() + minIntervalMs);
}

async function enforceProviderQuotaBudget(input: {
  provider: string;
  businessId: string;
}) {
  if (input.provider !== "google") return;
  const budgetState = await getProviderQuotaBudgetState(input).catch(() => null);
  if (!budgetState || budgetState.withinDailyBudget) return;

  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);
  const cooldownUntil = tomorrow.toISOString();

  throw new ProviderRequestCooldownError({
    provider: input.provider,
    businessId: input.businessId,
    requestType: DAILY_QUOTA_BUDGET_REQUEST_TYPE,
    message: `Daily Google Ads request budget reached for business ${input.businessId}.`,
    retryAfterMs: Math.max(0, new Date(cooldownUntil).getTime() - Date.now()),
    status: 429,
  });
}

// Quota kullanımını logla (fire-and-forget)
function logQuotaUsage(
  provider: string,
  businessId: string,
  isError: boolean,
): void {
  isProviderQuotaUsageSchemaReady().then((ready) => {
    if (!ready) {
      return;
    }
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
  if (input.requestType !== GLOBAL_CIRCUIT_BREAKER_REQUEST_TYPE) {
    await hydrateFromDbIfNeeded(
      input.provider,
      input.businessId,
      GLOBAL_CIRCUIT_BREAKER_REQUEST_TYPE
    );
  }
  await hydrateFromDbIfNeeded(input.provider, input.businessId, input.requestType);

  if (input.requestType !== GLOBAL_CIRCUIT_BREAKER_REQUEST_TYPE) {
    const globalKey = getRequestKey(
      input.provider,
      input.businessId,
      GLOBAL_CIRCUIT_BREAKER_REQUEST_TYPE
    );
    const globalFailure = failures.get(globalKey);
    if (globalFailure && !input.bypassCooldown) {
      const retryAfterMs =
        globalFailure.failedAt + DEFAULT_REQUEST_COOLDOWN_MS - Date.now();
      const globalBreaker = await getProviderGlobalCircuitBreaker({
        provider: input.provider,
        businessId: input.businessId,
      }).catch(() => null);
      if (globalBreaker && globalBreaker.retryAfterMs > 0) {
        logProviderRequestAudit({
          provider: input.provider,
          businessId: input.businessId,
          requestType: input.requestType,
          requestSource: input.requestSource,
          requestPath: input.requestPath,
          cooldownHitCount: 1,
        });
        throw new ProviderRequestCooldownError({
          provider: input.provider,
          businessId: input.businessId,
          requestType: GLOBAL_CIRCUIT_BREAKER_REQUEST_TYPE,
          message: globalBreaker.message,
          retryAfterMs: globalBreaker.retryAfterMs,
          status: globalBreaker.status,
        });
      }
      if (retryAfterMs <= 0) {
        failures.delete(globalKey);
      }
    }
  }

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
      logProviderRequestAudit({
        provider: input.provider,
        businessId: input.businessId,
        requestType: input.requestType,
        requestSource: input.requestSource,
        requestPath: input.requestPath,
        cooldownHitCount: 1,
        failureClass: errorType,
        errorMessage: existingFailure.message,
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
  }

  const existingRequest = inflight.get(key) as Promise<T> | undefined;
  if (existingRequest) {
    logRuntimeDebug("provider-request", "deduped", {
      provider: input.provider,
      businessId: input.businessId,
      requestType: input.requestType,
    });
    logProviderRequestAudit({
      provider: input.provider,
      businessId: input.businessId,
      requestType: input.requestType,
      requestSource: input.requestSource,
      requestPath: input.requestPath,
      dedupedCount: 1,
    });
    return existingRequest;
  }

  logRuntimeDebug("provider-request", "start", {
    provider: input.provider,
    businessId: input.businessId,
    requestType: input.requestType,
    bypassCooldown: input.bypassCooldown === true,
  });

  await enforceProviderQuotaBudget({
    provider: input.provider,
    businessId: input.businessId,
  });
  await enforceProviderPacing(input.provider);

  const requestPromise = input
    .execute()
    .then((result) => {
      failures.delete(key);
      clearCooldownFromDb(input.provider, input.businessId, input.requestType);
      logRuntimeDebug("provider-request", "success", {
        provider: input.provider,
        businessId: input.businessId,
        requestType: input.requestType,
      });
      logProviderRequestAudit({
        provider: input.provider,
        businessId: input.businessId,
        requestType: input.requestType,
        requestSource: input.requestSource,
        requestPath: input.requestPath,
        requestCount: 1,
      });
      logQuotaUsage(input.provider, input.businessId, false);
      return result;
    })
    .catch((error: unknown) => {
      const errorType = classifyError(error);
      if (errorType !== null) {
        const previousCount = failures.get(key)?.count ?? 0;
        const newState: FailureState = {
          failedAt: Date.now(),
          message: getErrorMessage(error),
          count: previousCount + 1,
          status: getErrorStatus(error),
        };
        failures.set(key, newState);
        persistCooldownToDb(
          input.provider,
          input.businessId,
          input.requestType,
          newState,
          input.cooldownMs ?? getCooldownMsForErrorType(errorType),
        );
        if (input.tripGlobalBreakerFor?.includes(errorType)) {
          void openProviderGlobalCircuitBreaker({
            provider: input.provider,
            businessId: input.businessId,
            message: newState.message,
            status: newState.status,
            cooldownMs: input.cooldownMs ?? getCooldownMsForErrorType(errorType),
          }).catch(() => null);
        }
      }
      console.error("[provider-request] failure", {
        provider: input.provider,
        businessId: input.businessId,
        requestType: input.requestType,
        status: getErrorStatus(error) ?? null,
        errorType: errorType ?? "not_governed",
        message: getErrorMessage(error),
      });
      logProviderRequestAudit({
        provider: input.provider,
        businessId: input.businessId,
        requestType: input.requestType,
        requestSource: input.requestSource,
        requestPath: input.requestPath,
        requestCount: 1,
        errorCount: 1,
        failureClass: errorType ?? "generic",
        errorMessage: getErrorMessage(error),
      });
      logQuotaUsage(input.provider, input.businessId, true);
      throw error;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, requestPromise);
  return requestPromise;
}
