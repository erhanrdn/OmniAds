import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

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
  await runMigrations();
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
  await runMigrations();
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

export function getReportingDateRangeKey(startDate: string, endDate: string) {
  return `${startDate}:${endDate}`;
}
