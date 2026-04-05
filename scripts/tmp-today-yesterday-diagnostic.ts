import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
process.env.ENABLE_RUNTIME_MIGRATIONS =
  process.env.ENABLE_RUNTIME_MIGRATIONS || "0";

import { getDb } from "@/lib/db";
import { getMetaRangePreparationContext } from "@/lib/meta/readiness";
import {
  getMetaWarehouseBreakdowns,
  getMetaWarehouseCampaignTable,
  getMetaWarehouseSummary,
} from "@/lib/meta/serving";
import {
  getGoogleAdsCampaignsReport,
  getGoogleAdsOverviewReport,
} from "@/lib/google-ads/serving";
import { readProviderAccountSnapshot } from "@/lib/provider-account-snapshots";
import { getProviderAccountAssignments } from "@/lib/provider-account-assignments";

function addDays(date: string, delta: number) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + delta);
  return next.toISOString().slice(0, 10);
}

function currentDateInTimeZone(timeZone: string | null | undefined) {
  if (!timeZone) return new Date().toISOString().slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

const sql = getDb();
const BUSINESSES = [
  { name: "Grandmix", id: "5dbc7147-f051-4681-a4d6-20617170074f" },
  { name: "IwaStore", id: "f8a3b5ac-588c-462f-8702-11cd24ff3cd2" },
  { name: "TheSwaf", id: "172d0ab8-495b-4679-a4c6-ffa404c389d3" },
  { name: "Halıcızade", id: "75f65b18-97e5-426c-a791-a8f693d34c84" },
] as const;

async function inspectMetaBusiness(business: (typeof BUSINESSES)[number]) {
  const context = await getMetaRangePreparationContext({
    businessId: business.id,
    startDate: "2000-01-01",
    endDate: "2000-01-01",
  });
  const today = context.currentDateInTimezone;
  const yesterday = today ? addDays(today, -1) : null;

  const partitionCountsByDay =
    today && yesterday
      ? await sql`
          SELECT
            partition_date::text AS day,
            status,
            COUNT(*)::int AS count
          FROM meta_sync_partitions
          WHERE business_id = ${business.id}
            AND partition_date IN (${today}::date, ${yesterday}::date)
          GROUP BY 1, 2
          ORDER BY 1 DESC, 2 ASC
        `
      : [];
  const partitionSample =
    today && yesterday
      ? await sql`
          SELECT
            id,
            partition_date::text AS partition_date,
            scope,
            lane,
            source,
            priority,
            status,
            updated_at::text AS updated_at,
            lease_expires_at::text AS lease_expires_at,
            finished_at::text AS finished_at
          FROM meta_sync_partitions
          WHERE business_id = ${business.id}
            AND partition_date IN (${today}::date, ${yesterday}::date)
          ORDER BY partition_date DESC, lane ASC, scope ASC, updated_at DESC
          LIMIT 20
        `
      : [];
  const expiredLeases =
    today && yesterday
      ? await sql`
          SELECT
            id,
            partition_date::text AS day,
            scope,
            lane,
            source,
            status,
            updated_at::text AS updated_at,
            lease_expires_at::text AS lease_expires_at
          FROM meta_sync_partitions
          WHERE business_id = ${business.id}
            AND partition_date IN (${today}::date, ${yesterday}::date)
            AND status = 'leased'
            AND lease_expires_at < now()
          ORDER BY lease_expires_at ASC
        `
      : [];

  const accountDailyCounts =
    today && yesterday
      ? await sql`
          SELECT
            date::text AS day,
            COUNT(*)::int AS count,
            MAX(updated_at)::text AS last_updated_at
          FROM meta_account_daily
          WHERE business_id = ${business.id}
            AND date IN (${today}::date, ${yesterday}::date)
          GROUP BY 1
          ORDER BY 1 DESC
        `
      : [];
  const campaignDailyCounts =
    today && yesterday
      ? await sql`
          SELECT
            date::text AS day,
            COUNT(*)::int AS count,
            MAX(updated_at)::text AS last_updated_at
          FROM meta_campaign_daily
          WHERE business_id = ${business.id}
            AND date IN (${today}::date, ${yesterday}::date)
          GROUP BY 1
          ORDER BY 1 DESC
        `
      : [];
  const adsetDailyCounts =
    today && yesterday
      ? await sql`
          SELECT
            date::text AS day,
            COUNT(*)::int AS count,
            MAX(updated_at)::text AS last_updated_at
          FROM meta_adset_daily
          WHERE business_id = ${business.id}
            AND date IN (${today}::date, ${yesterday}::date)
          GROUP BY 1
          ORDER BY 1 DESC
        `
      : [];
  const adDailyCounts =
    today && yesterday
      ? await sql`
          SELECT
            date::text AS day,
            COUNT(*)::int AS count,
            MAX(updated_at)::text AS last_updated_at
          FROM meta_ad_daily
          WHERE business_id = ${business.id}
            AND date IN (${today}::date, ${yesterday}::date)
          GROUP BY 1
          ORDER BY 1 DESC
        `
      : [];

  const summaryToday = today
    ? await getMetaWarehouseSummary({
        businessId: business.id,
        startDate: today,
        endDate: today,
      })
    : null;
  const campaignsToday = today
    ? await getMetaWarehouseCampaignTable({
        businessId: business.id,
        startDate: today,
        endDate: today,
        includePrev: true,
      })
    : [];
  const breakdownsToday = today
    ? await getMetaWarehouseBreakdowns({
        businessId: business.id,
        startDate: today,
        endDate: today,
      })
    : null;

  const summaryYesterday = yesterday
    ? await getMetaWarehouseSummary({
        businessId: business.id,
        startDate: yesterday,
        endDate: yesterday,
      })
    : null;
  const campaignsYesterday = yesterday
    ? await getMetaWarehouseCampaignTable({
        businessId: business.id,
        startDate: yesterday,
        endDate: yesterday,
        includePrev: true,
      })
    : [];
  const breakdownsYesterday = yesterday
    ? await getMetaWarehouseBreakdowns({
        businessId: business.id,
        startDate: yesterday,
        endDate: yesterday,
      })
    : null;

  return {
    timezone: context.primaryAccountTimezone,
    today,
    yesterday,
    partitionCountsByDay,
    todayYesterdayPartitionsSample: partitionSample,
    expiredLeases,
    warehouseCounts: {
      account_daily: accountDailyCounts,
      campaign_daily: campaignDailyCounts,
      adset_daily: adsetDailyCounts,
      ad_daily: adDailyCounts,
    },
    serving: {
      today: today
        ? {
            requested: { startDate: today, endDate: today },
            normalized: { startDate: today, endDate: today },
            summary: {
              isPartial: summaryToday?.isPartial,
              totals: summaryToday?.totals,
              freshness: summaryToday?.freshness,
            },
            campaigns: {
              rowCount: campaignsToday.length,
              topRows: campaignsToday.slice(0, 5).map((row) => ({
                id: row.id,
                name: row.name,
                spend: row.spend,
                bidStrategyLabel: row.bidStrategyLabel,
                dailyBudget: row.dailyBudget,
              })),
            },
            breakdowns: breakdownsToday
              ? {
                  age: breakdownsToday.age.length,
                  location: breakdownsToday.location.length,
                  placement: breakdownsToday.placement.length,
                }
              : null,
          }
        : null,
      yesterday: yesterday
        ? {
            requested: { startDate: yesterday, endDate: yesterday },
            normalized: { startDate: yesterday, endDate: yesterday },
            summary: {
              isPartial: summaryYesterday?.isPartial,
              totals: summaryYesterday?.totals,
              freshness: summaryYesterday?.freshness,
            },
            campaigns: {
              rowCount: campaignsYesterday.length,
              topRows: campaignsYesterday.slice(0, 5).map((row) => ({
                id: row.id,
                name: row.name,
                spend: row.spend,
                bidStrategyLabel: row.bidStrategyLabel,
                dailyBudget: row.dailyBudget,
              })),
            },
            breakdowns: breakdownsYesterday
              ? {
                  age: breakdownsYesterday.age.length,
                  location: breakdownsYesterday.location.length,
                  placement: breakdownsYesterday.placement.length,
                }
              : null,
          }
        : null,
    },
  };
}

async function inspectGoogleBusiness(business: (typeof BUSINESSES)[number]) {
  const [assignments, snapshot] = await Promise.all([
    getProviderAccountAssignments(business.id, "google").catch(() => null),
    readProviderAccountSnapshot({
      businessId: business.id,
      provider: "google",
    }).catch(() => null),
  ]);
  const primaryAccountId = assignments?.account_ids?.[0] ?? null;
  const timezone =
    snapshot?.accounts.find((account) => account.id === primaryAccountId)
      ?.timezone ?? "UTC";
  const today = currentDateInTimeZone(timezone);
  const yesterday = addDays(today, -1);

  const partitionCountsByDay = await sql`
    SELECT
      partition_date::text AS day,
      status,
      COUNT(*)::int AS count
    FROM google_ads_sync_partitions
    WHERE business_id = ${business.id}
      AND partition_date IN (${today}::date, ${yesterday}::date)
    GROUP BY 1, 2
    ORDER BY 1 DESC, 2 ASC
  `;
  const partitionSample = await sql`
    SELECT
      id,
      partition_date::text AS partition_date,
      scope,
      lane,
      source,
      priority,
      status,
      updated_at::text AS updated_at,
      lease_expires_at::text AS lease_expires_at,
      finished_at::text AS finished_at,
      attempt_count,
      next_retry_at::text AS next_retry_at
    FROM google_ads_sync_partitions
    WHERE business_id = ${business.id}
      AND partition_date IN (${today}::date, ${yesterday}::date)
    ORDER BY partition_date DESC, lane ASC, scope ASC, updated_at DESC
    LIMIT 20
  `;
  const expiredLeases = await sql`
    SELECT
      id,
      partition_date::text AS day,
      scope,
      lane,
      source,
      status,
      updated_at::text AS updated_at,
      lease_expires_at::text AS lease_expires_at
    FROM google_ads_sync_partitions
    WHERE business_id = ${business.id}
      AND partition_date IN (${today}::date, ${yesterday}::date)
      AND status = 'leased'
      AND lease_expires_at < now()
    ORDER BY lease_expires_at ASC
  `;
  const accountDailyCounts = await sql`
    SELECT
      date::text AS day,
      COUNT(*)::int AS count,
      MAX(updated_at)::text AS last_updated_at
    FROM google_ads_account_daily
    WHERE business_id = ${business.id}
      AND date IN (${today}::date, ${yesterday}::date)
    GROUP BY 1
    ORDER BY 1 DESC
  `;
  const campaignDailyCounts = await sql`
    SELECT
      date::text AS day,
      COUNT(*)::int AS count,
      MAX(updated_at)::text AS last_updated_at
    FROM google_ads_campaign_daily
    WHERE business_id = ${business.id}
      AND date IN (${today}::date, ${yesterday}::date)
    GROUP BY 1
    ORDER BY 1 DESC
  `;

  const overviewToday = await getGoogleAdsOverviewReport({
    businessId: business.id,
    dateRange: "custom",
    customStart: today,
    customEnd: today,
    compareMode: "none",
  });
  const campaignsToday = await getGoogleAdsCampaignsReport({
    businessId: business.id,
    dateRange: "custom",
    customStart: today,
    customEnd: today,
    compareMode: "none",
  });
  const overviewYesterday = await getGoogleAdsOverviewReport({
    businessId: business.id,
    dateRange: "custom",
    customStart: yesterday,
    customEnd: yesterday,
    compareMode: "none",
  });
  const campaignsYesterday = await getGoogleAdsCampaignsReport({
    businessId: business.id,
    dateRange: "custom",
    customStart: yesterday,
    customEnd: yesterday,
    compareMode: "none",
  });

  return {
    timezone,
    today,
    yesterday,
    partitionCountsByDay,
    todayYesterdayPartitionsSample: partitionSample,
    expiredLeases,
    warehouseCounts: {
      account_daily: accountDailyCounts,
      campaign_daily: campaignDailyCounts,
    },
    serving: {
      today: {
        requested: { startDate: today, endDate: today },
        normalized: { startDate: today, endDate: today },
        overview: {
          kpis: overviewToday.kpis,
          meta: overviewToday.meta,
          topCampaignCount: overviewToday.topCampaigns.length,
        },
        campaigns: {
          rowCount: campaignsToday.rows.length,
          summary: campaignsToday.summary,
          meta: campaignsToday.meta,
          topRows: campaignsToday.rows.slice(0, 5).map((row: any) => ({
            id: row.id,
            name: row.name,
            spend: row.spend,
            status: row.status,
          })),
        },
      },
      yesterday: {
        requested: { startDate: yesterday, endDate: yesterday },
        normalized: { startDate: yesterday, endDate: yesterday },
        overview: {
          kpis: overviewYesterday.kpis,
          meta: overviewYesterday.meta,
          topCampaignCount: overviewYesterday.topCampaigns.length,
        },
        campaigns: {
          rowCount: campaignsYesterday.rows.length,
          summary: campaignsYesterday.summary,
          meta: campaignsYesterday.meta,
          topRows: campaignsYesterday.rows.slice(0, 5).map((row: any) => ({
            id: row.id,
            name: row.name,
            spend: row.spend,
            status: row.status,
          })),
        },
      },
    },
  };
}

async function main() {
  const result: Record<string, unknown> = {
    capturedAt: new Date().toISOString(),
    businesses: {},
  };

  for (const business of BUSINESSES) {
    (result.businesses as Record<string, unknown>)[business.name] = {
      meta: await inspectMetaBusiness(business),
      google: await inspectGoogleBusiness(business),
    };
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
