import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";

export type OverviewSummaryProvider = "meta" | "google" | "shopify";

export interface OverviewSummaryDailyRow {
  businessId: string;
  provider: OverviewSummaryProvider;
  providerAccountId: string;
  date: string;
  spend: number;
  revenue: number;
  purchases: number;
  impressions: number;
  clicks: number;
  sourceUpdatedAt: string | null;
  updatedAt: string | null;
}

export interface OverviewSummaryRangeManifest {
  rowCount: number;
  expectedRowCount: number | null;
  coverageComplete: boolean;
  maxSourceUpdatedAt: string | null;
  truthState: string | null;
  projectionVersion: number;
  invalidationReason: string | null;
  hydratedAt: string | null;
}

function normalizeDate(value: string | Date) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text.slice(0, 10);
}

function hashAccountIds(providerAccountIds: string[]) {
  return createHash("sha1")
    .update(
      [...new Set(providerAccountIds)]
        .filter((value) => value.trim().length > 0)
        .sort()
        .join("|"),
    )
    .digest("hex");
}

function countRangeDays(startDate: string, endDate: string) {
  const start = new Date(`${normalizeDate(startDate)}T00:00:00Z`).getTime();
  const end = new Date(`${normalizeDate(endDate)}T00:00:00Z`).getTime();
  return Math.max(1, Math.floor((end - start) / 86_400_000) + 1);
}

async function isOverviewSummarySchemaReady() {
  const readiness = await getDbSchemaReadiness({
    tables: ["platform_overview_daily_summary", "platform_overview_summary_ranges"],
  }).catch(() => null);
  return Boolean(readiness?.ready);
}

export async function readOverviewSummaryRange(input: {
  businessId: string;
  provider: OverviewSummaryProvider;
  providerAccountIds: string[];
  startDate: string;
  endDate: string;
}) {
  if (input.providerAccountIds.length === 0) {
    return { hydrated: false, rows: [] as OverviewSummaryDailyRow[] };
  }
  if (!(await isOverviewSummarySchemaReady())) {
    return { hydrated: false, rows: [] as OverviewSummaryDailyRow[] };
  }
  const sql = getDb();
  const providerAccountIdsHash = hashAccountIds(input.providerAccountIds);
  const manifestRows = (await sql.query(
    `
      SELECT
        row_count,
        expected_row_count,
        coverage_complete,
        max_source_updated_at,
        truth_state,
        projection_version,
        invalidation_reason,
        hydrated_at
      FROM platform_overview_summary_ranges
      WHERE business_id = $1
        AND provider = $2
        AND provider_account_ids_hash = $3
        AND start_date = $4::date
        AND end_date = $5::date
      LIMIT 1
    `,
    [
      input.businessId,
      input.provider,
      providerAccountIdsHash,
      normalizeDate(input.startDate),
      normalizeDate(input.endDate),
    ],
  )) as Array<Record<string, unknown>>;

  if (manifestRows.length === 0) {
    return { hydrated: false, rows: [] as OverviewSummaryDailyRow[] };
  }

  const rows = (await sql.query(
    `
      SELECT
        business_id,
        provider,
        provider_account_id,
        date::text AS date,
        spend,
        revenue,
        purchases,
        impressions,
        clicks,
        source_updated_at,
        updated_at
      FROM platform_overview_daily_summary
      WHERE business_id = $1
        AND provider = $2
        AND provider_account_id = ANY($3::text[])
        AND date BETWEEN $4::date AND $5::date
      ORDER BY date ASC, provider_account_id ASC
    `,
    [
      input.businessId,
      input.provider,
      input.providerAccountIds,
      normalizeDate(input.startDate),
      normalizeDate(input.endDate),
    ],
  )) as Array<Record<string, unknown>>;

  const manifestRow = manifestRows[0] ?? null;
  return {
    hydrated: true,
    manifest: manifestRow
      ? {
          rowCount: Number(manifestRow.row_count ?? 0),
          expectedRowCount:
            manifestRow.expected_row_count == null
              ? null
              : Number(manifestRow.expected_row_count),
          coverageComplete: Boolean(manifestRow.coverage_complete),
          maxSourceUpdatedAt:
            manifestRow.max_source_updated_at instanceof Date
              ? manifestRow.max_source_updated_at.toISOString()
              : manifestRow.max_source_updated_at
                ? String(manifestRow.max_source_updated_at)
                : null,
          truthState:
            typeof manifestRow.truth_state === "string"
              ? manifestRow.truth_state
              : null,
          projectionVersion: Number(manifestRow.projection_version ?? 1),
          invalidationReason:
            typeof manifestRow.invalidation_reason === "string"
              ? manifestRow.invalidation_reason
              : null,
          hydratedAt:
            manifestRow.hydrated_at instanceof Date
              ? manifestRow.hydrated_at.toISOString()
              : manifestRow.hydrated_at
                ? String(manifestRow.hydrated_at)
                : null,
        }
      : null,
    rows: rows.map((row) => ({
      businessId: String(row.business_id),
      provider: String(row.provider) as OverviewSummaryProvider,
      providerAccountId: String(row.provider_account_id),
      date: String(row.date),
      spend: Number(row.spend ?? 0),
      revenue: Number(row.revenue ?? 0),
      purchases: Number(row.purchases ?? 0),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      sourceUpdatedAt:
        row.source_updated_at instanceof Date
          ? row.source_updated_at.toISOString()
          : row.source_updated_at
            ? String(row.source_updated_at)
            : null,
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : row.updated_at
            ? String(row.updated_at)
            : null,
    })),
  };
}

export function evaluateOverviewSummaryProjectionValidity(input: {
  providerAccountIds: string[];
  startDate: string;
  endDate: string;
  hydrated: boolean;
  manifest?: OverviewSummaryRangeManifest | null;
  rows: OverviewSummaryDailyRow[];
}) {
  if (!input.hydrated) {
    return { valid: false, reason: "not_hydrated" as const };
  }
  if (!input.manifest) {
    return { valid: false, reason: "manifest_missing" as const };
  }
  const expectedRowCount = countRangeDays(input.startDate, input.endDate) * input.providerAccountIds.length;
  if (!input.manifest.coverageComplete) {
    return { valid: false, reason: "coverage_incomplete" as const };
  }
  if (input.manifest.expectedRowCount == null) {
    return { valid: false, reason: "expected_row_count_missing" as const };
  }
  if (input.manifest.expectedRowCount !== expectedRowCount) {
    return { valid: false, reason: "expected_row_count_mismatch" as const };
  }
  if (input.manifest.rowCount !== expectedRowCount) {
    return { valid: false, reason: "manifest_row_count_mismatch" as const };
  }
  if (input.rows.length !== expectedRowCount) {
    return { valid: false, reason: "rows_length_mismatch" as const };
  }
  if (!input.manifest.maxSourceUpdatedAt) {
    return { valid: false, reason: "source_watermark_missing" as const };
  }
  if (input.manifest.truthState !== "finalized") {
    return { valid: false, reason: "truth_state_not_finalized" as const };
  }
  if (input.manifest.projectionVersion !== 1) {
    return { valid: false, reason: "projection_version_mismatch" as const };
  }
  if (input.manifest.invalidationReason) {
    return { valid: false, reason: "projection_invalidated" as const };
  }
  return { valid: true, reason: "valid" as const };
}
