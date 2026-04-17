import { getDb } from "@/lib/db";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import type { MetaPreviousConfigDiff } from "@/lib/meta/config-snapshots";
import type { MetaConfigSnapshotPayload } from "@/lib/meta/configuration";

export interface MetaCampaignDimensionRecord {
  businessId: string;
  businessRefId: string | null;
  providerAccountId: string;
  providerAccountRefId: string | null;
  campaignId: string;
  campaignNameCurrent: string | null;
  campaignNameHistorical: string | null;
  campaignStatus: string | null;
  buyingType: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sourceUpdatedAt: string | null;
}

export interface MetaAdSetDimensionRecord {
  businessId: string;
  businessRefId: string | null;
  providerAccountId: string;
  providerAccountRefId: string | null;
  campaignId: string | null;
  adsetId: string;
  adsetNameCurrent: string | null;
  adsetNameHistorical: string | null;
  adsetStatus: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sourceUpdatedAt: string | null;
}

export interface MetaAdDimensionRecord {
  businessId: string;
  businessRefId: string | null;
  providerAccountId: string;
  providerAccountRefId: string | null;
  campaignId: string | null;
  adsetId: string | null;
  adId: string;
  adNameCurrent: string | null;
  adNameHistorical: string | null;
  adStatus: string | null;
  creativeId: string | null;
  projectionJson: unknown;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sourceUpdatedAt: string | null;
}

export interface MetaCreativeDimensionRecord {
  businessId: string;
  businessRefId: string | null;
  providerAccountId: string;
  providerAccountRefId: string | null;
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
  creativeId: string;
  creativeName: string | null;
  headline: string | null;
  primaryText: string | null;
  destinationUrl: string | null;
  thumbnailUrl: string | null;
  assetType: string | null;
  projectionJson: unknown;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sourceUpdatedAt: string | null;
}

async function schemaReady(tables: string[]) {
  const readiness = await getDbSchemaReadiness({ tables });
  return readiness.ready;
}

async function readLatestConfigHistory(input: {
  tableName: "meta_campaign_config_history" | "meta_adset_config_history";
  entityColumn: "campaign_id" | "adset_id";
  businessId: string;
  entityIds: string[];
}) {
  const entityIds = Array.from(new Set(input.entityIds.filter(Boolean)));
  if (entityIds.length === 0) return new Map<string, MetaConfigSnapshotPayload>();
  if (!(await schemaReady([input.tableName]))) return new Map();

  const sql = getDb();
  const rows = await sql.query(
    `
      WITH ranked AS (
        SELECT
          ${input.entityColumn} AS entity_id,
          objective,
          optimization_goal,
          bid_strategy_type,
          bid_strategy_label,
          manual_bid_amount,
          bid_value,
          bid_value_format,
          daily_budget,
          lifetime_budget,
          is_budget_mixed,
          is_config_mixed,
          is_optimization_goal_mixed,
          is_bid_strategy_mixed,
          is_bid_value_mixed,
          ROW_NUMBER() OVER (
            PARTITION BY ${input.entityColumn}
            ORDER BY captured_at DESC, created_at DESC
          ) AS row_num
        FROM ${input.tableName}
        WHERE business_id = $1
          AND ${input.entityColumn} = ANY($2::text[])
      )
      SELECT *
      FROM ranked
      WHERE row_num = 1
    `,
    [input.businessId, entityIds],
  ) as Array<{
    entity_id: string;
    objective: string | null;
    optimization_goal: string | null;
    bid_strategy_type: string | null;
    bid_strategy_label: string | null;
    manual_bid_amount: number | null;
    bid_value: number | null;
    bid_value_format: "currency" | "roas" | null;
    daily_budget: number | null;
    lifetime_budget: number | null;
    is_budget_mixed: boolean;
    is_config_mixed: boolean;
    is_optimization_goal_mixed: boolean;
    is_bid_strategy_mixed: boolean;
    is_bid_value_mixed: boolean;
  }>;

  return new Map(
    rows.map((row) => [
      row.entity_id,
      {
        objective: row.objective,
        optimizationGoal: row.optimization_goal,
        bidStrategyType: row.bid_strategy_type,
        bidStrategyLabel: row.bid_strategy_label,
        manualBidAmount: row.manual_bid_amount,
        bidValue: row.bid_value,
        bidValueFormat: row.bid_value_format,
        dailyBudget: row.daily_budget,
        lifetimeBudget: row.lifetime_budget,
        isBudgetMixed: row.is_budget_mixed,
        isConfigMixed: row.is_config_mixed,
        isOptimizationGoalMixed: row.is_optimization_goal_mixed,
        isBidStrategyMixed: row.is_bid_strategy_mixed,
        isBidValueMixed: row.is_bid_value_mixed,
      } satisfies MetaConfigSnapshotPayload,
    ]),
  );
}

