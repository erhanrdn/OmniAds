import { getDb } from "@/lib/db";
import { assertDbSchemaReady, getDbSchemaReadiness } from "@/lib/db-schema-readiness";

const REPORTING_CACHE_TABLES = ["provider_reporting_snapshots"] as const;

export interface ProviderReportingSnapshotRow<TPayload = unknown> {
  id: string;
  business_id: string;
  provider: string;
  report_type: string;
  date_range_key: string;
  payload: TPayload;
  created_at: string;
  updated_at: string;
}

function sanitizeForJson(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForJson(entry));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        sanitizeForJson(entry),
      ])
    );
  }
  return String(value);
}

async function getSnapshotRow<TPayload>(input: {
  businessId: string;
  provider: string;
  reportType: string;
  dateRangeKey: string;
}): Promise<ProviderReportingSnapshotRow<TPayload> | null> {
  const readiness = await getDbSchemaReadiness({
    tables: [...REPORTING_CACHE_TABLES],
  }).catch(() => null);
  if (!readiness?.ready) {
    return null;
  }
  const sql = getDb();
  const rows = (await sql`
    SELECT
      id,
      business_id,
      provider,
      report_type,
      date_range_key,
      payload,
      created_at,
      updated_at
    FROM provider_reporting_snapshots
    WHERE business_id = ${input.businessId}
      AND provider = ${input.provider}
      AND report_type = ${input.reportType}
      AND date_range_key = ${input.dateRangeKey}
    LIMIT 1
  `) as unknown as Array<ProviderReportingSnapshotRow<TPayload>>;

  return rows[0] ?? null;
}

/**
 * Cache kaydının kaç dakika önce güncellendiğini döndürür.
 * Kayıt yoksa Infinity döner.
 */
export async function getSnapshotAge(input: {
  businessId: string;
  provider: string;
  reportType: string;
  dateRangeKey: string;
}): Promise<number> {
  const row = await getSnapshotRow(input);
  if (!row) return Infinity;
  const updatedAtMs = new Date(row.updated_at).getTime();
  if (!Number.isFinite(updatedAtMs)) return Infinity;
  return (Date.now() - updatedAtMs) / 60_000;
}

export async function getCachedReport<TPayload>(input: {
  businessId: string;
  provider: string;
  reportType: string;
  dateRangeKey: string;
  maxAgeMinutes: number;
}): Promise<TPayload | null> {
  const row = await getSnapshotRow<TPayload>(input);
  if (!row) return null;

  const updatedAtMs = new Date(row.updated_at).getTime();
  const maxAgeMs = Math.max(0, input.maxAgeMinutes) * 60_000;
  if (!Number.isFinite(updatedAtMs) || Date.now() - updatedAtMs > maxAgeMs) {
    return null;
  }

  return row.payload;
}

export async function setCachedReport<TPayload>(input: {
  businessId: string;
  provider: string;
  reportType: string;
  dateRangeKey: string;
  payload: TPayload;
}): Promise<void> {
  const readiness = await getDbSchemaReadiness({
    tables: [...REPORTING_CACHE_TABLES],
  }).catch(() => null);
  if (!readiness?.ready) {
    return;
  }
  const sql = getDb();
  const payloadJson = JSON.stringify(sanitizeForJson(input.payload));

  await sql`
    INSERT INTO provider_reporting_snapshots (
      business_id,
      provider,
      report_type,
      date_range_key,
      payload,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.provider},
      ${input.reportType},
      ${input.dateRangeKey},
      ${payloadJson}::jsonb,
      now()
    )
    ON CONFLICT (business_id, provider, report_type, date_range_key) DO UPDATE SET
      payload = EXCLUDED.payload,
      updated_at = now()
  `;
}

export async function clearCachedReports(input: {
  provider: string;
  businessId?: string | null;
  reportTypePrefix?: string | null;
}) {
  await assertDbSchemaReady({
    tables: [...REPORTING_CACHE_TABLES],
    context: "reporting_cache_clear",
  });
  const sql = getDb();
  const rows = await sql`
    WITH deleted AS (
      DELETE FROM provider_reporting_snapshots
      WHERE provider = ${input.provider}
        AND (${input.businessId ?? null}::text IS NULL OR business_id = ${input.businessId ?? null})
        AND (
          ${input.reportTypePrefix ?? null}::text IS NULL
          OR report_type LIKE ${`${input.reportTypePrefix ?? ""}%`}
        )
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM deleted
  ` as Array<{ count: number }>;
  return Number(rows[0]?.count ?? 0);
}

export function getReportingDateRangeKey(startDate: string, endDate: string) {
  return `${startDate}:${endDate}`;
}
