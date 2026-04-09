import { getDb } from "@/lib/db";
import { assertDbSchemaReady } from "@/lib/db-schema-readiness";
import {
  getProviderPlatformDateBoundaries,
  type ProviderPlatformBoundary,
} from "@/lib/provider-platform-date";

export type ProviderDayRolloverProvider = "meta" | "google_ads";

export interface ProviderAccountRolloverStateRecord {
  provider: ProviderDayRolloverProvider;
  businessId: string;
  providerAccountId: string;
  lastObservedCurrentDate: string;
  currentD1TargetDate: string;
  rolloverDetectedAt: string | null;
  d1FinalizeStartedAt: string | null;
  d1FinalizeCompletedAt: string | null;
  lastRecoveryAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ProviderDayRolloverAccount {
  provider: ProviderDayRolloverProvider;
  businessId: string;
  providerAccountId: string;
  boundary: ProviderPlatformBoundary;
  lastObservedCurrentDate: string | null;
  currentD1TargetDate: string;
  rolloverDetected: boolean;
  d1FinalizeStartedAt: string | null;
  d1FinalizeCompletedAt: string | null;
  lastRecoveryAt: string | null;
}

function normalizeDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isFinite(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
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

function platformProviderFor(input: ProviderDayRolloverProvider) {
  return input === "google_ads" ? "google" : "meta";
}

async function assertProviderDayRolloverTablesReady(context: string) {
  await assertDbSchemaReady({
    tables: ["provider_account_rollover_state"],
    context,
  });
}

export async function readProviderAccountRolloverStates(input: {
  provider: ProviderDayRolloverProvider;
  businessId: string;
}) {
  await assertProviderDayRolloverTablesReady("provider_day_rollover:read_states");
  const sql = getDb();
  const rows = (await sql`
    SELECT
      provider,
      business_id,
      provider_account_id,
      last_observed_current_date,
      current_d1_target_date,
      rollover_detected_at,
      d1_finalize_started_at,
      d1_finalize_completed_at,
      last_recovery_at,
      created_at,
      updated_at
    FROM provider_account_rollover_state
    WHERE provider = ${input.provider}
      AND business_id = ${input.businessId}
  `) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    provider: String(row.provider) as ProviderDayRolloverProvider,
    businessId: String(row.business_id),
    providerAccountId: String(row.provider_account_id),
    lastObservedCurrentDate: normalizeDate(row.last_observed_current_date) ?? "1970-01-01",
    currentD1TargetDate: normalizeDate(row.current_d1_target_date) ?? "1970-01-01",
    rolloverDetectedAt: normalizeTimestamp(row.rollover_detected_at),
    d1FinalizeStartedAt: normalizeTimestamp(row.d1_finalize_started_at),
    d1FinalizeCompletedAt: normalizeTimestamp(row.d1_finalize_completed_at),
    lastRecoveryAt: normalizeTimestamp(row.last_recovery_at),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  })) satisfies ProviderAccountRolloverStateRecord[];
}