async function readPreviousDifferentConfigHistory(input: {
  tableName: "meta_campaign_config_history" | "meta_adset_config_history";
  entityColumn: "campaign_id" | "adset_id";
  businessId: string;
  entityIds: string[];
}) {
  const entityIds = Array.from(new Set(input.entityIds.filter(Boolean)));
  if (entityIds.length === 0) return new Map<string, MetaPreviousConfigDiff>();
  if (!(await schemaReady([input.tableName]))) return new Map();

  const sql = getDb();
  const rows = await sql.query(
    `
      SELECT
        ${input.entityColumn} AS entity_id,
        captured_at,
        manual_bid_amount,
        bid_value,
        bid_value_format,
        daily_budget,
        lifetime_budget
      FROM ${input.tableName}
      WHERE business_id = $1
        AND ${input.entityColumn} = ANY($2::text[])
      ORDER BY ${input.entityColumn} ASC, captured_at DESC, created_at DESC
    `,
    [input.businessId, entityIds],
  ) as Array<{
    entity_id: string;
    captured_at: string;
    manual_bid_amount: number | null;
    bid_value: number | null;
    bid_value_format: "currency" | "roas" | null;
    daily_budget: number | null;
    lifetime_budget: number | null;
  }>;

  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const existing = grouped.get(row.entity_id) ?? [];
    existing.push(row);
    grouped.set(row.entity_id, existing);
  }

  const result = new Map<string, MetaPreviousConfigDiff>();
  for (const entityId of entityIds) {
    const history = grouped.get(entityId) ?? [];
    const current = history[0];
    if (!current) continue;

    let previousBid: (typeof history)[number] | null = null;
    let previousBudget: (typeof history)[number] | null = null;

    for (const row of history.slice(1)) {
      if (
        previousBid == null &&
        (
          row.manual_bid_amount !== current.manual_bid_amount ||
          row.bid_value !== current.bid_value ||
          row.bid_value_format !== current.bid_value_format
        )
      ) {
        previousBid = row;
      }
      if (
        previousBudget == null &&
        (
          row.daily_budget !== current.daily_budget ||
          row.lifetime_budget !== current.lifetime_budget
        )
      ) {
        previousBudget = row;
      }
      if (previousBid && previousBudget) break;
    }

    result.set(entityId, {
      previousManualBidAmount: previousBid?.manual_bid_amount ?? null,
      previousBidValue: previousBid?.bid_value ?? null,
      previousBidValueFormat: previousBid?.bid_value_format ?? null,
      previousBidCapturedAt: previousBid?.captured_at ?? null,
      previousDailyBudget: previousBudget?.daily_budget ?? null,
      previousLifetimeBudget: previousBudget?.lifetime_budget ?? null,
      previousBudgetCapturedAt: previousBudget?.captured_at ?? null,
    });
  }

  return result;
}

