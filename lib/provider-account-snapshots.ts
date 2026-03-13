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
  created_at: string;
  updated_at: string;
}

export interface ProviderAccountSnapshotResult {
  accounts: ProviderAccountSnapshotItem[];
  meta: {
    source: "live" | "snapshot";
    fetchedAt: string | null;
    stale: boolean;
    refreshFailed: boolean;
    lastError: string | null;
    lastKnownGoodAvailable: boolean;
  };
}

interface ResolveProviderAccountSnapshotInput {
  businessId: string;
  provider: string;
  liveLoader: () => Promise<ProviderAccountSnapshotItem[]>;
  freshnessMs?: number;
}

const DEFAULT_FRESHNESS_MS = 15 * 60_000;

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
      created_at,
      updated_at
    FROM provider_account_snapshots
    WHERE business_id = ${businessId}
      AND provider = ${provider}
    LIMIT 1
  `) as unknown as Array<{
    business_id: string;
    provider: string;
    accounts_payload: ProviderAccountSnapshotItem[];
    fetched_at: string;
    refresh_failed: boolean;
    last_error: string | null;
    created_at: string;
    updated_at: string;
  }>;

  const row = rows[0];
  if (!row) return null;
  return row;
}

async function upsertSnapshotRow(input: {
  businessId: string;
  provider: string;
  accounts: ProviderAccountSnapshotItem[];
  refreshFailed: boolean;
  lastError: string | null;
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
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.provider},
      ${JSON.stringify(input.accounts)}::jsonb,
      now(),
      ${input.refreshFailed},
      ${input.lastError},
      now()
    )
    ON CONFLICT (business_id, provider) DO UPDATE SET
      accounts_payload = EXCLUDED.accounts_payload,
      fetched_at = now(),
      refresh_failed = EXCLUDED.refresh_failed,
      last_error = EXCLUDED.last_error,
      updated_at = now()
  `;
}

function isFresh(row: ProviderAccountSnapshotRow, freshnessMs: number) {
  const fetchedAtMs = new Date(row.fetched_at).getTime();
  return Number.isFinite(fetchedAtMs) && Date.now() - fetchedAtMs <= freshnessMs;
}

async function refreshSnapshotInBackground(input: ResolveProviderAccountSnapshotInput) {
  const key = getSnapshotKey(input.businessId, input.provider);
  const locks = getRefreshLocks();
  if (locks.has(key)) return;

  const refreshPromise = (async () => {
    try {
      const accounts = await input.liveLoader();
      await upsertSnapshotRow({
        businessId: input.businessId,
        provider: input.provider,
        accounts,
        refreshFailed: false,
        lastError: null,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const existing = await getSnapshotRow(input.businessId, input.provider);
      if (existing) {
        await upsertSnapshotRow({
          businessId: input.businessId,
          provider: input.provider,
          accounts: existing.accounts_payload ?? [],
          refreshFailed: true,
          lastError: message,
        });
      }
    } finally {
      locks.delete(key);
    }
  })();

  locks.set(key, refreshPromise);
}

export async function resolveProviderAccountSnapshot(
  input: ResolveProviderAccountSnapshotInput
): Promise<ProviderAccountSnapshotResult> {
  const freshnessMs = input.freshnessMs ?? DEFAULT_FRESHNESS_MS;
  const snapshot = await getSnapshotRow(input.businessId, input.provider);

  if (snapshot && isFresh(snapshot, freshnessMs)) {
    return {
      accounts: snapshot.accounts_payload ?? [],
      meta: {
        source: "snapshot",
        fetchedAt: snapshot.fetched_at,
        stale: false,
        refreshFailed: snapshot.refresh_failed,
        lastError: snapshot.last_error,
        lastKnownGoodAvailable: true,
      },
    };
  }

  if (snapshot) {
    void refreshSnapshotInBackground(input);
    return {
      accounts: snapshot.accounts_payload ?? [],
      meta: {
        source: "snapshot",
        fetchedAt: snapshot.fetched_at,
        stale: true,
        refreshFailed: snapshot.refresh_failed,
        lastError: snapshot.last_error,
        lastKnownGoodAvailable: true,
      },
    };
  }

  const accounts = await input.liveLoader();
  await upsertSnapshotRow({
    businessId: input.businessId,
    provider: input.provider,
    accounts,
    refreshFailed: false,
    lastError: null,
  });

  return {
    accounts,
    meta: {
      source: "live",
      fetchedAt: new Date().toISOString(),
      stale: false,
      refreshFailed: false,
      lastError: null,
      lastKnownGoodAvailable: false,
    },
  };
}

