import { createHash } from "node:crypto";

import { getDb } from "@/lib/db";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import type { GoogleAdsWarehouseDailyRow } from "@/lib/google-ads/warehouse-types";
import type { MetaAccountDailyRow } from "@/lib/meta/warehouse-types";
import type { OverviewSummaryDailyRow } from "@/lib/overview-summary-store";
import {
  ensureProviderAccountReferenceIds,
  resolveBusinessReferenceIds,
} from "@/lib/provider-account-reference-store";

const OVERVIEW_SUMMARY_PROJECTION_TABLES = [
  "platform_overview_daily_summary",
  "platform_overview_summary_ranges",
  "platform_overview_summary_range_accounts",
] as const;

function normalizeDate(value: string | Date) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return text.slice(0, 10);
}

function chunkRows<T>(rows: T[], size = 200) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
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

async function resolveOverviewSummaryReferenceContext(rows: OverviewSummaryDailyRow[]) {
  const businessRefIds = await resolveBusinessReferenceIds(
    rows.map((row) => row.businessId),
  );
  const providerReferenceEntries = await Promise.all(
    [...new Set(rows.map((row) => row.provider))]
      .filter((provider): provider is "meta" | "google" | "shopify" =>
        provider === "meta" || provider === "google" || provider === "shopify",
      )
      .map(async (provider) => [
        provider,
        await ensureProviderAccountReferenceIds({
          provider,
          accounts: rows
            .filter((row) => row.provider === provider)
            .map((row) => ({
              externalAccountId: row.providerAccountId,
            })),
        }),
      ] as const),
  );

  return {
    businessRefIds,
    providerAccountRefIdsByProvider: new Map(providerReferenceEntries),
  };
}

async function isOverviewSummarySchemaReady() {
  const readiness = await getDbSchemaReadiness({
    tables: [...OVERVIEW_SUMMARY_PROJECTION_TABLES],
  }).catch(() => null);
  return Boolean(readiness?.ready);
}

