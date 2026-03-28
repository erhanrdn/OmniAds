import { createHash } from "crypto";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

export interface ProviderAccountSnapshotItem {
  id: string;
  name: string;
  currency?: string;
  timezone?: string;
  isManager?: boolean;
}

interface ProviderAccountSnapshotRow {
  business_id: string;
  provider: string;
  accounts_payload: ProviderAccountSnapshotItem[];
  fetched_at: string;
  refresh_failed: boolean;
  last_error: string | null;
  refresh_requested_at: string | null;
  last_refresh_attempt_at: string | null;
  next_refresh_after: string | null;
  refresh_in_progress: boolean;
  accounts_hash: string | null;
  source_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderAccountSnapshotMeta {
  source: "live" | "snapshot";
  fetchedAt: string | null;
  stale: boolean;
  refreshFailed: boolean;
  failureClass: ProviderSnapshotFailureClass;
  lastError: string | null;
  lastKnownGoodAvailable: boolean;
  refreshRequestedAt: string | null;
  lastRefreshAttemptAt: string | null;
  nextRefreshAfter: string | null;
  retryAfterAt: string | null;
  refreshInProgress: boolean;
  sourceReason: string | null;
}

export interface ProviderAccountSnapshotResult {
  accounts: ProviderAccountSnapshotItem[];
  meta: ProviderAccountSnapshotMeta;
}

interface ResolveProviderAccountSnapshotInput {
  businessId: string;
  provider: string;
  liveLoader: () => Promise<ProviderAccountSnapshotItem[]>;
  freshnessMs?: number;
  reason?: string;
  bypassCooldown?: boolean;
}

const DEFAULT_FRESHNESS_MS = 6 * 60 * 60_000;
const FIRST_FAILURE_COOLDOWN_MS = 30 * 60_000;
const SECOND_FAILURE_COOLDOWN_MS = 2 * 60 * 60_000;
const MAX_FAILURE_COOLDOWN_MS = 6 * 60 * 60_000;

export type ProviderSnapshotFailureClass =
  | "quota"
  | "auth"
  | "scope"
  | "permission"
  | "unknown"
  | null;

export class ProviderAccountSnapshotRefreshError extends Error {
  readonly provider: string;
  readonly businessId: string;
  readonly retryAfterMs: number;
  readonly dueToRecentFailure: boolean;

