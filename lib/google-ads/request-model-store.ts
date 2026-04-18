import { getDb } from "@/lib/db";
import { getDbSchemaReadiness } from "@/lib/db-schema-readiness";

export interface GoogleAdsCampaignDimensionRecord {
  businessId: string;
  businessRefId: string | null;
  providerAccountId: string;
  providerAccountRefId: string | null;
  campaignId: string;
  campaignName: string | null;
  normalizedStatus: string | null;
  channel: string | null;
  projectionJson: unknown;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sourceUpdatedAt: string | null;
}

export interface GoogleAdsAdGroupDimensionRecord {
  businessId: string;
  businessRefId: string | null;
  providerAccountId: string;
  providerAccountRefId: string | null;
  campaignId: string | null;
  adGroupId: string;
  adGroupName: string | null;
  normalizedStatus: string | null;
  projectionJson: unknown;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sourceUpdatedAt: string | null;
}

export interface GoogleAdsAdDimensionRecord {
  businessId: string;
  businessRefId: string | null;
  providerAccountId: string;
  providerAccountRefId: string | null;
  campaignId: string | null;
  adGroupId: string | null;
  adId: string;
  adName: string | null;
  normalizedStatus: string | null;
  projectionJson: unknown;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sourceUpdatedAt: string | null;
}

export interface GoogleAdsKeywordDimensionRecord {
  businessId: string;
  businessRefId: string | null;
  providerAccountId: string;
  providerAccountRefId: string | null;
  campaignId: string | null;
  adGroupId: string | null;
  keywordId: string;
  keywordText: string | null;
  normalizedStatus: string | null;
  projectionJson: unknown;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sourceUpdatedAt: string | null;
}

export interface GoogleAdsAssetGroupDimensionRecord {
  businessId: string;
  businessRefId: string | null;
  providerAccountId: string;
  providerAccountRefId: string | null;
  campaignId: string | null;
  assetGroupId: string;
  assetGroupName: string | null;
  normalizedStatus: string | null;
  projectionJson: unknown;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sourceUpdatedAt: string | null;
}

export interface GoogleAdsProductDimensionRecord {
  businessId: string;
  businessRefId: string | null;
  providerAccountId: string;
  providerAccountRefId: string | null;
  campaignId: string | null;
  productKey: string;
  productTitle: string | null;
  normalizedStatus: string | null;
  projectionJson: unknown;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sourceUpdatedAt: string | null;
}

