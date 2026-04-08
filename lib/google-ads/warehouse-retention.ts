import { addDaysToIsoDate } from "@/lib/google-ads/history";

export type GoogleAdsRetentionTier =
  | "core_daily"
  | "breakdown_daily"
  | "creative_daily"
  | "raw_search_terms_hot"
  | "top_queries_weekly"
  | "search_cluster_aggregate"
  | "decision_action_outcome_log";

export interface GoogleAdsRetentionPolicyEntry {
  tier: GoogleAdsRetentionTier;
  label: string;
  retentionDays: number;
  tableNames: string[];
  grain: "daily" | "weekly" | "event";
  storageTemperature: "hot" | "warm" | "cold";
}

export interface GoogleAdsRetentionDryRunRow {
  tier: GoogleAdsRetentionTier;
  tableName: string;
  retentionDays: number;
  cutoffDate: string;
  executionEnabled: boolean;
}

const DAYS_PER_MONTH = 30.4375;

function monthsToDays(months: number) {
  return Math.round(months * DAYS_PER_MONTH);
}

export const GOOGLE_ADS_RETENTION_POLICY: Record<
  GoogleAdsRetentionTier,
  GoogleAdsRetentionPolicyEntry
> = {
  core_daily: {
    tier: "core_daily",
    label: "Core daily",
    retentionDays: monthsToDays(25),
    tableNames: [
      "google_ads_account_daily",
      "google_ads_campaign_daily",
      "google_ads_keyword_daily",
      "google_ads_product_daily",
    ],
    grain: "daily",
    storageTemperature: "warm",
  },
  breakdown_daily: {
    tier: "breakdown_daily",
    label: "Breakdown daily",
    retentionDays: monthsToDays(13),
    tableNames: [
      "google_ads_geo_daily",
      "google_ads_device_daily",
      "google_ads_audience_daily",
      "google_ads_ad_group_daily",
      "google_ads_asset_group_daily",
    ],
    grain: "daily",
    storageTemperature: "warm",
  },
  creative_daily: {
    tier: "creative_daily",
    label: "Creative daily",
    retentionDays: 180,
    tableNames: ["google_ads_ad_daily", "google_ads_asset_daily"],
    grain: "daily",
    storageTemperature: "hot",
  },
  raw_search_terms_hot: {
    tier: "raw_search_terms_hot",
    label: "Raw search terms daily hot",
    retentionDays: 120,
    tableNames: ["google_ads_search_query_hot_daily"],
    grain: "daily",
    storageTemperature: "hot",
  },
  top_queries_weekly: {
    tier: "top_queries_weekly",
    label: "Top queries weekly",
    retentionDays: 365,
    tableNames: ["google_ads_top_query_weekly"],
    grain: "weekly",
    storageTemperature: "warm",
  },
  search_cluster_aggregate: {
    tier: "search_cluster_aggregate",
    label: "Search cluster/theme aggregate",
    retentionDays: monthsToDays(25),
    tableNames: ["google_ads_search_cluster_daily"],
    grain: "daily",
    storageTemperature: "warm",
  },
  decision_action_outcome_log: {
    tier: "decision_action_outcome_log",
    label: "Decision action/outcome log",
    retentionDays: monthsToDays(25),
    tableNames: ["google_ads_decision_action_outcome_logs"],
    grain: "event",
    storageTemperature: "warm",
  },
};

function readBooleanFlag(name: "GOOGLE_ADS_RETENTION_EXECUTION_ENABLED", fallback: boolean, env: NodeJS.ProcessEnv = process.env) {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return fallback;
}

export function isGoogleAdsRetentionExecutionEnabled(env: NodeJS.ProcessEnv = process.env) {
  return readBooleanFlag("GOOGLE_ADS_RETENTION_EXECUTION_ENABLED", false, env);
}

export function buildGoogleAdsRetentionDryRun(asOfDate: string, env: NodeJS.ProcessEnv = process.env): GoogleAdsRetentionDryRunRow[] {
  const executionEnabled = isGoogleAdsRetentionExecutionEnabled(env);
  return Object.values(GOOGLE_ADS_RETENTION_POLICY).flatMap((entry) =>
    entry.tableNames.map((tableName) => ({
      tier: entry.tier,
      tableName,
      retentionDays: entry.retentionDays,
      cutoffDate: addDaysToIsoDate(asOfDate, -entry.retentionDays),
      executionEnabled,
    }))
  );
}

export async function executeGoogleAdsRetentionPolicyDryRunOnly(input: {
  asOfDate: string;
  env?: NodeJS.ProcessEnv;
}) {
  return {
    executionEnabled: isGoogleAdsRetentionExecutionEnabled(input.env),
    dryRun: buildGoogleAdsRetentionDryRun(input.asOfDate, input.env),
  };
}
