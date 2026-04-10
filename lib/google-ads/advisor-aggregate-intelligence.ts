import {
  normalizeGoogleAdsQueryText,
  readGoogleAdsSearchClusterDailyRows,
  readGoogleAdsTopQueryWeeklyRows,
  type GoogleAdsSearchClusterDailySupportReadRow,
  type GoogleAdsTopQueryWeeklySupportReadRow,
} from "@/lib/google-ads/search-intelligence-storage";
import type {
  GoogleAdvisorAggregateClusterSupport,
  GoogleAdvisorAggregateIntelligence,
  GoogleAdvisorAggregateWeeklyQuerySupport,
} from "@/lib/google-ads/growth-advisor-types";

function normalizeDate(value: string) {
  return value.slice(0, 10);
}

function isoWeekStart(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setUTCDate(value.getUTCDate() + diff);
  return value.toISOString().slice(0, 10);
}

function toQueryDisplayValue(row: GoogleAdsTopQueryWeeklySupportReadRow) {
  return String(row.displayQuery ?? row.normalizedQuery ?? row.queryHash).trim();
}

function summarizeQueryWeeklySupport(
  rows: GoogleAdsTopQueryWeeklySupportReadRow[]
): GoogleAdvisorAggregateWeeklyQuerySupport[] {
  const grouped = new Map<
    string,
    GoogleAdvisorAggregateWeeklyQuerySupport & { weeks: Set<string> }
  >();

  for (const row of rows) {
    const normalizedQuery = normalizeGoogleAdsQueryText(
      row.normalizedQuery ?? row.displayQuery ?? row.queryHash
    );
    if (!normalizedQuery) continue;
    const key = normalizedQuery;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        normalizedQuery,
        displayQuery: toQueryDisplayValue(row),
        weeksPresent: 1,
        totalSpend: row.spend,
        totalRevenue: row.revenue,
        totalConversions: row.conversions,
        totalClicks: row.clicks,
        lastWeekEnd: normalizeDate(row.weekEnd),
        weeks: new Set([normalizeDate(row.weekStart)]),
      });
      continue;
    }

    existing.weeks.add(normalizeDate(row.weekStart));
    existing.weeksPresent = existing.weeks.size;
    existing.totalSpend += row.spend;
    existing.totalRevenue += row.revenue;
    existing.totalConversions += row.conversions;
    existing.totalClicks += row.clicks;
    if (normalizeDate(row.weekEnd).localeCompare(existing.lastWeekEnd) > 0) {
      existing.lastWeekEnd = normalizeDate(row.weekEnd);
      existing.displayQuery = toQueryDisplayValue(row);
    }
  }

  return Array.from(grouped.values())
    .map(({ weeks: _weeks, ...row }) => row)
    .sort(
      (left, right) =>
        right.weeksPresent - left.weeksPresent ||
        right.totalSpend - left.totalSpend ||
        right.totalConversions - left.totalConversions
    );
}

