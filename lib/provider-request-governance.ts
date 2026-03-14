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

function shouldEnterCooldown(error: unknown) {
  const status = getErrorStatus(error);
  const message = getErrorMessage(error).toUpperCase();
  if (status === 401 || status === 403 || status === 429) return true;
  return (
    message.includes("QUOTA") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("RATE LIMIT") ||
    message.includes("TOO MANY REQUESTS") ||
    message.includes("PERMISSION") ||
    message.includes("SCOPE") ||
    message.includes("TOKEN") ||
    message.includes("UNAUTHENTICATED") ||
    message.includes("AUTHENTICATION") ||
    message.includes("DEVELOPER_TOKEN") ||
    message.includes("DISCONNECTED") ||
    message.includes("NOT CONNECTED")
  );
}

export async function runProviderRequestWithGovernance<T>(
  input: GovernedProviderRequestInput<T>,
): Promise<T> {
  const key = getRequestKey(input.provider, input.businessId, input.requestType);
  const cooldownMs = input.cooldownMs ?? DEFAULT_REQUEST_COOLDOWN_MS;
  const failures = getFailureStore();
  const inflight = getInFlightStore();
  const existingFailure = failures.get(key);

  if (existingFailure && !input.bypassCooldown) {
    const retryAfterMs = existingFailure.failedAt + cooldownMs - Date.now();
    if (retryAfterMs > 0) {
      console.warn("[provider-request] cooldown_hit", {
        provider: input.provider,
        businessId: input.businessId,
        requestType: input.requestType,
        retryAfterMs,
        failureCount: existingFailure.count,
        status: existingFailure.status ?? null,
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
      console.log("[provider-request] success", {
        provider: input.provider,
        businessId: input.businessId,
        requestType: input.requestType,
      });
      return result;
    })
    .catch((error: unknown) => {
      if (shouldEnterCooldown(error)) {
        const previousCount = failures.get(key)?.count ?? 0;
        failures.set(key, {
          failedAt: Date.now(),
          message: getErrorMessage(error),
          count: previousCount + 1,
          status: getErrorStatus(error),
        });
      }
      console.error("[provider-request] failure", {
        provider: input.provider,
        businessId: input.businessId,
        requestType: input.requestType,
        status: getErrorStatus(error) ?? null,
        enteredCooldown: shouldEnterCooldown(error),
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