export async function syncProviderDayRolloverState(input: {
  provider: ProviderDayRolloverProvider;
  businessId: string;
}) {
  await assertProviderDayRolloverTablesReady("provider_day_rollover:sync_state");
  const sql = getDb();
  const existingRows = await readProviderAccountRolloverStates(input).catch(() => []);
  const existingByAccount = new Map(
    existingRows.map((row) => [row.providerAccountId, row]),
  );
  const boundaries = await getProviderPlatformDateBoundaries({
    provider: platformProviderFor(input.provider),
    businessId: input.businessId,
  });
  if (boundaries.length === 0) return [] as ProviderDayRolloverAccount[];

  const accounts: ProviderDayRolloverAccount[] = [];
  for (const boundary of boundaries) {
    const providerAccountId = String(boundary.providerAccountId ?? "");
    if (!providerAccountId) continue;
    const existing = existingByAccount.get(providerAccountId) ?? null;
    const rolloverDetected =
      existing == null || existing.lastObservedCurrentDate !== boundary.currentDate;
    await sql`
      INSERT INTO provider_account_rollover_state (
        provider,
        business_id,
        provider_account_id,
        last_observed_current_date,
        current_d1_target_date,
        rollover_detected_at,
        d1_finalize_started_at,
        d1_finalize_completed_at,
        updated_at
      )
      VALUES (
        ${input.provider},
        ${input.businessId},
        ${providerAccountId},
        ${boundary.currentDate},
        ${boundary.previousDate},
        CASE WHEN ${rolloverDetected} THEN now() ELSE NULL END,
        NULL,
        NULL,
        now()
      )
      ON CONFLICT (provider, business_id, provider_account_id)
      DO UPDATE SET
        last_observed_current_date = EXCLUDED.last_observed_current_date,
        current_d1_target_date = EXCLUDED.current_d1_target_date,
        rollover_detected_at = CASE
          WHEN provider_account_rollover_state.last_observed_current_date <> EXCLUDED.last_observed_current_date
            THEN now()
          ELSE provider_account_rollover_state.rollover_detected_at
        END,
        d1_finalize_started_at = CASE
          WHEN provider_account_rollover_state.last_observed_current_date <> EXCLUDED.last_observed_current_date
            THEN NULL
          ELSE provider_account_rollover_state.d1_finalize_started_at
        END,
        d1_finalize_completed_at = CASE
          WHEN provider_account_rollover_state.last_observed_current_date <> EXCLUDED.last_observed_current_date
            THEN NULL
          ELSE provider_account_rollover_state.d1_finalize_completed_at
        END,
        updated_at = now()
    `;

    accounts.push({
      provider: input.provider,
      businessId: input.businessId,
      providerAccountId,
      boundary,
      lastObservedCurrentDate: existing?.lastObservedCurrentDate ?? null,
      currentD1TargetDate: boundary.previousDate,
      rolloverDetected,
      d1FinalizeStartedAt:
        rolloverDetected ? null : existing?.d1FinalizeStartedAt ?? null,
      d1FinalizeCompletedAt:
        rolloverDetected ? null : existing?.d1FinalizeCompletedAt ?? null,
      lastRecoveryAt: existing?.lastRecoveryAt ?? null,
    });
  }

  return accounts;
}

export async function markProviderDayRolloverFinalizeStarted(input: {
  provider: ProviderDayRolloverProvider;
  businessId: string;
  providerAccountId: string;
  targetDate: string;
}) {
  await assertProviderDayRolloverTablesReady("provider_day_rollover:mark_finalize_started");
  const sql = getDb();
  await sql`
    UPDATE provider_account_rollover_state
    SET
      current_d1_target_date = ${input.targetDate},
      d1_finalize_started_at = now(),
      d1_finalize_completed_at = CASE
        WHEN current_d1_target_date <> ${input.targetDate}::date THEN NULL
        ELSE d1_finalize_completed_at
      END,
      updated_at = now()
    WHERE provider = ${input.provider}
      AND business_id = ${input.businessId}
      AND provider_account_id = ${input.providerAccountId}
  `;
}

export async function markProviderDayRolloverFinalizeCompleted(input: {
  provider: ProviderDayRolloverProvider;
  businessId: string;
  providerAccountId: string;
  targetDate: string;
}) {
  await assertProviderDayRolloverTablesReady("provider_day_rollover:mark_finalize_completed");
  const sql = getDb();
  await sql`
    UPDATE provider_account_rollover_state
    SET
      current_d1_target_date = ${input.targetDate},
      d1_finalize_started_at = COALESCE(d1_finalize_started_at, now()),
      d1_finalize_completed_at = now(),
      updated_at = now()
    WHERE provider = ${input.provider}
      AND business_id = ${input.businessId}
      AND provider_account_id = ${input.providerAccountId}
  `;
}

export async function markProviderDayRolloverRecovered(input: {
  provider: ProviderDayRolloverProvider;
  businessId: string;
  providerAccountId: string;
  targetDate: string;
}) {
  await assertProviderDayRolloverTablesReady("provider_day_rollover:mark_recovered");
  const sql = getDb();
  await sql`
    UPDATE provider_account_rollover_state
    SET
      current_d1_target_date = ${input.targetDate},
      last_recovery_at = now(),
      updated_at = now()
    WHERE provider = ${input.provider}
      AND business_id = ${input.businessId}
      AND provider_account_id = ${input.providerAccountId}
  `;
}