function toOverviewSummaryRowsFromMeta(rows: MetaAccountDailyRow[]): OverviewSummaryDailyRow[] {
  return rows.map((row) => ({
    businessId: row.businessId,
    provider: "meta",
    providerAccountId: row.providerAccountId,
    date: normalizeDate(row.date),
    spend: Number(row.spend ?? 0),
    revenue: Number(row.revenue ?? 0),
    purchases: Number(row.conversions ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    sourceUpdatedAt: row.finalizedAt ?? null,
    updatedAt: null,
  }));
}

function toOverviewSummaryRowsFromGoogle(
  rows: GoogleAdsWarehouseDailyRow[],
): OverviewSummaryDailyRow[] {
  return rows.map((row) => ({
    businessId: row.businessId,
    provider: "google",
    providerAccountId: row.providerAccountId,
    date: normalizeDate(row.date),
    spend: Number(row.spend ?? 0),
    revenue: Number(row.revenue ?? 0),
    purchases: Number(row.conversions ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    sourceUpdatedAt: row.updatedAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }));
}

export async function materializeOverviewSummaryRows(rows: OverviewSummaryDailyRow[]) {
  if (rows.length === 0) return;
  if (!(await isOverviewSummarySchemaReady())) {
    return;
  }
  const sql = getDb();
  const referenceContext = await resolveOverviewSummaryReferenceContext(rows);

  for (const chunk of chunkRows(rows, 200)) {
    const values: unknown[] = [];
    const placeholders = chunk
      .map((row, index) => {
        const offset = index * 12;
        const providerAccountRefId =
          referenceContext.providerAccountRefIdsByProvider
            .get(row.provider)
            ?.get(row.providerAccountId) ?? null;
        values.push(
          row.businessId,
          referenceContext.businessRefIds.get(row.businessId) ?? null,
          row.provider,
          row.providerAccountId,
          providerAccountRefId,
          normalizeDate(row.date),
          row.spend,
          row.revenue,
          row.purchases,
          row.impressions,
          row.clicks,
          row.sourceUpdatedAt,
        );
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6}::date,$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11},$${offset + 12},now())`;
      })
      .join(", ");
    await sql.query(
      `
        INSERT INTO platform_overview_daily_summary (
          business_id,
          business_ref_id,
          provider,
          provider_account_id,
          provider_account_ref_id,
          date,
          spend,
          revenue,
          purchases,
          impressions,
          clicks,
          source_updated_at,
          updated_at
        )
        VALUES ${placeholders}
        ON CONFLICT (business_id, provider, provider_account_id, date) DO UPDATE SET
          business_ref_id = COALESCE(EXCLUDED.business_ref_id, platform_overview_daily_summary.business_ref_id),
          provider_account_ref_id = COALESCE(EXCLUDED.provider_account_ref_id, platform_overview_daily_summary.provider_account_ref_id),
          spend = EXCLUDED.spend,
          revenue = EXCLUDED.revenue,
          purchases = EXCLUDED.purchases,
          impressions = EXCLUDED.impressions,
          clicks = EXCLUDED.clicks,
          source_updated_at = EXCLUDED.source_updated_at,
          updated_at = now()
      `,
      values,
    );
  }
}

export async function materializeOverviewSummaryRange(input: {
  businessId: string;
  provider: "meta" | "google";
  providerAccountIds: string[];
  startDate: string;
  endDate: string;
  rowCount: number;
  expectedRowCount: number;
  coverageComplete: boolean;
  maxSourceUpdatedAt: string | null;
  truthState: string;
  projectionVersion?: number;
}) {
  if (input.providerAccountIds.length === 0) return;
  if (!(await isOverviewSummarySchemaReady())) {
    return;
  }
  const sql = getDb();
  const businessRefId = (await resolveBusinessReferenceIds([input.businessId])).get(
    input.businessId,
  ) ?? null;
  const providerAccountRefIds = await ensureProviderAccountReferenceIds({
    provider: input.provider,
    accounts: input.providerAccountIds.map((providerAccountId) => ({
      externalAccountId: providerAccountId,
    })),
  });
  const rangeRows = await sql.query<{ id: string }>(
    `
      INSERT INTO platform_overview_summary_ranges (
        business_id,
        business_ref_id,
        provider,
        provider_account_ids_hash,
        start_date,
        end_date,
        row_count,
        expected_row_count,
        coverage_complete,
        max_source_updated_at,
        truth_state,
        projection_version,
        invalidation_reason,
        hydrated_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9,$10,$11,$12,NULL,now(),now())
      ON CONFLICT (business_id, provider, provider_account_ids_hash, start_date, end_date) DO UPDATE SET
        business_ref_id = COALESCE(EXCLUDED.business_ref_id, platform_overview_summary_ranges.business_ref_id),
        row_count = EXCLUDED.row_count,
        expected_row_count = EXCLUDED.expected_row_count,
        coverage_complete = EXCLUDED.coverage_complete,
        max_source_updated_at = EXCLUDED.max_source_updated_at,
        truth_state = EXCLUDED.truth_state,
        projection_version = EXCLUDED.projection_version,
        invalidation_reason = EXCLUDED.invalidation_reason,
        hydrated_at = now(),
        updated_at = now()
      RETURNING id
    `,
    [
      input.businessId,
      businessRefId,
      input.provider,
      hashAccountIds(input.providerAccountIds),
      normalizeDate(input.startDate),
      normalizeDate(input.endDate),
      input.rowCount,
      input.expectedRowCount,
      input.coverageComplete,
      input.maxSourceUpdatedAt,
      input.truthState,
      input.projectionVersion ?? 1,
    ],
  );
  const summaryRangeId = rangeRows[0]?.id ?? null;
  if (!summaryRangeId) {
    return;
  }
  await sql.query(
    `
      DELETE FROM platform_overview_summary_range_accounts
      WHERE summary_range_id = $1
    `,
    [summaryRangeId],
  );
  if (input.providerAccountIds.length > 0) {
    const membershipValues: unknown[] = [];
    const membershipPlaceholders = input.providerAccountIds
      .map((providerAccountId, index) => {
        const offset = index * 4;
        membershipValues.push(
          summaryRangeId,
          providerAccountRefIds.get(providerAccountId) ?? null,
          providerAccountId,
          index,
        );
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},now(),now())`;
      })
      .join(", ");

    await sql.query(
      `
        INSERT INTO platform_overview_summary_range_accounts (
          summary_range_id,
          provider_account_ref_id,
          provider_account_id,
          position,
          created_at,
          updated_at
        )
        VALUES ${membershipPlaceholders}
        ON CONFLICT (summary_range_id, provider_account_id) DO UPDATE SET
          provider_account_ref_id = COALESCE(EXCLUDED.provider_account_ref_id, platform_overview_summary_range_accounts.provider_account_ref_id),
          position = EXCLUDED.position,
          updated_at = now()
      `,
      membershipValues,
    );
  }
}