async function readDimensionsByIds<T>(input: {
  tableName:
    | "meta_campaign_dimensions"
    | "meta_adset_dimensions"
    | "meta_ad_dimensions"
    | "meta_creative_dimensions";
  entityColumn: "campaign_id" | "adset_id" | "ad_id" | "creative_id";
  businessId: string;
  entityIds: string[];
}): Promise<T[]> {
  const entityIds = Array.from(new Set(input.entityIds.filter(Boolean)));
  if (entityIds.length === 0) return [];
  if (!(await schemaReady([input.tableName]))) return [];

  const sql = getDb();
  return (await sql.query(
    `
      SELECT *
      FROM ${input.tableName}
      WHERE business_id = $1
        AND ${input.entityColumn} = ANY($2::text[])
    `,
    [input.businessId, entityIds],
  )) as T[];
}

export async function readLatestMetaCampaignConfigHistory(input: {
  businessId: string;
  campaignIds: string[];
}) {
  return readLatestConfigHistory({
    tableName: "meta_campaign_config_history",
    entityColumn: "campaign_id",
    businessId: input.businessId,
    entityIds: input.campaignIds,
  });
}

export async function readLatestMetaAdSetConfigHistory(input: {
  businessId: string;
  adsetIds: string[];
}) {
  return readLatestConfigHistory({
    tableName: "meta_adset_config_history",
    entityColumn: "adset_id",
    businessId: input.businessId,
    entityIds: input.adsetIds,
  });
}

export async function readPreviousDifferentMetaCampaignConfigHistoryDiffs(input: {
  businessId: string;
  campaignIds: string[];
}) {
  return readPreviousDifferentConfigHistory({
    tableName: "meta_campaign_config_history",
    entityColumn: "campaign_id",
    businessId: input.businessId,
    entityIds: input.campaignIds,
  });
}

export async function readPreviousDifferentMetaAdSetConfigHistoryDiffs(input: {
  businessId: string;
  adsetIds: string[];
}) {
  return readPreviousDifferentConfigHistory({
    tableName: "meta_adset_config_history",
    entityColumn: "adset_id",
    businessId: input.businessId,
    entityIds: input.adsetIds,
  });
}

export async function readMetaCampaignDimensions(input: {
  businessId: string;
  campaignIds: string[];
}) {
  const rows = await readDimensionsByIds<{
    business_id: string;
    business_ref_id: string | null;
    provider_account_id: string;
    provider_account_ref_id: string | null;
    campaign_id: string;
    campaign_name_current: string | null;
    campaign_name_historical: string | null;
    campaign_status: string | null;
    buying_type: string | null;
    first_seen_at: string | null;
    last_seen_at: string | null;
    source_updated_at: string | null;
  }>({
    tableName: "meta_campaign_dimensions",
    entityColumn: "campaign_id",
    businessId: input.businessId,
    entityIds: input.campaignIds,
  });
  return new Map<string, MetaCampaignDimensionRecord>(
    rows.map((row) => [
      row.campaign_id,
      {
        businessId: row.business_id,
        businessRefId: row.business_ref_id,
        providerAccountId: row.provider_account_id,
        providerAccountRefId: row.provider_account_ref_id,
        campaignId: row.campaign_id,
        campaignNameCurrent: row.campaign_name_current,
        campaignNameHistorical: row.campaign_name_historical,
        campaignStatus: row.campaign_status,
        buyingType: row.buying_type,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        sourceUpdatedAt: row.source_updated_at,
      },
    ]),
  );
}

