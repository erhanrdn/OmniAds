import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import type {
  GoogleAdvisorHistoricalSupport,
  GoogleAdvisorResponse,
} from "@/lib/google-ads/growth-advisor-types";
import { buildCanonicalGoogleAdsAdvisorReport } from "@/lib/google-ads/serving";

const GOOGLE_ADVISOR_SNAPSHOT_ANALYSIS_VERSION = "v2";
const GOOGLE_ADVISOR_SNAPSHOT_STALE_MS = 36 * 60 * 60 * 1000;

export interface GoogleAdsAdvisorSnapshotRecord {
  id: string;
  businessId: string;
  accountId: string | null;
  analysisVersion: string;
  analysisMode: "snapshot";
  asOfDate: string;
  selectedWindowKey: "operational_28d";
  advisorPayload: GoogleAdvisorResponse;
  historicalSupport: GoogleAdvisorHistoricalSupport | null;
  sourceMaxUpdatedAt: string | null;
  status: string;
  errorMessage: string | null;
  generatedAt: string | null;
  updatedAt: string | null;
}

function normalizeDate(value: string) {
  return value.slice(0, 10);
}

function normalizeTimestamp(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapSnapshotRow(row: Record<string, unknown>): GoogleAdsAdvisorSnapshotRecord {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    accountId: row.account_id ? String(row.account_id) : null,
    analysisVersion: String(row.analysis_version ?? GOOGLE_ADVISOR_SNAPSHOT_ANALYSIS_VERSION),
    analysisMode: "snapshot",
    asOfDate: normalizeDate(String(row.as_of_date)),
    selectedWindowKey: "operational_28d",
    advisorPayload: (row.advisor_payload ?? {}) as GoogleAdvisorResponse,
    historicalSupport:
      row.historical_support_json && typeof row.historical_support_json === "object"
        ? (row.historical_support_json as GoogleAdvisorHistoricalSupport)
        : null,
    sourceMaxUpdatedAt: normalizeTimestamp(row.source_max_updated_at),
    status: String(row.status ?? "success"),
    errorMessage: row.error_message ? String(row.error_message) : null,
    generatedAt: normalizeTimestamp(row.generated_at),
    updatedAt: normalizeTimestamp(row.updated_at),
  };
}

export function isGoogleAdsAdvisorSnapshotFresh(
  snapshot: Pick<GoogleAdsAdvisorSnapshotRecord, "generatedAt"> | null | undefined
) {
  if (!snapshot?.generatedAt) return false;
  const generatedAtMs = new Date(snapshot.generatedAt).getTime();
  return Number.isFinite(generatedAtMs) && Date.now() - generatedAtMs <= GOOGLE_ADVISOR_SNAPSHOT_STALE_MS;
}

export async function getLatestGoogleAdsAdvisorSnapshot(input: {
  businessId: string;
  accountId?: string | null;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = (await sql`
    SELECT *
    FROM google_ads_advisor_snapshots
    WHERE business_id = ${input.businessId}
      AND (${input.accountId ?? null}::text IS NULL OR account_id = ${input.accountId ?? null})
      AND status = 'success'
    ORDER BY generated_at DESC, updated_at DESC
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  return rows[0] ? mapSnapshotRow(rows[0] as Record<string, unknown>) : null;
}

export async function upsertGoogleAdsAdvisorSnapshot(input: {
  businessId: string;
  accountId?: string | null;
  asOfDate: string;
  advisorPayload: GoogleAdvisorResponse;
  historicalSupport: GoogleAdvisorHistoricalSupport | null;
  sourceMaxUpdatedAt?: string | null;
  status?: string;
  errorMessage?: string | null;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = (await sql`
    INSERT INTO google_ads_advisor_snapshots (
      business_id,
      account_id,
      analysis_version,
      analysis_mode,
      as_of_date,
      selected_window_key,
      advisor_payload,
      historical_support_json,
      source_max_updated_at,
      status,
      error_message,
      generated_at,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.accountId ?? null},
      ${GOOGLE_ADVISOR_SNAPSHOT_ANALYSIS_VERSION},
      'snapshot',
      ${input.asOfDate},
      'operational_28d',
      ${JSON.stringify(input.advisorPayload)}::jsonb,
      ${JSON.stringify(input.historicalSupport ?? null)}::jsonb,
      ${input.sourceMaxUpdatedAt ?? null},
      ${input.status ?? "success"},
      ${input.errorMessage ?? null},
      now(),
      now()
    )
    ON CONFLICT (business_id, account_id, as_of_date, analysis_version)
    DO UPDATE SET
      advisor_payload = EXCLUDED.advisor_payload,
      historical_support_json = EXCLUDED.historical_support_json,
      source_max_updated_at = EXCLUDED.source_max_updated_at,
      status = EXCLUDED.status,
      error_message = EXCLUDED.error_message,
      generated_at = now(),
      updated_at = now()
    RETURNING *
  `) as Array<Record<string, unknown>>;
  return mapSnapshotRow(rows[0] as Record<string, unknown>);
}

export async function generateGoogleAdsAdvisorSnapshot(input: {
  businessId: string;
  accountId?: string | null;
}) {
  const payload = (await buildCanonicalGoogleAdsAdvisorReport({
    businessId: input.businessId,
    accountId: input.accountId ?? null,
    dateRange: "90",
  })) as GoogleAdvisorResponse;

  return upsertGoogleAdsAdvisorSnapshot({
    businessId: input.businessId,
    accountId: input.accountId ?? null,
    asOfDate: payload.metadata?.asOfDate ?? new Date().toISOString().slice(0, 10),
    advisorPayload: payload,
    historicalSupport:
      payload.metadata?.historicalSupport && payload.metadata.historicalSupportAvailable
        ? payload.metadata.historicalSupport
        : null,
    sourceMaxUpdatedAt: null,
  });
}

export async function getOrCreateGoogleAdsAdvisorSnapshot(input: {
  businessId: string;
  accountId?: string | null;
  forceRefresh?: boolean;
}) {
  const existing = await getLatestGoogleAdsAdvisorSnapshot(input);
  if (existing && !input.forceRefresh && isGoogleAdsAdvisorSnapshotFresh(existing)) {
    return existing;
  }
  return generateGoogleAdsAdvisorSnapshot(input);
}
