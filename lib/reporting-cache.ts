import { getDb } from "@/lib/db";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";

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

async function getSnapshotRow<TPayload>(input: {
  businessId: string;
  provider: string;
  reportType: string;
  dateRangeKey: string;
}): Promise<ProviderReportingSnapshotRow<TPayload> | null> {
  const readiness = await getDbSchemaReadiness({
    tables: ["provider_reporting_snapshots"],
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

export function getReportingDateRangeKey(startDate: string, endDate: string) {
  return `${startDate}:${endDate}`;
}