  constructor(input: {
    provider: string;
    businessId: string;
    message: string;
    retryAfterMs?: number;
    dueToRecentFailure?: boolean;
  }) {
    super(input.message);
    this.name = "ProviderAccountSnapshotRefreshError";
    this.provider = input.provider;
    this.businessId = input.businessId;
    this.retryAfterMs = input.retryAfterMs ?? 0;
    this.dueToRecentFailure = input.dueToRecentFailure ?? false;
  }
}

function getRefreshLocks() {
  const globalStore = globalThis as typeof globalThis & {
    __omniadsProviderAccountRefreshes?: Map<string, Promise<void>>;
  };
  if (!globalStore.__omniadsProviderAccountRefreshes) {
    globalStore.__omniadsProviderAccountRefreshes = new Map<string, Promise<void>>();
  }
  return globalStore.__omniadsProviderAccountRefreshes;
}

function getSnapshotKey(businessId: string, provider: string) {
  return `${businessId}:${provider}`;
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function isFresh(row: ProviderAccountSnapshotRow, freshnessMs: number) {
  const fetchedAtMs = new Date(row.fetched_at).getTime();
  return Number.isFinite(fetchedAtMs) && Date.now() - fetchedAtMs <= freshnessMs;
}

function computeAccountsHash(accounts: ProviderAccountSnapshotItem[]) {
  return createHash("sha1").update(JSON.stringify(accounts)).digest("hex");
}

function getRetryAfterMs(row: ProviderAccountSnapshotRow | null) {
  if (!row?.next_refresh_after) return 0;
  const retryAfterMs = new Date(row.next_refresh_after).getTime() - Date.now();
  return Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : 0;
}

export function classifyProviderSnapshotFailure(
  lastError: string | null | undefined
): ProviderSnapshotFailureClass {
  const normalized = (lastError ?? "").toLowerCase();
  if (!normalized) return null;
  if (
    normalized.includes("http 429") ||
    normalized.includes("quota") ||
    normalized.includes("resource_exhausted")
  ) {
    return "quota";
  }
  if (
    normalized.includes("missing the google ads scope") ||
    normalized.includes("scope")
  ) {
    return "scope";
  }
  if (
    normalized.includes("permission denied") ||
    normalized.includes("does not have permission") ||
    normalized.includes("denied access")
  ) {
    return "permission";
  }
  if (
    normalized.includes("oauth") ||
    normalized.includes("access token") ||
    normalized.includes("authentication_error") ||
    normalized.includes("token has expired") ||
    normalized.includes("401")
  ) {
    return "auth";
  }
  return "unknown";
}

function computeFailureCooldownMs(row: ProviderAccountSnapshotRow | null) {
  if (!row?.refresh_failed) return FIRST_FAILURE_COOLDOWN_MS;
  if (!row.last_refresh_attempt_at || !row.next_refresh_after) {
    return SECOND_FAILURE_COOLDOWN_MS;
  }

  const previousCooldownMs =
    new Date(row.next_refresh_after).getTime() -
    new Date(row.last_refresh_attempt_at).getTime();

  if (!Number.isFinite(previousCooldownMs) || previousCooldownMs <= FIRST_FAILURE_COOLDOWN_MS) {
    return SECOND_FAILURE_COOLDOWN_MS;
  }
  if (previousCooldownMs < SECOND_FAILURE_COOLDOWN_MS) {
    return SECOND_FAILURE_COOLDOWN_MS;
  }
  return MAX_FAILURE_COOLDOWN_MS;
}

async function getSnapshotRow(
  businessId: string,
  provider: string
): Promise<ProviderAccountSnapshotRow | null> {
  await runMigrations();
  const sql = getDb();
  const rows = (await sql`
    SELECT
      business_id,
      provider,
      accounts_payload,
      fetched_at,
      refresh_failed,
      last_error,
      refresh_requested_at,
      last_refresh_attempt_at,
      next_refresh_after,
      refresh_in_progress,
      accounts_hash,
      source_reason,
      created_at,
      updated_at
    FROM provider_account_snapshots
    WHERE business_id = ${businessId}
      AND provider = ${provider}
    LIMIT 1
  `) as unknown as ProviderAccountSnapshotRow[];

  return rows[0] ?? null;
}

async function upsertSnapshotRow(input: {
  businessId: string;
  provider: string;
  accounts: ProviderAccountSnapshotItem[];
  refreshFailed: boolean;
  lastError: string | null;
  refreshRequestedAt?: Date | null;
  lastRefreshAttemptAt?: Date | null;
  nextRefreshAfter?: Date | null;
  refreshInProgress?: boolean;
  sourceReason?: string | null;
}) {
  await runMigrations();
  const sql = getDb();
  const accountsHash = computeAccountsHash(input.accounts);
  await sql`
    INSERT INTO provider_account_snapshots (
      business_id,
      provider,
      accounts_payload,
      fetched_at,
      refresh_failed,
      last_error,
      refresh_requested_at,
      last_refresh_attempt_at,
      next_refresh_after,
      refresh_in_progress,
      accounts_hash,
      source_reason,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.provider},
      ${JSON.stringify(input.accounts)}::jsonb,
      now(),
      ${input.refreshFailed},
      ${input.lastError},
      ${toIso(input.refreshRequestedAt ?? null)},
      ${toIso(input.lastRefreshAttemptAt ?? null)},
      ${toIso(input.nextRefreshAfter ?? null)},
      ${input.refreshInProgress ?? false},
      ${accountsHash},
      ${input.sourceReason ?? null},
      now()
    )
    ON CONFLICT (business_id, provider) DO UPDATE SET
      accounts_payload = EXCLUDED.accounts_payload,
      fetched_at = now(),
      refresh_failed = EXCLUDED.refresh_failed,
      last_error = EXCLUDED.last_error,
      refresh_requested_at = COALESCE(EXCLUDED.refresh_requested_at, provider_account_snapshots.refresh_requested_at),
      last_refresh_attempt_at = COALESCE(EXCLUDED.last_refresh_attempt_at, provider_account_snapshots.last_refresh_attempt_at),
      next_refresh_after = EXCLUDED.next_refresh_after,
      refresh_in_progress = EXCLUDED.refresh_in_progress,
      accounts_hash = EXCLUDED.accounts_hash,
      source_reason = EXCLUDED.source_reason,
      updated_at = now()
  `;
}

async function updateSnapshotLifecycle(input: {
  businessId: string;
  provider: string;
  refreshRequestedAt?: Date | null;
  lastRefreshAttemptAt?: Date | null;
  nextRefreshAfter?: Date | null;
  refreshInProgress?: boolean;
  refreshFailed?: boolean;
  lastError?: string | null;
  sourceReason?: string | null;
}) {
  await runMigrations();
  const sql = getDb();
  await sql`
    INSERT INTO provider_account_snapshots (
      business_id,
      provider,
      accounts_payload,
      fetched_at,
      refresh_failed,
      last_error,
      refresh_requested_at,
      last_refresh_attempt_at,
      next_refresh_after,
      refresh_in_progress,
      source_reason,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.provider},
      '[]'::jsonb,
      now(),
      ${input.refreshFailed ?? false},
      ${input.lastError ?? null},
      ${toIso(input.refreshRequestedAt ?? null)},
      ${toIso(input.lastRefreshAttemptAt ?? null)},
      ${toIso(input.nextRefreshAfter ?? null)},
      ${input.refreshInProgress ?? false},
      ${input.sourceReason ?? null},
      now()
    )
    ON CONFLICT (business_id, provider) DO UPDATE SET
      refresh_failed = COALESCE(${input.refreshFailed}, provider_account_snapshots.refresh_failed),
      last_error = COALESCE(${input.lastError}, provider_account_snapshots.last_error),
      refresh_requested_at = COALESCE(${toIso(input.refreshRequestedAt ?? null)}, provider_account_snapshots.refresh_requested_at),
      last_refresh_attempt_at = COALESCE(${toIso(input.lastRefreshAttemptAt ?? null)}, provider_account_snapshots.last_refresh_attempt_at),
      next_refresh_after = COALESCE(${toIso(input.nextRefreshAfter ?? null)}, provider_account_snapshots.next_refresh_after),
      refresh_in_progress = COALESCE(${input.refreshInProgress}, provider_account_snapshots.refresh_in_progress),
      source_reason = COALESCE(${input.sourceReason ?? null}, provider_account_snapshots.source_reason),
      updated_at = now()
  `;
}

function toSnapshotMeta(input: {
  snapshot: ProviderAccountSnapshotRow;
  freshnessMs: number;
}): ProviderAccountSnapshotMeta {
  const failureClass = input.snapshot.refresh_failed
    ? classifyProviderSnapshotFailure(input.snapshot.last_error)
    : null;
  return {
    source: "snapshot",
    fetchedAt: input.snapshot.fetched_at,
    stale: !isFresh(input.snapshot, input.freshnessMs),
    refreshFailed: input.snapshot.refresh_failed,
    failureClass,
    lastError: input.snapshot.last_error,
    lastKnownGoodAvailable: (input.snapshot.accounts_payload ?? []).length > 0,
    refreshRequestedAt: input.snapshot.refresh_requested_at,
    lastRefreshAttemptAt: input.snapshot.last_refresh_attempt_at,
    nextRefreshAfter: input.snapshot.next_refresh_after,
    retryAfterAt: input.snapshot.next_refresh_after,
    refreshInProgress: input.snapshot.refresh_in_progress,
    sourceReason: input.snapshot.source_reason,
  };
}

export async function readProviderAccountSnapshot(input: {
  businessId: string;
  provider: string;
  freshnessMs?: number;
}): Promise<ProviderAccountSnapshotResult | null> {
  const freshnessMs = input.freshnessMs ?? DEFAULT_FRESHNESS_MS;
  const snapshot = await getSnapshotRow(input.businessId, input.provider);
  if (!snapshot) return null;

  return {
    accounts: snapshot.accounts_payload ?? [],
    meta: toSnapshotMeta({
      snapshot,
      freshnessMs,
    }),
  };
}

async function runSnapshotRefresh(input: ResolveProviderAccountSnapshotInput) {
  const key = getSnapshotKey(input.businessId, input.provider);
  const locks = getRefreshLocks();
  const existingRequest = locks.get(key);
  if (existingRequest) {
    await existingRequest;
    return;
  }

  const refreshPromise = (async () => {
    const existingSnapshot = await getSnapshotRow(input.businessId, input.provider);
    const retryAfterMs = getRetryAfterMs(existingSnapshot);
    const failureClass = classifyProviderSnapshotFailure(existingSnapshot?.last_error);
    if (
      retryAfterMs > 0 &&
      (!input.bypassCooldown || failureClass === "quota")
    ) {
      throw new ProviderAccountSnapshotRefreshError({
        provider: input.provider,
        businessId: input.businessId,
        message:
          existingSnapshot?.last_error ??
          "Provider account refresh is temporarily cooling down.",
        retryAfterMs,
        dueToRecentFailure: true,
      });
    }

    const now = new Date();
    await updateSnapshotLifecycle({
      businessId: input.businessId,
      provider: input.provider,
      refreshRequestedAt: now,
      lastRefreshAttemptAt: now,
      nextRefreshAfter: null,
      refreshInProgress: true,
      sourceReason: input.reason ?? "manual_refresh",
    });

    try {
      const accounts = await input.liveLoader();
      await upsertSnapshotRow({
        businessId: input.businessId,
        provider: input.provider,
        accounts,
        refreshFailed: false,
        lastError: null,
        refreshRequestedAt: now,
        lastRefreshAttemptAt: now,
        nextRefreshAfter: null,
        refreshInProgress: false,
        sourceReason: input.reason ?? "manual_refresh",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const currentSnapshot = await getSnapshotRow(input.businessId, input.provider);
      const cooldownMs = computeFailureCooldownMs(currentSnapshot);
      const nextRefreshAfter = new Date(Date.now() + cooldownMs);

      if (currentSnapshot) {
        await upsertSnapshotRow({
          businessId: input.businessId,
          provider: input.provider,
          accounts: currentSnapshot.accounts_payload ?? [],
          refreshFailed: true,
          lastError: message,
          refreshRequestedAt: currentSnapshot.refresh_requested_at
            ? new Date(currentSnapshot.refresh_requested_at)
            : now,
          lastRefreshAttemptAt: now,
          nextRefreshAfter,
          refreshInProgress: false,
          sourceReason: input.reason ?? "manual_refresh",
        });
      } else {
        await updateSnapshotLifecycle({
          businessId: input.businessId,
          provider: input.provider,
          refreshRequestedAt: now,
          lastRefreshAttemptAt: now,
          nextRefreshAfter,
          refreshInProgress: false,
          refreshFailed: true,
          lastError: message,
          sourceReason: input.reason ?? "manual_refresh",
        });
      }

      throw new ProviderAccountSnapshotRefreshError({
        provider: input.provider,
        businessId: input.businessId,
        message,
        retryAfterMs: cooldownMs,
        dueToRecentFailure: false,
      });
    } finally {
      locks.delete(key);
    }
  })();

  locks.set(key, refreshPromise);
  await refreshPromise;
}

export async function scheduleProviderAccountSnapshotRefresh(
  input: ResolveProviderAccountSnapshotInput & {
    skipIfFresh?: boolean;
  }
): Promise<ProviderAccountSnapshotResult | null> {
  const snapshot = await readProviderAccountSnapshot({
    businessId: input.businessId,
    provider: input.provider,
    freshnessMs: input.freshnessMs,
  });

  if (input.skipIfFresh !== false && snapshot && !snapshot.meta.stale) {
    return snapshot;
  }

  const existingRow = await getSnapshotRow(input.businessId, input.provider);
  const retryAfterMs = getRetryAfterMs(existingRow);
  if (retryAfterMs > 0 || existingRow?.refresh_in_progress) {
    return snapshot;
  }

  void runSnapshotRefresh({
    ...input,
    reason: input.reason ?? "background_refresh",
  }).catch(() => undefined);

  return snapshot;
}

export async function requestProviderAccountSnapshotRefresh(
  input: ResolveProviderAccountSnapshotInput
): Promise<ProviderAccountSnapshotResult | null> {
  return scheduleProviderAccountSnapshotRefresh({
    ...input,
    skipIfFresh: true,
    reason: input.reason ?? "background_refresh",
  });
}

export async function forceProviderAccountSnapshotRefresh(
  input: ResolveProviderAccountSnapshotInput
): Promise<ProviderAccountSnapshotResult> {
  await runSnapshotRefresh({
    ...input,
    reason: input.reason ?? "manual_refresh",
    bypassCooldown: true,
  });

  const snapshot = await readProviderAccountSnapshot({
    businessId: input.businessId,
    provider: input.provider,
    freshnessMs: input.freshnessMs,
  });

  if (!snapshot) {
    throw new ProviderAccountSnapshotRefreshError({
      provider: input.provider,
      businessId: input.businessId,
      message: "Provider account snapshot could not be loaded after refresh.",
    });
  }

  return {
    accounts: snapshot.accounts,
    meta: {
      ...snapshot.meta,
      source: "live",
      stale: false,
      refreshFailed: false,
      failureClass: null,
      lastError: null,
      refreshInProgress: false,
      retryAfterAt: null,
    },
  };
}

export async function resolveProviderAccountSnapshot(
  input: ResolveProviderAccountSnapshotInput
): Promise<ProviderAccountSnapshotResult> {
  const snapshot = await readProviderAccountSnapshot({
    businessId: input.businessId,
    provider: input.provider,
    freshnessMs: input.freshnessMs,
  });

  if (snapshot) {
    if (snapshot.meta.stale && !snapshot.meta.refreshInProgress) {
      void scheduleProviderAccountSnapshotRefresh({
        ...input,
        skipIfFresh: true,
        reason: input.reason ?? "stale_snapshot_refresh",
      }).catch(() => undefined);
    }
    return snapshot;
  }

  const existingRow = await getSnapshotRow(input.businessId, input.provider);
  const retryAfterMs = getRetryAfterMs(existingRow);
  if (retryAfterMs > 0) {
    throw new ProviderAccountSnapshotRefreshError({
      provider: input.provider,
      businessId: input.businessId,
      message:
        existingRow?.last_error ??
        "Provider account refresh is temporarily cooling down.",
      retryAfterMs,
      dueToRecentFailure: true,
    });
  }

  await runSnapshotRefresh({
    ...input,
    reason: input.reason ?? "initial_snapshot_refresh",
  });

  const refreshedSnapshot = await readProviderAccountSnapshot({
    businessId: input.businessId,
    provider: input.provider,
    freshnessMs: input.freshnessMs,
  });
  if (!refreshedSnapshot) {
    throw new ProviderAccountSnapshotRefreshError({
      provider: input.provider,
      businessId: input.businessId,
      message: "Provider account snapshot is unavailable.",
    });
  }
  return {
    accounts: refreshedSnapshot.accounts,
    meta: {
      ...refreshedSnapshot.meta,
      source: "live",
      stale: false,
      refreshFailed: false,
      lastError: null,
      refreshInProgress: false,
    },
  };
}
