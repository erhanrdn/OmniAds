import { getDb } from "@/lib/db";
import { assertDbSchemaReady } from "@/lib/db-schema-readiness";

export interface ProviderJobLockKey {
  businessId: string;
  provider: string;
  reportType: string;
  dateRangeKey: string;
}

const DEFAULT_LOCK_MINUTES = 10;

async function assertProviderJobLockTablesReady(context: string) {
  await assertDbSchemaReady({
    tables: ["provider_sync_jobs"],
    context,
  });
}

function getLockMinutes(input?: number) {
  if (!Number.isFinite(input) || !input || input <= 0) {
    return DEFAULT_LOCK_MINUTES;
  }
  return Math.max(1, Math.floor(input));
}

export async function acquireProviderJobLock(input: ProviderJobLockKey & {
  ownerToken: string;
  lockMinutes?: number;
}) {
  await assertProviderJobLockTablesReady("provider_sync_jobs:acquire_lock");
  const sql = getDb();
  const lockMinutes = getLockMinutes(input.lockMinutes);
  const rows = await sql`
    WITH active AS (
      SELECT id
      FROM provider_sync_jobs
      WHERE business_id = ${input.businessId}
        AND provider = ${input.provider}
        AND report_type = ${input.reportType}
        AND date_range_key = ${input.dateRangeKey}
        AND status = 'running'
        AND COALESCE(lock_expires_at, started_at + (${lockMinutes} || ' minutes')::interval) > now()
      LIMIT 1
    ),
    upserted AS (
      INSERT INTO provider_sync_jobs (
        business_id,
        provider,
        report_type,
        date_range_key,
        status,
        triggered_at,
        started_at,
        lock_owner,
        lock_expires_at,
        completed_at,
        error_message
      )
      VALUES (
        ${input.businessId},
        ${input.provider},
        ${input.reportType},
        ${input.dateRangeKey},
        'running',
        now(),
        now(),
        ${input.ownerToken},
        now() + (${lockMinutes} || ' minutes')::interval,
        NULL,
        NULL
      )
      ON CONFLICT (business_id, provider, report_type, date_range_key)
      DO UPDATE SET
        status = 'running',
        triggered_at = now(),
        started_at = now(),
        lock_owner = ${input.ownerToken},
        lock_expires_at = now() + (${lockMinutes} || ' minutes')::interval,
        completed_at = NULL,
        error_message = NULL
      WHERE provider_sync_jobs.status <> 'running'
        OR COALESCE(provider_sync_jobs.lock_expires_at, provider_sync_jobs.started_at + (${lockMinutes} || ' minutes')::interval) <= now()
      RETURNING id
    )
    SELECT
      EXISTS(SELECT 1 FROM active) AS already_running,
      EXISTS(SELECT 1 FROM upserted) AS acquired
  ` as Array<{ already_running: boolean; acquired: boolean }>;
  return {
    acquired: Boolean(rows[0]?.acquired),
    alreadyRunning: Boolean(rows[0]?.already_running),
  };
}

export async function renewProviderJobLock(input: ProviderJobLockKey & {
  ownerToken: string;
  lockMinutes?: number;
}) {
  await assertProviderJobLockTablesReady("provider_sync_jobs:renew_lock");
  const sql = getDb();
  const lockMinutes = getLockMinutes(input.lockMinutes);
  const rows = await sql`
    UPDATE provider_sync_jobs
    SET
      lock_expires_at = now() + (${lockMinutes} || ' minutes')::interval,
      updated_at = now()
    WHERE business_id = ${input.businessId}
      AND provider = ${input.provider}
      AND report_type = ${input.reportType}
      AND date_range_key = ${input.dateRangeKey}
      AND status = 'running'
      AND lock_owner = ${input.ownerToken}
    RETURNING id
  ` as Array<{ id: string }>;
  return rows.length > 0;
}

export async function releaseProviderJobLock(input: ProviderJobLockKey & {
  ownerToken: string;
  status: "done" | "failed";
  errorMessage?: string | null;
}) {
  await assertProviderJobLockTablesReady("provider_sync_jobs:release_lock");
  const sql = getDb();
  await sql`
    UPDATE provider_sync_jobs
    SET
      status = ${input.status},
      completed_at = now(),
      lock_expires_at = now(),
      error_message = ${input.errorMessage ?? null},
      updated_at = now()
    WHERE business_id = ${input.businessId}
      AND provider = ${input.provider}
      AND report_type = ${input.reportType}
      AND date_range_key = ${input.dateRangeKey}
      AND lock_owner = ${input.ownerToken}
  `;
}