export interface GoogleAdsCampaignStateHistoryRecord {
  businessId: string;
  businessRefId: string | null;
  providerAccountId: string;
  providerAccountRefId: string | null;
  campaignId: string;
  stateFingerprint: string;
  campaignName: string | null;
  normalizedStatus: string | null;
  channel: string | null;
  projectionJson: unknown;
  sourceKind: string;
  sourceSnapshotId: string | null;
  capturedAt: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export interface GoogleAdsAdGroupStateHistoryRecord {
  businessId: string;
  businessRefId: string | null;
  providerAccountId: string;
  providerAccountRefId: string | null;
  campaignId: string | null;
  adGroupId: string;
  stateFingerprint: string;
  adGroupName: string | null;
  normalizedStatus: string | null;
  projectionJson: unknown;
  sourceKind: string;
  sourceSnapshotId: string | null;
  capturedAt: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

async function schemaReady(tables: string[]) {
  const readiness = await getDbSchemaReadiness({ tables });
  return readiness.ready;
}

function normalizeTimestamp(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  const parsed = new Date(text);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : text;
}

async function readDimensionRows<T>(input: {
  tableName:
    | "google_ads_campaign_dimensions"
    | "google_ads_ad_group_dimensions"
    | "google_ads_ad_dimensions"
    | "google_ads_keyword_dimensions"
    | "google_ads_asset_group_dimensions"
    | "google_ads_product_dimensions";
  entityColumn:
    | "campaign_id"
    | "ad_group_id"
    | "ad_id"
    | "keyword_id"
    | "asset_group_id"
    | "product_key";
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

async function readLatestStateHistory<T>(input: {
  tableName:
    | "google_ads_campaign_state_history"
    | "google_ads_ad_group_state_history";
  entityColumn: "campaign_id" | "ad_group_id";
  businessId: string;
  entityIds: string[];
}): Promise<Map<string, T>> {
  const entityIds = Array.from(new Set(input.entityIds.filter(Boolean)));
  if (entityIds.length === 0) return new Map();
  if (!(await schemaReady([input.tableName]))) return new Map();

  const sql = getDb();
  const rows = (await sql.query(
    `
      WITH ranked AS (
        SELECT *,
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
  )) as Array<Record<string, unknown>>;

  return new Map(
    rows.map((row) => [String(row[input.entityColumn]), row as T]),
  );
}

export async function readGoogleAdsCampaignDimensions(input: {
  businessId: string;
  campaignIds: string[];
}) {
  const rows = await readDimensionRows<{
    business_id: string;
    business_ref_id: string | null;
    provider_account_id: string;
    provider_account_ref_id: string | null;
    campaign_id: string;
    campaign_name: string | null;
    normalized_status: string | null;
    channel: string | null;
    projection_json: unknown;
    first_seen_at: string | null;
    last_seen_at: string | null;
    source_updated_at: string | null;
  }>({
    tableName: "google_ads_campaign_dimensions",
    entityColumn: "campaign_id",
    businessId: input.businessId,
    entityIds: input.campaignIds,
  });

  return rows.map((row) => ({
    businessId: String(row.business_id),
    businessRefId: row.business_ref_id ? String(row.business_ref_id) : null,
    providerAccountId: String(row.provider_account_id),
    providerAccountRefId: row.provider_account_ref_id
      ? String(row.provider_account_ref_id)
      : null,
    campaignId: String(row.campaign_id),
    campaignName: row.campaign_name ? String(row.campaign_name) : null,
    normalizedStatus: row.normalized_status
      ? String(row.normalized_status)
      : null,
    channel: row.channel ? String(row.channel) : null,
    projectionJson: row.projection_json ?? {},
    firstSeenAt: normalizeTimestamp(row.first_seen_at),
    lastSeenAt: normalizeTimestamp(row.last_seen_at),
    sourceUpdatedAt: normalizeTimestamp(row.source_updated_at),
  })) satisfies GoogleAdsCampaignDimensionRecord[];
}

export async function readGoogleAdsAdGroupDimensions(input: {
  businessId: string;
  adGroupIds: string[];
}) {
  const rows = await readDimensionRows<{
    business_id: string;
    business_ref_id: string | null;
    provider_account_id: string;
    provider_account_ref_id: string | null;
    campaign_id: string | null;
    ad_group_id: string;
    ad_group_name: string | null;
    normalized_status: string | null;
    projection_json: unknown;
    first_seen_at: string | null;
    last_seen_at: string | null;
    source_updated_at: string | null;
  }>({
    tableName: "google_ads_ad_group_dimensions",
    entityColumn: "ad_group_id",
    businessId: input.businessId,
    entityIds: input.adGroupIds,
  });

  return rows.map((row) => ({
    businessId: String(row.business_id),
    businessRefId: row.business_ref_id ? String(row.business_ref_id) : null,
    providerAccountId: String(row.provider_account_id),
    providerAccountRefId: row.provider_account_ref_id
      ? String(row.provider_account_ref_id)
      : null,
    campaignId: row.campaign_id ? String(row.campaign_id) : null,
    adGroupId: String(row.ad_group_id),
    adGroupName: row.ad_group_name ? String(row.ad_group_name) : null,
    normalizedStatus: row.normalized_status
      ? String(row.normalized_status)
      : null,
    projectionJson: row.projection_json ?? {},
    firstSeenAt: normalizeTimestamp(row.first_seen_at),
    lastSeenAt: normalizeTimestamp(row.last_seen_at),
    sourceUpdatedAt: normalizeTimestamp(row.source_updated_at),
  })) satisfies GoogleAdsAdGroupDimensionRecord[];
}

export async function readGoogleAdsAdDimensions(input: {
  businessId: string;
  adIds: string[];
}) {
  const rows = await readDimensionRows<{
    business_id: string;
    business_ref_id: string | null;
    provider_account_id: string;
    provider_account_ref_id: string | null;
    campaign_id: string | null;
    ad_group_id: string | null;
    ad_id: string;
    ad_name: string | null;
    normalized_status: string | null;
    projection_json: unknown;
    first_seen_at: string | null;
    last_seen_at: string | null;
    source_updated_at: string | null;
  }>({
    tableName: "google_ads_ad_dimensions",
    entityColumn: "ad_id",
    businessId: input.businessId,
    entityIds: input.adIds,
  });

  return rows.map((row) => ({
    businessId: String(row.business_id),
    businessRefId: row.business_ref_id ? String(row.business_ref_id) : null,
    providerAccountId: String(row.provider_account_id),
    providerAccountRefId: row.provider_account_ref_id
      ? String(row.provider_account_ref_id)
      : null,
    campaignId: row.campaign_id ? String(row.campaign_id) : null,
    adGroupId: row.ad_group_id ? String(row.ad_group_id) : null,
    adId: String(row.ad_id),
    adName: row.ad_name ? String(row.ad_name) : null,
    normalizedStatus: row.normalized_status
      ? String(row.normalized_status)
      : null,
    projectionJson: row.projection_json ?? {},
    firstSeenAt: normalizeTimestamp(row.first_seen_at),
    lastSeenAt: normalizeTimestamp(row.last_seen_at),
    sourceUpdatedAt: normalizeTimestamp(row.source_updated_at),
  })) satisfies GoogleAdsAdDimensionRecord[];
}

export async function readGoogleAdsKeywordDimensions(input: {
  businessId: string;
  keywordIds: string[];
}) {
  const rows = await readDimensionRows<{
    business_id: string;
    business_ref_id: string | null;
    provider_account_id: string;
    provider_account_ref_id: string | null;
    campaign_id: string | null;
    ad_group_id: string | null;
    keyword_id: string;
    keyword_text: string | null;
    normalized_status: string | null;
    projection_json: unknown;
    first_seen_at: string | null;
    last_seen_at: string | null;
    source_updated_at: string | null;
  }>({
    tableName: "google_ads_keyword_dimensions",
    entityColumn: "keyword_id",
    businessId: input.businessId,
    entityIds: input.keywordIds,
  });

  return rows.map((row) => ({
    businessId: String(row.business_id),
    businessRefId: row.business_ref_id ? String(row.business_ref_id) : null,
    providerAccountId: String(row.provider_account_id),
    providerAccountRefId: row.provider_account_ref_id
      ? String(row.provider_account_ref_id)
      : null,
    campaignId: row.campaign_id ? String(row.campaign_id) : null,
    adGroupId: row.ad_group_id ? String(row.ad_group_id) : null,
    keywordId: String(row.keyword_id),
    keywordText: row.keyword_text ? String(row.keyword_text) : null,
    normalizedStatus: row.normalized_status
      ? String(row.normalized_status)
      : null,
    projectionJson: row.projection_json ?? {},
    firstSeenAt: normalizeTimestamp(row.first_seen_at),
    lastSeenAt: normalizeTimestamp(row.last_seen_at),
    sourceUpdatedAt: normalizeTimestamp(row.source_updated_at),
  })) satisfies GoogleAdsKeywordDimensionRecord[];
}

export async function readGoogleAdsAssetGroupDimensions(input: {
  businessId: string;
  assetGroupIds: string[];
}) {
  const rows = await readDimensionRows<{
    business_id: string;
    business_ref_id: string | null;
    provider_account_id: string;
    provider_account_ref_id: string | null;
    campaign_id: string | null;
    asset_group_id: string;
    asset_group_name: string | null;
    normalized_status: string | null;
    projection_json: unknown;
    first_seen_at: string | null;
    last_seen_at: string | null;
    source_updated_at: string | null;
  }>({
    tableName: "google_ads_asset_group_dimensions",
    entityColumn: "asset_group_id",
    businessId: input.businessId,
    entityIds: input.assetGroupIds,
  });

  return rows.map((row) => ({
    businessId: String(row.business_id),
    businessRefId: row.business_ref_id ? String(row.business_ref_id) : null,
    providerAccountId: String(row.provider_account_id),
    providerAccountRefId: row.provider_account_ref_id
      ? String(row.provider_account_ref_id)
      : null,
    campaignId: row.campaign_id ? String(row.campaign_id) : null,
    assetGroupId: String(row.asset_group_id),
    assetGroupName: row.asset_group_name ? String(row.asset_group_name) : null,
    normalizedStatus: row.normalized_status
      ? String(row.normalized_status)
      : null,
    projectionJson: row.projection_json ?? {},
    firstSeenAt: normalizeTimestamp(row.first_seen_at),
    lastSeenAt: normalizeTimestamp(row.last_seen_at),
    sourceUpdatedAt: normalizeTimestamp(row.source_updated_at),
  })) satisfies GoogleAdsAssetGroupDimensionRecord[];
}

export async function readGoogleAdsProductDimensions(input: {
  businessId: string;
  productKeys: string[];
}) {
  const rows = await readDimensionRows<{
    business_id: string;
    business_ref_id: string | null;
    provider_account_id: string;
    provider_account_ref_id: string | null;
    campaign_id: string | null;
    product_key: string;
    product_title: string | null;
    normalized_status: string | null;
    projection_json: unknown;
    first_seen_at: string | null;
    last_seen_at: string | null;
    source_updated_at: string | null;
  }>({
    tableName: "google_ads_product_dimensions",
    entityColumn: "product_key",
    businessId: input.businessId,
    entityIds: input.productKeys,
  });

  return rows.map((row) => ({
    businessId: String(row.business_id),
    businessRefId: row.business_ref_id ? String(row.business_ref_id) : null,
    providerAccountId: String(row.provider_account_id),
    providerAccountRefId: row.provider_account_ref_id
      ? String(row.provider_account_ref_id)
      : null,
    campaignId: row.campaign_id ? String(row.campaign_id) : null,
    productKey: String(row.product_key),
    productTitle: row.product_title ? String(row.product_title) : null,
    normalizedStatus: row.normalized_status
      ? String(row.normalized_status)
      : null,
    projectionJson: row.projection_json ?? {},
    firstSeenAt: normalizeTimestamp(row.first_seen_at),
    lastSeenAt: normalizeTimestamp(row.last_seen_at),
    sourceUpdatedAt: normalizeTimestamp(row.source_updated_at),
  })) satisfies GoogleAdsProductDimensionRecord[];
}

export async function readLatestGoogleAdsCampaignStateHistory(input: {
  businessId: string;
  campaignIds: string[];
}) {
  const rows = await readLatestStateHistory<Record<string, unknown>>({
    tableName: "google_ads_campaign_state_history",
    entityColumn: "campaign_id",
    businessId: input.businessId,
    entityIds: input.campaignIds,
  });

  return new Map(
    Array.from(rows.entries()).map(([campaignId, row]) => [
      campaignId,
      {
        businessId: String(row.business_id),
        businessRefId: row.business_ref_id ? String(row.business_ref_id) : null,
        providerAccountId: String(row.provider_account_id),
        providerAccountRefId: row.provider_account_ref_id
          ? String(row.provider_account_ref_id)
          : null,
        campaignId,
        stateFingerprint: String(row.state_fingerprint),
        campaignName: row.campaign_name ? String(row.campaign_name) : null,
        normalizedStatus: row.normalized_status
          ? String(row.normalized_status)
          : null,
        channel: row.channel ? String(row.channel) : null,
        projectionJson: row.projection_json ?? {},
        sourceKind: String(row.source_kind ?? "warehouse_daily"),
        sourceSnapshotId: row.source_snapshot_id
          ? String(row.source_snapshot_id)
          : null,
        capturedAt: normalizeTimestamp(row.captured_at) ?? new Date(0).toISOString(),
        effectiveFrom:
          typeof row.effective_from === "string" ? row.effective_from.slice(0, 10) : null,
        effectiveTo:
          typeof row.effective_to === "string" ? row.effective_to.slice(0, 10) : null,
      } satisfies GoogleAdsCampaignStateHistoryRecord,
    ]),
  );
}

export async function readLatestGoogleAdsAdGroupStateHistory(input: {
  businessId: string;
  adGroupIds: string[];
}) {
  const rows = await readLatestStateHistory<Record<string, unknown>>({
    tableName: "google_ads_ad_group_state_history",
    entityColumn: "ad_group_id",
    businessId: input.businessId,
    entityIds: input.adGroupIds,
  });

  return new Map(
    Array.from(rows.entries()).map(([adGroupId, row]) => [
      adGroupId,
      {
        businessId: String(row.business_id),
        businessRefId: row.business_ref_id ? String(row.business_ref_id) : null,
        providerAccountId: String(row.provider_account_id),
        providerAccountRefId: row.provider_account_ref_id
          ? String(row.provider_account_ref_id)
          : null,
        campaignId: row.campaign_id ? String(row.campaign_id) : null,
        adGroupId,
        stateFingerprint: String(row.state_fingerprint),
        adGroupName: row.ad_group_name ? String(row.ad_group_name) : null,
        normalizedStatus: row.normalized_status
          ? String(row.normalized_status)
          : null,
        projectionJson: row.projection_json ?? {},
        sourceKind: String(row.source_kind ?? "warehouse_daily"),
        sourceSnapshotId: row.source_snapshot_id
          ? String(row.source_snapshot_id)
          : null,
        capturedAt: normalizeTimestamp(row.captured_at) ?? new Date(0).toISOString(),
        effectiveFrom:
          typeof row.effective_from === "string" ? row.effective_from.slice(0, 10) : null,
        effectiveTo:
          typeof row.effective_to === "string" ? row.effective_to.slice(0, 10) : null,
      } satisfies GoogleAdsAdGroupStateHistoryRecord,
    ]),
  );
}
