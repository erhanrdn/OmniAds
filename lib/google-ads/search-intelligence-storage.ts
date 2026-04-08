import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import type { SearchTermPerformanceRow } from "@/lib/google-ads/intelligence-model";

export interface GoogleAdsQueryDictionaryEntry {
  queryHash: string;
  normalizedQuery: string;
  displayQuery: string;
  tokenCount: number;
  firstSeenDate: string;
  lastSeenDate: string;
}

export interface GoogleAdsSearchQueryHotDailyRow {
  businessId: string;
  providerAccountId: string;
  date: string;
  accountTimezone: string;
  accountCurrency: string;
  queryHash: string;
  campaignId: string | null;
  campaignName: string | null;
  adGroupId: string | null;
  adGroupName: string | null;
  clusterKey: string;
  clusterLabel: string;
  themeKey: string | null;
  intentClass: string | null;
  ownershipClass: string | null;
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
  sourceSnapshotId: string | null;
}

export interface GoogleAdsTopQueryWeeklyRow {
  businessId: string;
  providerAccountId: string;
  weekStart: string;
  weekEnd: string;
  queryHash: string;
  queryCountDays: number;
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
}

export interface GoogleAdsSearchClusterDailyRow {
  businessId: string;
  providerAccountId: string;
  date: string;
  clusterKey: string;
  clusterLabel: string;
  themeKey: string | null;
  dominantIntentClass: string | null;
  dominantOwnershipClass: string | null;
  uniqueQueryCount: number;
  spend: number;
  revenue: number;
  conversions: number;
  impressions: number;
  clicks: number;
}

export interface GoogleAdsDecisionActionOutcomeLogRow {
  businessId: string;
  providerAccountId: string | null;
  recommendationFingerprint: string;
  decisionFamily: string | null;
  actionType: "plan" | "execute" | "rollback" | "outcome";
  outcomeStatus: string | null;
  summary: string;
  payloadJson?: Record<string, unknown>;
  occurredAt?: string | null;
}

function normalizeIsoDate(value: string) {
  return value.slice(0, 10);
}

function toNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoWeekStart(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setUTCDate(value.getUTCDate() + diff);
  return value.toISOString().slice(0, 10);
}

