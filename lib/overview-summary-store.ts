import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import type { GoogleAdsWarehouseDailyRow } from "@/lib/google-ads/warehouse-types";
import type { MetaAccountDailyRow } from "@/lib/meta/warehouse-types";

export type OverviewSummaryProvider = "meta" | "google";

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

function toOverviewSummaryRowsFromGoogle(rows: GoogleAdsWarehouseDailyRow[]): OverviewSummaryDailyRow[] {
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
  await runMigrations();
  const sql = getDb();
  const providerAccountIdsHash = hashAccountIds(input.providerAccountIds);
  const manifestRows = (await sql.query(
    `
      SELECT hydrated_at
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

  return {
    hydrated: true,
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

export async function upsertOverviewSummaryRows(rows: OverviewSummaryDailyRow[]) {
  if (rows.length === 0) return;
  await runMigrations();
  const sql = getDb();

  for (const chunk of chunkRows(rows, 200)) {
    const values: unknown[] = [];
    const placeholders = chunk
      .map((row, index) => {
        const offset = index * 10;
        values.push(
          row.businessId,
          row.provider,
          row.providerAccountId,
          normalizeDate(row.date),
          row.spend,
          row.revenue,
          row.purchases,
          row.impressions,
          row.clicks,
          row.sourceUpdatedAt,
        );
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4}::date,$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},now())`;
      })
      .join(", ");
    await sql.query(
      `
        INSERT INTO platform_overview_daily_summary (
          business_id,
          provider,
          provider_account_id,
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

export async function markOverviewSummaryRangeHydrated(input: {
  businessId: string;
  provider: OverviewSummaryProvider;
  providerAccountIds: string[];
  startDate: string;
  endDate: string;
  rowCount: number;
}) {
  if (input.providerAccountIds.length === 0) return;
  await runMigrations();
  const sql = getDb();
  await sql.query(
    `
      INSERT INTO platform_overview_summary_ranges (
        business_id,
        provider,
        provider_account_ids_hash,
        start_date,
        end_date,
        row_count,
        hydrated_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4::date,$5::date,$6,now(),now())
      ON CONFLICT (business_id, provider, provider_account_ids_hash, start_date, end_date) DO UPDATE SET
        row_count = EXCLUDED.row_count,
        hydrated_at = now(),
        updated_at = now()
    `,
    [
      input.businessId,
      input.provider,
      hashAccountIds(input.providerAccountIds),
      normalizeDate(input.startDate),
      normalizeDate(input.endDate),
      input.rowCount,
    ],
  );
}

export async function invalidateOverviewSummaryRanges(input: {
  businessId: string;
  provider: OverviewSummaryProvider;
  startDate: string;
  endDate: string;
}) {
  await runMigrations();
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

export async function hydrateOverviewSummaryRangeFromMeta(input: {
  businessId: string;
  providerAccountIds: string[];
  startDate: string;
  endDate: string;
  rows: MetaAccountDailyRow[];
}) {
  const normalizedRows = toOverviewSummaryRowsFromMeta(input.rows);
  await upsertOverviewSummaryRows(normalizedRows);
  await markOverviewSummaryRangeHydrated({
    businessId: input.businessId,
    provider: "meta",
    providerAccountIds: input.providerAccountIds,
    startDate: input.startDate,
    endDate: input.endDate,
    rowCount: normalizedRows.length,
  });
  return normalizedRows;
}

export async function hydrateOverviewSummaryRangeFromGoogle(input: {
  businessId: string;
  providerAccountIds: string[];
  startDate: string;
  endDate: string;
  rows: GoogleAdsWarehouseDailyRow[];
}) {
  const normalizedRows = toOverviewSummaryRowsFromGoogle(input.rows);
  await upsertOverviewSummaryRows(normalizedRows);
  await markOverviewSummaryRangeHydrated({
    businessId: input.businessId,
    provider: "google",
    providerAccountIds: input.providerAccountIds,
    startDate: input.startDate,
    endDate: input.endDate,
    rowCount: normalizedRows.length,
  });
  return normalizedRows;
}

export async function refreshOverviewSummaryFromMetaAccountRows(rows: MetaAccountDailyRow[]) {
  if (rows.length === 0) return;
  await upsertOverviewSummaryRows(toOverviewSummaryRowsFromMeta(rows));
  const first = rows[0]!;
  const dates = rows.map((row) => normalizeDate(row.date)).sort();
  await invalidateOverviewSummaryRanges({
    businessId: first.businessId,
    provider: "meta",
    startDate: dates[0]!,
    endDate: dates[dates.length - 1]!,
  });
}

export async function refreshOverviewSummaryFromGoogleAccountRows(rows: GoogleAdsWarehouseDailyRow[]) {
  if (rows.length === 0) return;
  await upsertOverviewSummaryRows(toOverviewSummaryRowsFromGoogle(rows));
  const first = rows[0]!;
  const dates = rows.map((row) => normalizeDate(row.date)).sort();
  await invalidateOverviewSummaryRanges({
    businessId: first.businessId,
    provider: "google",
    startDate: dates[0]!,
    endDate: dates[dates.length - 1]!,
  });
}
