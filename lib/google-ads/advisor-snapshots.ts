import { getDb } from "@/lib/db";
import { assertDbSchemaReady, getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import {
  ensureProviderAccountReferenceIds,
  resolveBusinessReferenceIds,
} from "@/lib/provider-account-reference-store";
import type {
  GoogleAdvisorHistoricalSupport,
  GoogleAdvisorResponse,
} from "@/lib/google-ads/growth-advisor-types";
import { applyGoogleAdsStructuredAssist } from "@/lib/google-ads/advisor-structured-assist";
import { normalizeGoogleAdsDecisionSnapshotPayload } from "@/lib/google-ads/decision-snapshot";
import { buildGoogleAdsDecisionSnapshotReport } from "@/lib/google-ads/serving";
import { GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS } from "@/lib/google-ads/advisor-readiness";
import type { DateRange } from "@/lib/google-ads/reporting-core";

const GOOGLE_ADVISOR_SNAPSHOT_ANALYSIS_VERSION = "v4";
const GOOGLE_ADVISOR_SNAPSHOT_STALE_MS = 36 * 60 * 60 * 1000;

export interface GoogleAdsAdvisorSnapshotRecord {
  id: string;
  businessId: string;
  accountId: string | null;
  analysisVersion: string;
  analysisMode: "snapshot";
  asOfDate: string;
  selectedWindowKey: "operational_28d";
  primaryWindowKey: "operational_28d";
  queryWindowKey: "query_governance_56d";
  baselineWindowKey: "baseline_84d";
  maturityCutoffDays: number;
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
  const asOfDate = normalizeDate(String(row.as_of_date));
  const historicalSupport =
    row.historical_support_json && typeof row.historical_support_json === "object"
      ? (row.historical_support_json as GoogleAdvisorHistoricalSupport)
      : null;
  const advisorPayload = normalizeGoogleAdsDecisionSnapshotPayload({
    advisorPayload: (row.advisor_payload ?? {}) as GoogleAdvisorResponse,
    analysisMode: "snapshot",
    asOfDate,
    selectedWindowKey: "operational_28d",
    historicalSupport,
  });
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    accountId: row.account_id ? String(row.account_id) : null,
    analysisVersion: String(row.analysis_version ?? GOOGLE_ADVISOR_SNAPSHOT_ANALYSIS_VERSION),
    analysisMode: "snapshot",
    asOfDate,
    selectedWindowKey: "operational_28d",
    primaryWindowKey: "operational_28d",
    queryWindowKey: "query_governance_56d",
    baselineWindowKey: "baseline_84d",
    maturityCutoffDays: advisorPayload.metadata?.maturityCutoffDays ?? 84,
    advisorPayload,
    historicalSupport,
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
  const readiness = await getDbSchemaReadiness({
    tables: ["google_ads_advisor_snapshots"],
  }).catch(() => null);
  if (!readiness?.ready) {
    return null;
  }
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
  await assertDbSchemaReady({
    tables: ["google_ads_advisor_snapshots"],
    context: "google_ads_advisor_snapshot_upsert",
  });
  const [businessRefIds, providerAccountRefIds] = await Promise.all([
    resolveBusinessReferenceIds([input.businessId]),
    input.accountId
      ? ensureProviderAccountReferenceIds({
          provider: "google",
          accounts: [
            {
              externalAccountId: input.accountId,
            },
          ],
        })
      : Promise.resolve(new Map<string, string>()),
  ]);
  const sql = getDb();
  const businessRefId = businessRefIds.get(input.businessId) ?? null;
  const providerAccountRefId = input.accountId
    ? (providerAccountRefIds.get(input.accountId) ?? null)
    : null;
  const advisorPayload = normalizeGoogleAdsDecisionSnapshotPayload({
    advisorPayload: input.advisorPayload,
    analysisMode: "snapshot",
    asOfDate: input.asOfDate,
    selectedWindowKey: "operational_28d",
    historicalSupport: input.historicalSupport,
    actionContractSource: "native",
  });
  const rows = (await sql`
    INSERT INTO google_ads_advisor_snapshots (
      business_id,
      business_ref_id,
      account_id,
      provider_account_ref_id,
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
      ${businessRefId},
      ${input.accountId ?? null},
      ${providerAccountRefId},
      ${GOOGLE_ADVISOR_SNAPSHOT_ANALYSIS_VERSION},
      'snapshot',
      ${input.asOfDate},
      'operational_28d',
      ${JSON.stringify(advisorPayload)}::jsonb,
      ${JSON.stringify(input.historicalSupport ?? null)}::jsonb,
      ${input.sourceMaxUpdatedAt ?? null},
      ${input.status ?? "success"},
      ${input.errorMessage ?? null},
      now(),
      now()
    )
    ON CONFLICT (business_id, account_id, as_of_date, analysis_version)
    DO UPDATE SET
      business_ref_id = COALESCE(
        google_ads_advisor_snapshots.business_ref_id,
        EXCLUDED.business_ref_id
      ),
      provider_account_ref_id = COALESCE(
        google_ads_advisor_snapshots.provider_account_ref_id,
        EXCLUDED.provider_account_ref_id
      ),
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
  const advisorDateRange = String(
    GOOGLE_ADS_ADVISOR_READY_WINDOW_DAYS
  ) as DateRange;
  const payload = await applyGoogleAdsStructuredAssist({
    analysisMode: "snapshot",
    businessId: input.businessId,
    advisorPayload: (await buildGoogleAdsDecisionSnapshotReport({
      businessId: input.businessId,
      accountId: input.accountId ?? null,
      dateRange: advisorDateRange,
    })) as GoogleAdvisorResponse,
  });

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
