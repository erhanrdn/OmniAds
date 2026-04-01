import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

function normalizeDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text.slice(0, 10);
}

function normalizeTimestamp(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  const parsed = new Date(text);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  return text;
}

export interface ShopifySyncStateRecord {
  businessId: string;
  providerAccountId: string;
  syncTarget: string;
  historicalTargetStart?: string | null;
  historicalTargetEnd?: string | null;
  readyThroughDate?: string | null;
  latestSyncStartedAt?: string | null;
  latestSuccessfulSyncAt?: string | null;
  latestSyncStatus?: string | null;
  latestSyncWindowStart?: string | null;
  latestSyncWindowEnd?: string | null;
  lastError?: string | null;
}

export async function getShopifySyncState(input: {
  businessId: string;
  providerAccountId: string;
  syncTarget: string;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = (await sql`
    SELECT *
    FROM shopify_sync_state
    WHERE business_id = ${input.businessId}
      AND provider_account_id = ${input.providerAccountId}
      AND sync_target = ${input.syncTarget}
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) return null;
  return {
    businessId: String(row.business_id),
    providerAccountId: String(row.provider_account_id),
    syncTarget: String(row.sync_target),
    historicalTargetStart: normalizeDate(row.historical_target_start),
    historicalTargetEnd: normalizeDate(row.historical_target_end),
    readyThroughDate: normalizeDate(row.ready_through_date),
    latestSyncStartedAt: normalizeTimestamp(row.latest_sync_started_at),
    latestSuccessfulSyncAt: normalizeTimestamp(row.latest_successful_sync_at),
    latestSyncStatus: row.latest_sync_status ? String(row.latest_sync_status) : null,
    latestSyncWindowStart: normalizeDate(row.latest_sync_window_start),
    latestSyncWindowEnd: normalizeDate(row.latest_sync_window_end),
    lastError: row.last_error ? String(row.last_error) : null,
  } satisfies ShopifySyncStateRecord;
}

export async function upsertShopifySyncState(input: ShopifySyncStateRecord) {
  await runMigrations();
  const sql = getDb();
  await sql`
    INSERT INTO shopify_sync_state (
      business_id,
      provider_account_id,
      sync_target,
      historical_target_start,
      historical_target_end,
      ready_through_date,
      latest_sync_started_at,
      latest_successful_sync_at,
      latest_sync_status,
      latest_sync_window_start,
      latest_sync_window_end,
      last_error,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.providerAccountId},
      ${input.syncTarget},
      ${normalizeDate(input.historicalTargetStart)},
      ${normalizeDate(input.historicalTargetEnd)},
      ${normalizeDate(input.readyThroughDate)},
      ${normalizeTimestamp(input.latestSyncStartedAt)},
      ${normalizeTimestamp(input.latestSuccessfulSyncAt)},
      ${input.latestSyncStatus ?? null},
      ${normalizeDate(input.latestSyncWindowStart)},
      ${normalizeDate(input.latestSyncWindowEnd)},
      ${input.lastError ?? null},
      now()
    )
    ON CONFLICT (business_id, provider_account_id, sync_target) DO UPDATE SET
      historical_target_start = COALESCE(EXCLUDED.historical_target_start, shopify_sync_state.historical_target_start),
      historical_target_end = COALESCE(EXCLUDED.historical_target_end, shopify_sync_state.historical_target_end),
      ready_through_date = COALESCE(EXCLUDED.ready_through_date, shopify_sync_state.ready_through_date),
      latest_sync_started_at = COALESCE(EXCLUDED.latest_sync_started_at, shopify_sync_state.latest_sync_started_at),
      latest_successful_sync_at = COALESCE(EXCLUDED.latest_successful_sync_at, shopify_sync_state.latest_successful_sync_at),
      latest_sync_status = COALESCE(EXCLUDED.latest_sync_status, shopify_sync_state.latest_sync_status),
      latest_sync_window_start = COALESCE(EXCLUDED.latest_sync_window_start, shopify_sync_state.latest_sync_window_start),
      latest_sync_window_end = COALESCE(EXCLUDED.latest_sync_window_end, shopify_sync_state.latest_sync_window_end),
      last_error = EXCLUDED.last_error,
      updated_at = now()
  `;
}