export async function readMetaAdSetDimensions(input: {
  businessId: string;
  adsetIds: string[];
}) {
  const rows = await readDimensionsByIds<{
    business_id: string;
    business_ref_id: string | null;
    provider_account_id: string;
    provider_account_ref_id: string | null;
    campaign_id: string | null;
    adset_id: string;
    adset_name_current: string | null;
    adset_name_historical: string | null;
    adset_status: string | null;
    first_seen_at: string | null;
    last_seen_at: string | null;
    source_updated_at: string | null;
  }>({
    tableName: "meta_adset_dimensions",
    entityColumn: "adset_id",
    businessId: input.businessId,
    entityIds: input.adsetIds,
  });
  return new Map<string, MetaAdSetDimensionRecord>(
    rows.map((row) => [
      row.adset_id,
      {
        businessId: row.business_id,
        businessRefId: row.business_ref_id,
        providerAccountId: row.provider_account_id,
        providerAccountRefId: row.provider_account_ref_id,
        campaignId: row.campaign_id,
        adsetId: row.adset_id,
        adsetNameCurrent: row.adset_name_current,
        adsetNameHistorical: row.adset_name_historical,
        adsetStatus: row.adset_status,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        sourceUpdatedAt: row.source_updated_at,
      },
    ]),
  );
}

export async function readMetaAdDimensions(input: {
  businessId: string;
  adIds: string[];
}) {
  const rows = await readDimensionsByIds<{
    business_id: string;
    business_ref_id: string | null;
    provider_account_id: string;
    provider_account_ref_id: string | null;
    campaign_id: string | null;
    adset_id: string | null;
    ad_id: string;
    ad_name_current: string | null;
    ad_name_historical: string | null;
    ad_status: string | null;
    creative_id: string | null;
    projection_json: unknown;
    first_seen_at: string | null;
    last_seen_at: string | null;
    source_updated_at: string | null;
  }>({
    tableName: "meta_ad_dimensions",
    entityColumn: "ad_id",
    businessId: input.businessId,
    entityIds: input.adIds,
  });
  return new Map<string, MetaAdDimensionRecord>(
    rows.map((row) => [
      row.ad_id,
      {
        businessId: row.business_id,
        businessRefId: row.business_ref_id,
        providerAccountId: row.provider_account_id,
        providerAccountRefId: row.provider_account_ref_id,
        campaignId: row.campaign_id,
        adsetId: row.adset_id,
        adId: row.ad_id,
        adNameCurrent: row.ad_name_current,
        adNameHistorical: row.ad_name_historical,
        adStatus: row.ad_status,
        creativeId: row.creative_id,
        projectionJson: row.projection_json,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        sourceUpdatedAt: row.source_updated_at,
      },
    ]),
  );
}

export async function readMetaCreativeDimensions(input: {
  businessId: string;
  creativeIds: string[];
}) {
  const rows = await readDimensionsByIds<{
    business_id: string;
    business_ref_id: string | null;
    provider_account_id: string;
    provider_account_ref_id: string | null;
    campaign_id: string | null;
    adset_id: string | null;
    ad_id: string | null;
    creative_id: string;
    creative_name: string | null;
    headline: string | null;
    primary_text: string | null;
    destination_url: string | null;
    thumbnail_url: string | null;
    asset_type: string | null;
    projection_json: unknown;
    first_seen_at: string | null;
    last_seen_at: string | null;
    source_updated_at: string | null;
  }>({
    tableName: "meta_creative_dimensions",
    entityColumn: "creative_id",
    businessId: input.businessId,
    entityIds: input.creativeIds,
  });
  return new Map<string, MetaCreativeDimensionRecord>(
    rows.map((row) => [
      row.creative_id,
      {
        businessId: row.business_id,
        businessRefId: row.business_ref_id,
        providerAccountId: row.provider_account_id,
        providerAccountRefId: row.provider_account_ref_id,
        campaignId: row.campaign_id,
        adsetId: row.adset_id,
        adId: row.ad_id,
        creativeId: row.creative_id,
        creativeName: row.creative_name,
        headline: row.headline,
        primaryText: row.primary_text,
        destinationUrl: row.destination_url,
        thumbnailUrl: row.thumbnail_url,
        assetType: row.asset_type,
        projectionJson: row.projection_json,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        sourceUpdatedAt: row.source_updated_at,
      },
    ]),
  );
}
