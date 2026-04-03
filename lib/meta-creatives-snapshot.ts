import { createHash } from "crypto";
import { getDb } from "@/lib/db";

export type MetaCreativesSnapshotLevel = "metadata" | "full";
export type MetaCreativesFreshnessState = "fresh" | "stale" | "expired";
export type MetaCreativesPreviewProfile = "main_grid_v3";

export interface MetaCreativesSnapshotQuery {
  businessId: string;
  assignedAccountIds: string[];
  start: string;
  end: string;
  groupBy: string;
  format: string;
  sort: string;
  previewProfile?: MetaCreativesPreviewProfile;
}

export interface MetaCreativesSnapshotRecord {
  snapshotKey: string;
  businessId: string;
  assignedAccountsHash: string;
  payload: Record<string, unknown>;
  snapshotLevel: MetaCreativesSnapshotLevel;
  rowCount: number;
  previewReadyCount: number;
  lastSyncedAt: string;
  refreshStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PersistSnapshotInput extends MetaCreativesSnapshotQuery {
  payload: Record<string, unknown>;
  snapshotLevel: MetaCreativesSnapshotLevel;
  rowCount: number;
  previewReadyCount: number;
}

const SNAPSHOT_FRESH_MS = 10 * 60_000;
const SNAPSHOT_STALE_MS = 6 * 60 * 60_000;

function hashParts(parts: string[]): string {
  return createHash("sha1").update(parts.join("::")).digest("hex");
}

export function hashAssignedAccountIds(accountIds: string[]): string {
  return hashParts([...accountIds].filter(Boolean).sort());
}

export function getMetaCreativesSnapshotKey(query: MetaCreativesSnapshotQuery): string {
  return hashParts([
    "meta-creatives",
    query.previewProfile ?? "default",
    query.businessId,
    hashAssignedAccountIds(query.assignedAccountIds),
    query.start,
    query.end,
    query.groupBy,
    query.format,
    query.sort,
  ]);
}

export function getMetaCreativesSnapshotFreshness(lastSyncedAt: string): {
  freshnessState: MetaCreativesFreshnessState;
  snapshotAgeMs: number;
} {
  const lastSyncedMs = new Date(lastSyncedAt).getTime();
  const snapshotAgeMs = Number.isFinite(lastSyncedMs) ? Math.max(0, Date.now() - lastSyncedMs) : SNAPSHOT_STALE_MS + 1;
  if (snapshotAgeMs <= SNAPSHOT_FRESH_MS) {
    return { freshnessState: "fresh", snapshotAgeMs };
  }
  if (snapshotAgeMs <= SNAPSHOT_STALE_MS) {
    return { freshnessState: "stale", snapshotAgeMs };
  }
  return { freshnessState: "expired", snapshotAgeMs };
}

export async function getMetaCreativesSnapshot(
  query: MetaCreativesSnapshotQuery
): Promise<MetaCreativesSnapshotRecord | null> {
  const sql = getDb();
  const snapshotKey = getMetaCreativesSnapshotKey(query);
  const rows = (await sql`
    SELECT
      snapshot_key,
      business_id,
      assigned_accounts_hash,
      payload,
      snapshot_level,
      row_count,
      preview_ready_count,
      last_synced_at,
      refresh_started_at,
      created_at,
      updated_at
    FROM meta_creatives_snapshots
    WHERE snapshot_key = ${snapshotKey}
    LIMIT 1
  `) as unknown as Array<{
    snapshot_key: string;
    business_id: string;
    assigned_accounts_hash: string;
    payload: Record<string, unknown>;
    snapshot_level: MetaCreativesSnapshotLevel;
    row_count: number;
    preview_ready_count: number;
    last_synced_at: string;
    refresh_started_at: string | null;
    created_at: string;
    updated_at: string;
  }>;

  const row = rows[0];
  if (!row) return null;

  return {
    snapshotKey: row.snapshot_key,
    businessId: row.business_id,
    assignedAccountsHash: row.assigned_accounts_hash,
    payload: row.payload,
    snapshotLevel: row.snapshot_level,
    rowCount: row.row_count,
    previewReadyCount: row.preview_ready_count,
    lastSyncedAt: row.last_synced_at,
    refreshStartedAt: row.refresh_started_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function persistMetaCreativesSnapshot(input: PersistSnapshotInput): Promise<void> {
  const sql = getDb();
  const snapshotKey = getMetaCreativesSnapshotKey(input);
  const assignedAccountsHash = hashAssignedAccountIds(input.assignedAccountIds);
  await sql`
    INSERT INTO meta_creatives_snapshots (
      snapshot_key,
      business_id,
      assigned_accounts_hash,
      start_date,
      end_date,
      group_by,
      format,
      sort,
      payload,
      snapshot_level,
      row_count,
      preview_ready_count,
      last_synced_at,
      refresh_started_at,
      updated_at
    )
    VALUES (
      ${snapshotKey},
      ${input.businessId},
      ${assignedAccountsHash},
      ${input.start},
      ${input.end},
      ${input.groupBy},
      ${input.format},
      ${input.sort},
      ${JSON.stringify(input.payload)}::jsonb,
      ${input.snapshotLevel},
      ${input.rowCount},
      ${input.previewReadyCount},
      now(),
      NULL,
      now()
    )
    ON CONFLICT (snapshot_key) DO UPDATE SET
      payload = EXCLUDED.payload,
      snapshot_level = EXCLUDED.snapshot_level,
      row_count = EXCLUDED.row_count,
      preview_ready_count = EXCLUDED.preview_ready_count,
      assigned_accounts_hash = EXCLUDED.assigned_accounts_hash,
      last_synced_at = now(),
      refresh_started_at = NULL,
      updated_at = now()
  `;
}

export async function markMetaCreativesSnapshotRefreshing(
  query: MetaCreativesSnapshotQuery,
  refreshing: boolean
): Promise<void> {
  const sql = getDb();
  const snapshotKey = getMetaCreativesSnapshotKey(query);
  await sql`
    UPDATE meta_creatives_snapshots
    SET refresh_started_at = ${refreshing ? new Date().toISOString() : null},
        updated_at = now()
    WHERE snapshot_key = ${snapshotKey}
  `;
}

export function getSnapshotCoverage(rowCount: number, previewReadyCount: number) {
  const previewMissingCount = Math.max(0, rowCount - previewReadyCount);
  const previewCoverage = rowCount > 0 ? Math.round((previewReadyCount / rowCount) * 100) : 0;
  return {
    totalCreatives: rowCount,
    previewReadyCount,
    previewMissingCount,
    previewCoverage,
  };
}

type RefreshRunner = () => Promise<void>;

function getRefreshState() {
  const globalStore = globalThis as typeof globalThis & {
    __omniadsMetaCreativesRefreshState?: Set<string>;
  };
  if (!globalStore.__omniadsMetaCreativesRefreshState) {
    globalStore.__omniadsMetaCreativesRefreshState = new Set<string>();
  }
  return globalStore.__omniadsMetaCreativesRefreshState;
}

export function startMetaCreativesSnapshotRefresh(
  query: MetaCreativesSnapshotQuery,
  run: RefreshRunner
): boolean {
  const key = getMetaCreativesSnapshotKey(query);
  const refreshState = getRefreshState();
  if (refreshState.has(key)) return false;
  refreshState.add(key);
  void (async () => {
    try {
      await run();
    } finally {
      refreshState.delete(key);
    }
  })();
  return true;
}