function summarizeClusterDailySupport(
  rows: GoogleAdsSearchClusterDailySupportReadRow[]
): GoogleAdvisorAggregateClusterSupport[] {
  const grouped = new Map<
    string,
    GoogleAdvisorAggregateClusterSupport & { days: Set<string> }
  >();

  for (const row of rows) {
    const key = String(row.clusterKey).trim() || String(row.clusterLabel).trim();
    if (!key) continue;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        clusterKey: String(row.clusterKey).trim(),
        clusterLabel: String(row.clusterLabel).trim(),
        themeKey: row.themeKey ?? null,
        dominantIntentClass: row.dominantIntentClass ?? null,
        dominantOwnershipClass: row.dominantOwnershipClass ?? null,
        daysPresent: 1,
        totalUniqueQueries: row.uniqueQueryCount,
        totalSpend: row.spend,
        totalRevenue: row.revenue,
        totalConversions: row.conversions,
        totalClicks: row.clicks,
        lastSeenDate: normalizeDate(row.date),
        days: new Set([normalizeDate(row.date)]),
      });
      continue;
    }

    existing.days.add(normalizeDate(row.date));
    existing.daysPresent = existing.days.size;
    existing.totalUniqueQueries += row.uniqueQueryCount;
    existing.totalSpend += row.spend;
    existing.totalRevenue += row.revenue;
    existing.totalConversions += row.conversions;
    existing.totalClicks += row.clicks;
    if (normalizeDate(row.date).localeCompare(existing.lastSeenDate) > 0) {
      existing.lastSeenDate = normalizeDate(row.date);
      existing.clusterLabel = String(row.clusterLabel).trim();
      existing.themeKey = row.themeKey ?? existing.themeKey;
      existing.dominantIntentClass =
        row.dominantIntentClass ?? existing.dominantIntentClass;
      existing.dominantOwnershipClass =
        row.dominantOwnershipClass ?? existing.dominantOwnershipClass;
    }
  }

  return Array.from(grouped.values())
    .map(({ days: _days, ...row }) => row)
    .sort(
      (left, right) =>
        right.daysPresent - left.daysPresent ||
        right.totalSpend - left.totalSpend ||
        right.totalConversions - left.totalConversions
    );
}

export function summarizeGoogleAdsAdvisorAggregateIntelligence(input: {
  queryWeeklyRows: GoogleAdsTopQueryWeeklySupportReadRow[];
  clusterDailyRows: GoogleAdsSearchClusterDailySupportReadRow[];
  supportWindowStart: string;
  supportWindowEnd: string;
}): GoogleAdvisorAggregateIntelligence {
  const queryWeeklySupport = summarizeQueryWeeklySupport(input.queryWeeklyRows);
  const clusterDailySupport = summarizeClusterDailySupport(input.clusterDailyRows);

  const topQueryWeeklyAvailable = queryWeeklySupport.length > 0;
  const clusterDailyAvailable = clusterDailySupport.length > 0;
  const note =
    topQueryWeeklyAvailable && clusterDailyAvailable
      ? "Persisted weekly top-query and daily cluster aggregates are loaded as supplemental support."
      : topQueryWeeklyAvailable
        ? "Persisted weekly top-query aggregates are loaded as supplemental support."
        : clusterDailyAvailable
          ? "Persisted daily cluster aggregates are loaded as supplemental support."
          : "No persisted aggregate query or cluster support was available for this advisor run.";

  return {
    queryWeeklySupport,
    clusterDailySupport,
    metadata: {
      topQueryWeeklyAvailable,
      clusterDailyAvailable,
      queryWeeklyRows: input.queryWeeklyRows.length,
      clusterDailyRows: input.clusterDailyRows.length,
      supportWindowStart: normalizeDate(input.supportWindowStart),
      supportWindowEnd: normalizeDate(input.supportWindowEnd),
      note,
    },
  };
}

export async function loadGoogleAdsAdvisorAggregateIntelligence(input: {
  businessId: string;
  providerAccountId?: string | null;
  supportWindowStart: string;
  supportWindowEnd: string;
}): Promise<GoogleAdvisorAggregateIntelligence> {
  const [queryWeeklyRows, clusterDailyRows] = await Promise.all([
    readGoogleAdsTopQueryWeeklyRows({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId ?? null,
      startWeek: isoWeekStart(input.supportWindowStart),
      endWeek: isoWeekStart(input.supportWindowEnd),
    }),
    readGoogleAdsSearchClusterDailyRows({
      businessId: input.businessId,
      providerAccountId: input.providerAccountId ?? null,
      startDate: input.supportWindowStart,
      endDate: input.supportWindowEnd,
    }),
  ]);

  return summarizeGoogleAdsAdvisorAggregateIntelligence({
    queryWeeklyRows,
    clusterDailyRows,
    supportWindowStart: input.supportWindowStart,
    supportWindowEnd: input.supportWindowEnd,
  });
}