function isoWeekEnd(date: string) {
  const start = new Date(`${isoWeekStart(date)}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + 6);
  return start.toISOString().slice(0, 10);
}

function normalizeThemeKey(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized.replace(/\s+/g, "_") : null;
}

export function normalizeGoogleAdsQueryText(query: string | null | undefined) {
  return String(query ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function buildGoogleAdsQueryHash(query: string | null | undefined) {
  return createHash("sha256")
    .update(normalizeGoogleAdsQueryText(query))
    .digest("hex");
}

export function buildGoogleAdsQueryDictionaryEntries(input: {
  date: string;
  rows: Array<Pick<SearchTermPerformanceRow, "searchTerm"> | Record<string, unknown>>;
}): GoogleAdsQueryDictionaryEntry[] {
  const byHash = new Map<string, GoogleAdsQueryDictionaryEntry>();
  for (const row of input.rows) {
    const displayQuery = String(("searchTerm" in row ? row.searchTerm : row.searchTerm) ?? "").trim();
    if (!displayQuery) continue;
    const normalizedQuery = normalizeGoogleAdsQueryText(displayQuery);
    const queryHash = buildGoogleAdsQueryHash(displayQuery);
    const existing = byHash.get(queryHash);
    if (!existing) {
      byHash.set(queryHash, {
        queryHash,
        normalizedQuery,
        displayQuery,
        tokenCount: normalizedQuery.split(/\s+/).filter(Boolean).length,
        firstSeenDate: input.date,
        lastSeenDate: input.date,
      });
      continue;
    }
    existing.lastSeenDate = input.date;
    if (displayQuery.length > existing.displayQuery.length) {
      existing.displayQuery = displayQuery;
    }
  }
  return Array.from(byHash.values());
}

export function buildGoogleAdsSearchQueryHotDailyRows(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
  accountTimezone: string;
  accountCurrency: string;
  sourceSnapshotId?: string | null;
  rows: Array<Partial<SearchTermPerformanceRow> & Record<string, unknown>>;
}): GoogleAdsSearchQueryHotDailyRow[] {
  return input.rows
    .map((row) => {
      const displayQuery = String(row.searchTerm ?? "").trim();
      if (!displayQuery) return null;
      const queryHash = buildGoogleAdsQueryHash(displayQuery);
      const clusterKey =
        String(row.clusterId ?? "").trim() || `query:${queryHash.slice(0, 16)}`;
      return {
        businessId: input.businessId,
        providerAccountId: input.providerAccountId,
        date: input.date,
        accountTimezone: input.accountTimezone,
        accountCurrency: input.accountCurrency,
        queryHash,
        campaignId: row.campaignId ? String(row.campaignId) : null,
        campaignName: row.campaignName ? String(row.campaignName) : null,
        adGroupId: row.adGroupId ? String(row.adGroupId) : null,
        adGroupName: row.adGroupName ? String(row.adGroupName) : null,
        clusterKey,
        clusterLabel: String(row.clusterId ?? displayQuery).trim(),
        themeKey: normalizeThemeKey(String(row.intentClass ?? row.classification ?? "")),
        intentClass: row.intentClass ? String(row.intentClass) : null,
        ownershipClass: row.ownershipClass ? String(row.ownershipClass) : null,
        spend: toNumber(row.spend),
        revenue: toNumber(row.revenue),
        conversions: toNumber(row.conversions),
        impressions: toNumber(row.impressions),
        clicks: toNumber(row.clicks),
        sourceSnapshotId: input.sourceSnapshotId ?? null,
      } satisfies GoogleAdsSearchQueryHotDailyRow;
    })
    .filter((row): row is GoogleAdsSearchQueryHotDailyRow => Boolean(row));
}

export function buildGoogleAdsSearchClusterDailyRows(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
  rows: Array<Partial<SearchTermPerformanceRow> & Record<string, unknown>>;
}): GoogleAdsSearchClusterDailyRow[] {
  const grouped = new Map<string, GoogleAdsSearchClusterDailyRow & { queryHashes: Set<string> }>();
  for (const row of input.rows) {
    const displayQuery = String(row.searchTerm ?? "").trim();
    if (!displayQuery) continue;
    const queryHash = buildGoogleAdsQueryHash(displayQuery);
    const clusterKey =
      String(row.clusterId ?? "").trim() || `query:${queryHash.slice(0, 16)}`;
    const existing = grouped.get(clusterKey);
    if (!existing) {
      grouped.set(clusterKey, {
        businessId: input.businessId,
        providerAccountId: input.providerAccountId,
        date: input.date,
        clusterKey,
        clusterLabel: String(row.clusterId ?? displayQuery).trim(),
        themeKey: normalizeThemeKey(String(row.intentClass ?? row.classification ?? "")),
        dominantIntentClass: row.intentClass ? String(row.intentClass) : null,
        dominantOwnershipClass: row.ownershipClass ? String(row.ownershipClass) : null,
        uniqueQueryCount: 1,
        spend: toNumber(row.spend),
        revenue: toNumber(row.revenue),
        conversions: toNumber(row.conversions),
        impressions: toNumber(row.impressions),
        clicks: toNumber(row.clicks),
        queryHashes: new Set([queryHash]),
      });
      continue;
    }
    existing.queryHashes.add(queryHash);
    existing.uniqueQueryCount = existing.queryHashes.size;
    existing.spend += toNumber(row.spend);
    existing.revenue += toNumber(row.revenue);
    existing.conversions += toNumber(row.conversions);
    existing.impressions += toNumber(row.impressions);
    existing.clicks += toNumber(row.clicks);
  }

  return Array.from(grouped.values()).map(({ queryHashes: _queryHashes, ...row }) => row);
}

export function buildGoogleAdsTopQueryWeeklyRowsFromHotDaily(input: {
  hotDailyRows: GoogleAdsSearchQueryHotDailyRow[];
}): GoogleAdsTopQueryWeeklyRow[] {
  const grouped = new Map<string, GoogleAdsTopQueryWeeklyRow & { dates: Set<string> }>();
  for (const row of input.hotDailyRows) {
    const weekStart = isoWeekStart(row.date);
    const weekEnd = isoWeekEnd(row.date);
    const key = [row.businessId, row.providerAccountId, weekStart, row.queryHash].join("::");
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        businessId: row.businessId,
        providerAccountId: row.providerAccountId,
        weekStart,
        weekEnd,
        queryHash: row.queryHash,
        queryCountDays: 1,
        spend: row.spend,
        revenue: row.revenue,
        conversions: row.conversions,
        impressions: row.impressions,
        clicks: row.clicks,
        dates: new Set([row.date]),
      });
      continue;
    }
    existing.dates.add(row.date);
    existing.queryCountDays = existing.dates.size;
    existing.spend += row.spend;
    existing.revenue += row.revenue;
    existing.conversions += row.conversions;
    existing.impressions += row.impressions;
    existing.clicks += row.clicks;
  }
  return Array.from(grouped.values()).map(({ dates: _dates, ...row }) => row);
}

export async function readGoogleAdsSearchQueryHotDailyRows(input: {
  businessId: string;
  providerAccountId: string;
  startDate: string;
  endDate: string;
}) {
  await runMigrations();
  const sql = getDb();
  return (await sql`
    SELECT *
    FROM google_ads_search_query_hot_daily
    WHERE business_id = ${input.businessId}
      AND provider_account_id = ${input.providerAccountId}
      AND date >= ${input.startDate}
      AND date <= ${input.endDate}
    ORDER BY date ASC, query_hash ASC
  `) as GoogleAdsSearchQueryHotDailyRow[];
}

export async function upsertGoogleAdsQueryDictionaryEntries(entries: GoogleAdsQueryDictionaryEntry[]) {
  if (entries.length === 0) return 0;
  await runMigrations();
  const sql = getDb();
  for (const entry of entries) {
    await sql`
      INSERT INTO google_ads_query_dictionary (
        query_hash,
        normalized_query,
        display_query,
        token_count,
        first_seen_date,
        last_seen_date,
        updated_at
      )
      VALUES (
        ${entry.queryHash},
        ${entry.normalizedQuery},
        ${entry.displayQuery},
        ${entry.tokenCount},
        ${entry.firstSeenDate},
        ${entry.lastSeenDate},
        now()
      )
      ON CONFLICT (query_hash)
      DO UPDATE SET
        normalized_query = EXCLUDED.normalized_query,
        display_query = EXCLUDED.display_query,
        token_count = EXCLUDED.token_count,
        first_seen_date = LEAST(google_ads_query_dictionary.first_seen_date, EXCLUDED.first_seen_date),
        last_seen_date = GREATEST(google_ads_query_dictionary.last_seen_date, EXCLUDED.last_seen_date),
        updated_at = now()
    `;
  }
  return entries.length;
}

export async function upsertGoogleAdsSearchQueryHotDailyRows(rows: GoogleAdsSearchQueryHotDailyRow[]) {
  if (rows.length === 0) return 0;
  await runMigrations();
  const sql = getDb();
  for (const row of rows) {
    const updatedRows = await sql`
      UPDATE google_ads_search_query_hot_daily
      SET
        account_timezone = ${row.accountTimezone},
        account_currency = ${row.accountCurrency},
        campaign_name = ${row.campaignName},
        ad_group_name = ${row.adGroupName},
        cluster_key = ${row.clusterKey},
        cluster_label = ${row.clusterLabel},
        theme_key = ${row.themeKey},
        intent_class = ${row.intentClass},
        ownership_class = ${row.ownershipClass},
        spend = ${row.spend},
        revenue = ${row.revenue},
        conversions = ${row.conversions},
        impressions = ${row.impressions},
        clicks = ${row.clicks},
        source_snapshot_id = ${row.sourceSnapshotId},
        updated_at = now()
      WHERE business_id = ${row.businessId}
        AND provider_account_id = ${row.providerAccountId}
        AND date = ${normalizeIsoDate(row.date)}
        AND query_hash = ${row.queryHash}
        AND campaign_id IS NOT DISTINCT FROM ${row.campaignId}
        AND ad_group_id IS NOT DISTINCT FROM ${row.adGroupId}
      RETURNING 1
    `;
    if (Array.isArray(updatedRows) && updatedRows.length > 0) {
      continue;
    }
    await sql`
      INSERT INTO google_ads_search_query_hot_daily (
        business_id,
        provider_account_id,
        date,
        account_timezone,
        account_currency,
        query_hash,
        campaign_id,
        campaign_name,
        ad_group_id,
        ad_group_name,
        cluster_key,
        cluster_label,
        theme_key,
        intent_class,
        ownership_class,
        spend,
        revenue,
        conversions,
        impressions,
        clicks,
        source_snapshot_id,
        updated_at
      )
      VALUES (
        ${row.businessId},
        ${row.providerAccountId},
        ${normalizeIsoDate(row.date)},
        ${row.accountTimezone},
        ${row.accountCurrency},
        ${row.queryHash},
        ${row.campaignId},
        ${row.campaignName},
        ${row.adGroupId},
        ${row.adGroupName},
        ${row.clusterKey},
        ${row.clusterLabel},
        ${row.themeKey},
        ${row.intentClass},
        ${row.ownershipClass},
        ${row.spend},
        ${row.revenue},
        ${row.conversions},
        ${row.impressions},
        ${row.clicks},
        ${row.sourceSnapshotId},
        now()
      )
    `;
  }
  return rows.length;
}

export async function upsertGoogleAdsTopQueryWeeklyRows(rows: GoogleAdsTopQueryWeeklyRow[]) {
  if (rows.length === 0) return 0;
  await runMigrations();
  const sql = getDb();
  for (const row of rows) {
    await sql`
      INSERT INTO google_ads_top_query_weekly (
        business_id,
        provider_account_id,
        week_start,
        week_end,
        query_hash,
        query_count_days,
        spend,
        revenue,
        conversions,
        impressions,
        clicks,
        updated_at
      )
      VALUES (
        ${row.businessId},
        ${row.providerAccountId},
        ${row.weekStart},
        ${row.weekEnd},
        ${row.queryHash},
        ${row.queryCountDays},
        ${row.spend},
        ${row.revenue},
        ${row.conversions},
        ${row.impressions},
        ${row.clicks},
        now()
      )
      ON CONFLICT (business_id, provider_account_id, week_start, query_hash)
      DO UPDATE SET
        week_end = EXCLUDED.week_end,
        query_count_days = EXCLUDED.query_count_days,
        spend = EXCLUDED.spend,
        revenue = EXCLUDED.revenue,
        conversions = EXCLUDED.conversions,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        updated_at = now()
    `;
  }
  return rows.length;
}

export async function upsertGoogleAdsSearchClusterDailyRows(rows: GoogleAdsSearchClusterDailyRow[]) {
  if (rows.length === 0) return 0;
  await runMigrations();
  const sql = getDb();
  for (const row of rows) {
    await sql`
      INSERT INTO google_ads_search_cluster_daily (
        business_id,
        provider_account_id,
        date,
        cluster_key,
        cluster_label,
        theme_key,
        dominant_intent_class,
        dominant_ownership_class,
        unique_query_count,
        spend,
        revenue,
        conversions,
        impressions,
        clicks,
        updated_at
      )
      VALUES (
        ${row.businessId},
        ${row.providerAccountId},
        ${row.date},
        ${row.clusterKey},
        ${row.clusterLabel},
        ${row.themeKey},
        ${row.dominantIntentClass},
        ${row.dominantOwnershipClass},
        ${row.uniqueQueryCount},
        ${row.spend},
        ${row.revenue},
        ${row.conversions},
        ${row.impressions},
        ${row.clicks},
        now()
      )
      ON CONFLICT (business_id, provider_account_id, date, cluster_key)
      DO UPDATE SET
        cluster_label = EXCLUDED.cluster_label,
        theme_key = EXCLUDED.theme_key,
        dominant_intent_class = EXCLUDED.dominant_intent_class,
        dominant_ownership_class = EXCLUDED.dominant_ownership_class,
        unique_query_count = EXCLUDED.unique_query_count,
        spend = EXCLUDED.spend,
        revenue = EXCLUDED.revenue,
        conversions = EXCLUDED.conversions,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        updated_at = now()
    `;
  }
  return rows.length;
}

export async function appendGoogleAdsDecisionActionOutcomeLog(input: GoogleAdsDecisionActionOutcomeLogRow) {
  await runMigrations();
  const sql = getDb();
  const rows = (await sql`
    INSERT INTO google_ads_decision_action_outcome_logs (
      business_id,
      provider_account_id,
      recommendation_fingerprint,
      decision_family,
      action_type,
      outcome_status,
      summary,
      payload_json,
      occurred_at,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.providerAccountId ?? null},
      ${input.recommendationFingerprint},
      ${input.decisionFamily ?? null},
      ${input.actionType},
      ${input.outcomeStatus ?? null},
      ${input.summary},
      ${JSON.stringify(input.payloadJson ?? {})}::jsonb,
      COALESCE(${input.occurredAt ?? null}, now()),
      now()
    )
    RETURNING id
  `) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

export async function persistGoogleAdsSearchIntelligenceFoundation(input: {
  businessId: string;
  providerAccountId: string;
  date: string;
  accountTimezone: string;
  accountCurrency: string;
  rows: Array<Partial<SearchTermPerformanceRow> & Record<string, unknown>>;
  sourceSnapshotId?: string | null;
}) {
  const dictionaryEntries = buildGoogleAdsQueryDictionaryEntries({
    date: input.date,
    rows: input.rows,
  });
  const hotDailyRows = buildGoogleAdsSearchQueryHotDailyRows({
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    date: input.date,
    accountTimezone: input.accountTimezone,
    accountCurrency: input.accountCurrency,
    sourceSnapshotId: input.sourceSnapshotId,
    rows: input.rows,
  });
  const clusterRows = buildGoogleAdsSearchClusterDailyRows({
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    date: input.date,
    rows: input.rows,
  });

  await upsertGoogleAdsQueryDictionaryEntries(dictionaryEntries);
  await upsertGoogleAdsSearchQueryHotDailyRows(hotDailyRows);
  const weeklyHotDailyRows = await readGoogleAdsSearchQueryHotDailyRows({
    businessId: input.businessId,
    providerAccountId: input.providerAccountId,
    startDate: isoWeekStart(input.date),
    endDate: isoWeekEnd(input.date),
  });
  const weeklyRows = buildGoogleAdsTopQueryWeeklyRowsFromHotDaily({ hotDailyRows: weeklyHotDailyRows });
  await upsertGoogleAdsTopQueryWeeklyRows(weeklyRows);
  await upsertGoogleAdsSearchClusterDailyRows(clusterRows);

  return {
    dictionaryEntryCount: dictionaryEntries.length,
    hotDailyRowCount: hotDailyRows.length,
    weeklyRowCount: weeklyRows.length,
    clusterRowCount: clusterRows.length,
  };
}

export async function readGoogleAdsTopQueryWeeklyRows(input: {
  businessId: string;
  providerAccountId?: string | null;
  startWeek: string;
  endWeek: string;
}) {
  await runMigrations();
  const sql = getDb();
  return sql`
    SELECT *
    FROM google_ads_top_query_weekly
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND week_start >= ${input.startWeek}
      AND week_start <= ${input.endWeek}
    ORDER BY week_start DESC, spend DESC
  `;
}

export async function readGoogleAdsSearchClusterDailyRows(input: {
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  await runMigrations();
  const sql = getDb();
  return sql`
    SELECT *
    FROM google_ads_search_cluster_daily
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND date >= ${input.startDate}
      AND date <= ${input.endDate}
    ORDER BY date DESC, spend DESC
  `;
}

export async function readGoogleAdsDecisionActionOutcomeLogs(input: {
  businessId: string;
  providerAccountId?: string | null;
  recommendationFingerprint?: string | null;
  limit?: number;
}) {
  await runMigrations();
  const sql = getDb();
  return sql`
    SELECT *
    FROM google_ads_decision_action_outcome_logs
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND (${input.recommendationFingerprint ?? null}::text IS NULL OR recommendation_fingerprint = ${input.recommendationFingerprint ?? null})
    ORDER BY occurred_at DESC
    LIMIT ${Math.max(1, Math.min(input.limit ?? 100, 500))}
  `;
}