export async function clearOverviewSummaryRangeManifests(input: {
  businessId: string;
  provider: "meta" | "google";
  startDate: string;
  endDate: string;
}) {
  if (!(await isOverviewSummarySchemaReady())) {
    return;
  }
  const sql = getDb();
  await sql.query(
    `
      DELETE FROM platform_overview_summary_ranges
      WHERE business_id = $1
        AND provider = $2
        AND start_date <= $3::date
        AND end_date >= $4::date
    `,
    [
      input.businessId,
      input.provider,
      normalizeDate(input.endDate),
      normalizeDate(input.startDate),
    ],
  );
}

export async function materializeOverviewSummaryRangeFromMeta(input: {
  businessId: string;
  providerAccountIds: string[];
  startDate: string;
  endDate: string;
  rows: MetaAccountDailyRow[];
}) {
  const normalizedRows = toOverviewSummaryRowsFromMeta(input.rows);
  const expectedRowCount =
    countRangeDays(input.startDate, input.endDate) * input.providerAccountIds.length;
  const maxSourceUpdatedAt = normalizedRows.reduce<string | null>(
    (latest, row) =>
      !row.sourceUpdatedAt || (latest && latest >= row.sourceUpdatedAt)
        ? latest
        : row.sourceUpdatedAt,
    null,
  );
  await materializeOverviewSummaryRows(normalizedRows);
  await materializeOverviewSummaryRange({
    businessId: input.businessId,
    provider: "meta",
    providerAccountIds: input.providerAccountIds,
    startDate: input.startDate,
    endDate: input.endDate,
    rowCount: normalizedRows.length,
    expectedRowCount,
    coverageComplete: normalizedRows.length === expectedRowCount,
    maxSourceUpdatedAt,
    truthState: "finalized",
  });
  return normalizedRows;
}

export async function materializeOverviewSummaryRangeFromGoogle(input: {
  businessId: string;
  providerAccountIds: string[];
  startDate: string;
  endDate: string;
  rows: GoogleAdsWarehouseDailyRow[];
}) {
  const normalizedRows = toOverviewSummaryRowsFromGoogle(input.rows);
  const expectedRowCount =
    countRangeDays(input.startDate, input.endDate) * input.providerAccountIds.length;
  const maxSourceUpdatedAt = normalizedRows.reduce<string | null>(
    (latest, row) =>
      !row.sourceUpdatedAt || (latest && latest >= row.sourceUpdatedAt)
        ? latest
        : row.sourceUpdatedAt,
    null,
  );
  await materializeOverviewSummaryRows(normalizedRows);
  await materializeOverviewSummaryRange({
    businessId: input.businessId,
    provider: "google",
    providerAccountIds: input.providerAccountIds,
    startDate: input.startDate,
    endDate: input.endDate,
    rowCount: normalizedRows.length,
    expectedRowCount,
    coverageComplete: normalizedRows.length === expectedRowCount,
    maxSourceUpdatedAt,
    truthState: "finalized",
  });
  return normalizedRows;
}

export async function refreshOverviewSummaryMaterializationFromMetaAccountRows(
  rows: MetaAccountDailyRow[],
) {
  if (rows.length === 0) return;
  await materializeOverviewSummaryRows(toOverviewSummaryRowsFromMeta(rows));
  const first = rows[0]!;
  const dates = rows.map((row) => normalizeDate(row.date)).sort();
  await clearOverviewSummaryRangeManifests({
    businessId: first.businessId,
    provider: "meta",
    startDate: dates[0]!,
    endDate: dates[dates.length - 1]!,
  });
}

export async function refreshOverviewSummaryMaterializationFromGoogleAccountRows(
  rows: GoogleAdsWarehouseDailyRow[],
) {
  if (rows.length === 0) return;
  await materializeOverviewSummaryRows(toOverviewSummaryRowsFromGoogle(rows));
  const first = rows[0]!;
  const dates = rows.map((row) => normalizeDate(row.date)).sort();
  await clearOverviewSummaryRangeManifests({
    businessId: first.businessId,
    provider: "google",
    startDate: dates[0]!,
    endDate: dates[dates.length - 1]!,
  });
}
