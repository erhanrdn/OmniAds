import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import type {
  MetaAccountDailyRow,
  MetaAdDailyRow,
  MetaAdSetDailyRow,
  MetaCampaignDailyRow,
  MetaCreativeDailyRow,
  MetaRawSnapshotRecord,
  MetaSyncJobRecord,
  MetaWarehouseDataState,
  MetaWarehouseFreshness,
  MetaWarehouseMetricSet,
} from "@/lib/meta/warehouse-types";

function normalizeDate(value: string) {
  return value.slice(0, 10);
}

export function buildMetaRawSnapshotHash(input: {
  businessId: string;
  providerAccountId: string;
  endpointName: string;
  startDate: string;
  endDate: string;
  payload: unknown;
}) {
  return createHash("sha1")
    .update(
      JSON.stringify({
        businessId: input.businessId,
        providerAccountId: input.providerAccountId,
        endpointName: input.endpointName,
        startDate: normalizeDate(input.startDate),
        endDate: normalizeDate(input.endDate),
        payload: input.payload,
      })
    )
    .digest("hex");
}

export function emptyMetaWarehouseMetrics(): MetaWarehouseMetricSet {
  return {
    spend: 0,
    impressions: 0,
    clicks: 0,
    reach: 0,
    frequency: null,
    conversions: 0,
    revenue: 0,
    roas: 0,
    cpa: null,
    ctr: null,
    cpc: null,
  };
}

export function createMetaWarehouseFreshness(
  input: Partial<MetaWarehouseFreshness> = {}
): MetaWarehouseFreshness {
  return {
    dataState: input.dataState ?? "syncing",
    lastSyncedAt: input.lastSyncedAt ?? null,
    liveRefreshedAt: input.liveRefreshedAt ?? null,
    isPartial: input.isPartial ?? false,
    missingWindows: input.missingWindows ?? [],
    warnings: input.warnings ?? [],
  };
}

export function mergeMetaWarehouseState(
  current: MetaWarehouseDataState,
  next: MetaWarehouseDataState
): MetaWarehouseDataState {
  const priority: Record<MetaWarehouseDataState, number> = {
    not_connected: 0,
    connected_no_assignment: 1,
    action_required: 2,
    syncing: 3,
    stale: 4,
    partial: 5,
    ready: 6,
  };
  return priority[next] > priority[current] ? next : current;
}

export async function createMetaSyncJob(input: MetaSyncJobRecord) {
  await runMigrations();
  const sql = getDb();
  const existingRows = await sql`
    SELECT id
    FROM meta_sync_jobs
    WHERE business_id = ${input.businessId}
      AND provider_account_id = ${input.providerAccountId}
      AND sync_type = ${input.syncType}
      AND scope = ${input.scope}
      AND start_date = ${normalizeDate(input.startDate)}
      AND end_date = ${normalizeDate(input.endDate)}
      AND trigger_source = ${input.triggerSource}
      AND status = 'running'
    ORDER BY triggered_at DESC
    LIMIT 1
  ` as Array<{ id: string }>;
  if (existingRows[0]?.id) return existingRows[0].id;
  const rows = await sql`
    INSERT INTO meta_sync_jobs (
      business_id,
      provider_account_id,
      sync_type,
      scope,
      start_date,
      end_date,
      status,
      progress_percent,
      trigger_source,
      retry_count,
      last_error,
      triggered_at,
      started_at,
      finished_at,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.providerAccountId},
      ${input.syncType},
      ${input.scope},
      ${normalizeDate(input.startDate)},
      ${normalizeDate(input.endDate)},
      ${input.status},
      ${input.progressPercent},
      ${input.triggerSource},
      ${input.retryCount},
      ${input.lastError},
      COALESCE(${input.triggeredAt ?? null}, now()),
      ${input.startedAt ?? null},
      ${input.finishedAt ?? null},
      now()
    )
    RETURNING id
  ` as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

export async function updateMetaSyncJob(input: {
  id: string;
  status: MetaSyncJobRecord["status"];
  progressPercent?: number;
  lastError?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}) {
  await runMigrations();
  const sql = getDb();
  await sql`
    UPDATE meta_sync_jobs
    SET
      status = ${input.status},
      progress_percent = COALESCE(${input.progressPercent ?? null}, progress_percent),
      last_error = COALESCE(${input.lastError ?? null}, last_error),
      started_at = COALESCE(${input.startedAt ?? null}, started_at),
      finished_at = COALESCE(${input.finishedAt ?? null}, finished_at),
      updated_at = now()
    WHERE id = ${input.id}
  `;
}

export async function persistMetaRawSnapshot(input: MetaRawSnapshotRecord) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    INSERT INTO meta_raw_snapshots (
      business_id,
      provider_account_id,
      endpoint_name,
      entity_scope,
      start_date,
      end_date,
      account_timezone,
      account_currency,
      payload_json,
      payload_hash,
      request_context,
      provider_http_status,
      status,
      fetched_at,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.providerAccountId},
      ${input.endpointName},
      ${input.entityScope},
      ${normalizeDate(input.startDate)},
      ${normalizeDate(input.endDate)},
      ${input.accountTimezone},
      ${input.accountCurrency},
      ${JSON.stringify(input.payloadJson)}::jsonb,
      ${input.payloadHash},
      ${JSON.stringify(input.requestContext ?? {})}::jsonb,
      ${input.providerHttpStatus},
      ${input.status},
      COALESCE(${input.fetchedAt ?? null}, now()),
      now()
    )
    RETURNING id
  ` as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

export async function getLatestMetaSyncHealth(input: {
  businessId: string;
  providerAccountId?: string | null;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      id,
      provider_account_id,
      sync_type,
      scope,
      start_date,
      end_date,
      trigger_source,
      triggered_at,
      status,
      last_error,
      progress_percent,
      finished_at,
      started_at,
      updated_at
    FROM meta_sync_jobs
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND trigger_source <> 'request_runtime'
    ORDER BY
      CASE
        WHEN sync_type IN ('initial_backfill', 'reconnect_backfill') THEN 0
        WHEN sync_type = 'incremental_recent' THEN 1
        WHEN sync_type = 'today_refresh' THEN 2
        ELSE 3
      END ASC,
      CASE
        WHEN status = 'running' THEN 0
        WHEN status = 'partial' THEN 1
        WHEN status = 'succeeded' THEN 2
        ELSE 3
      END ASC,
      progress_percent DESC,
      updated_at DESC
    LIMIT 1
  ` as Array<{
    id: string;
    provider_account_id: string;
    sync_type: string;
    scope: string;
    start_date: string;
    end_date: string;
    trigger_source: string;
    triggered_at: string;
    status: string;
    last_error: string | null;
    progress_percent: number;
    finished_at: string | null;
    started_at: string | null;
    updated_at: string;
  }>;
  return rows[0] ?? null;
}

export async function expireStaleMetaSyncJobs(input: {
  businessId?: string | null;
  staleAfterMinutes?: number;
}) {
  await runMigrations();
  const sql = getDb();
  const staleAfterMinutes = Math.max(10, Math.floor(input.staleAfterMinutes ?? 45));
  const rows = await sql`
    UPDATE meta_sync_jobs
    SET
      status = 'cancelled',
      last_error = COALESCE(last_error, 'Sync job expired after inactivity.'),
      finished_at = COALESCE(finished_at, now()),
      updated_at = now()
    WHERE status = 'running'
      AND (${input.businessId ?? null}::text IS NULL OR business_id = ${input.businessId ?? null})
      AND COALESCE(updated_at, started_at, triggered_at) < now() - (${staleAfterMinutes} || ' minutes')::interval
    RETURNING id
  ` as Array<{ id: string }>;
  return rows.length;
}

export async function hasBlockingMetaSyncJob(input: {
  businessId: string;
  syncTypes?: string[] | null;
  triggerSources?: string[] | null;
  excludeTriggerSources?: string[] | null;
  scopes?: string[] | null;
  lookbackMinutes?: number;
}) {
  await runMigrations();
  const sql = getDb();
  const lookbackMinutes = Math.max(5, Math.floor(input.lookbackMinutes ?? 90));
  const rows = await sql`
    SELECT id
    FROM meta_sync_jobs
    WHERE business_id = ${input.businessId}
      AND status = 'running'
      AND COALESCE(updated_at, started_at, triggered_at) > now() - (${lookbackMinutes} || ' minutes')::interval
      AND (
        ${input.syncTypes ?? null}::text[] IS NULL
        OR sync_type = ANY(${input.syncTypes ?? null}::text[])
      )
      AND (
        ${input.triggerSources ?? null}::text[] IS NULL
        OR trigger_source = ANY(${input.triggerSources ?? null}::text[])
      )
      AND (
        ${input.excludeTriggerSources ?? null}::text[] IS NULL
        OR NOT (trigger_source = ANY(${input.excludeTriggerSources ?? null}::text[]))
      )
      AND (
        ${input.scopes ?? null}::text[] IS NULL
        OR scope = ANY(${input.scopes ?? null}::text[])
      )
    LIMIT 1
  ` as Array<{ id: string }>;
  return rows.length > 0;
}

export async function getMetaSyncJobHealth(input: {
  businessId: string;
  staleAfterMinutes?: number;
}) {
  await runMigrations();
  const sql = getDb();
  const staleAfterMinutes = Math.max(10, Math.floor(input.staleAfterMinutes ?? 45));
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'running')::int AS running_jobs,
      COUNT(*) FILTER (
        WHERE status = 'running'
          AND COALESCE(updated_at, started_at, triggered_at) < now() - (${staleAfterMinutes} || ' minutes')::interval
      )::int AS stale_running_jobs
    FROM meta_sync_jobs
    WHERE business_id = ${input.businessId}
  ` as Array<{
    running_jobs: number;
    stale_running_jobs: number;
  }>;
  return {
    runningJobs: rows[0]?.running_jobs ?? 0,
    staleRunningJobs: rows[0]?.stale_running_jobs ?? 0,
  };
}

export async function getMetaAccountDailyCoverage(input: {
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      COUNT(DISTINCT date::date)::int AS completed_days,
      MAX(date::date)::text AS ready_through_date
    FROM meta_account_daily
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND date::date BETWEEN ${normalizeDate(input.startDate)}::date AND ${normalizeDate(input.endDate)}::date
  ` as Array<{
    completed_days: number;
    ready_through_date: string | null;
  }>;
  return rows[0] ?? { completed_days: 0, ready_through_date: null };
}

export async function getMetaAdSetDailyCoverage(input: {
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      COUNT(DISTINCT date::date)::int AS completed_days,
      MAX(date::date)::text AS ready_through_date
    FROM meta_adset_daily
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND date::date BETWEEN ${normalizeDate(input.startDate)}::date AND ${normalizeDate(input.endDate)}::date
  ` as Array<{
    completed_days: number;
    ready_through_date: string | null;
  }>;
  return rows[0] ?? { completed_days: 0, ready_through_date: null };
}

export async function getMetaAdDailyCoverage(input: {
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      COUNT(DISTINCT date::date)::int AS completed_days,
      MAX(date::date)::text AS ready_through_date
    FROM meta_ad_daily
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND date::date BETWEEN ${normalizeDate(input.startDate)}::date AND ${normalizeDate(input.endDate)}::date
  ` as Array<{
    completed_days: number;
    ready_through_date: string | null;
  }>;
  return rows[0] ?? { completed_days: 0, ready_through_date: null };
}

export async function getMetaCreativeDailyCoverage(input: {
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      COUNT(DISTINCT date::date)::int AS completed_days,
      MAX(date::date)::text AS ready_through_date
    FROM meta_creative_daily
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND date::date BETWEEN ${normalizeDate(input.startDate)}::date AND ${normalizeDate(input.endDate)}::date
  ` as Array<{
    completed_days: number;
    ready_through_date: string | null;
  }>;
  return rows[0] ?? { completed_days: 0, ready_through_date: null };
}

export async function getMetaAdDailyPreviewCoverage(input: {
  businessId: string;
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      COUNT(*)::int AS total_rows,
      COUNT(*) FILTER (
        WHERE
          NULLIF(payload_json->>'preview_url', '') IS NOT NULL OR
          NULLIF(payload_json->>'thumbnail_url', '') IS NOT NULL OR
          NULLIF(payload_json->>'image_url', '') IS NOT NULL OR
          NULLIF(payload_json->'preview'->>'image_url', '') IS NOT NULL OR
          NULLIF(payload_json->'preview'->>'poster_url', '') IS NOT NULL OR
          NULLIF(payload_json->'preview'->>'video_url', '') IS NOT NULL
      )::int AS preview_ready_rows
    FROM meta_ad_daily
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND date::date BETWEEN ${normalizeDate(input.startDate)}::date AND ${normalizeDate(input.endDate)}::date
  ` as Array<{
    total_rows: number;
    preview_ready_rows: number;
  }>;
  const row = rows[0] ?? { total_rows: 0, preview_ready_rows: 0 };
  return {
    total_rows: Number(row.total_rows ?? 0),
    preview_ready_rows: Number(row.preview_ready_rows ?? 0),
  };
}

export async function getMetaRawSnapshotCoverageByEndpoint(input: {
  businessId: string;
  endpointNames: string[];
  providerAccountId?: string | null;
  startDate: string;
  endDate: string;
}) {
  const endpointNames = Array.from(new Set(input.endpointNames.filter(Boolean)));
  if (endpointNames.length === 0) {
    return new Map<string, { completed_days: number; ready_through_date: string | null }>();
  }

  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      endpoint_name,
      COUNT(DISTINCT start_date::date)::int AS completed_days,
      MAX(start_date::date)::text AS ready_through_date
    FROM meta_raw_snapshots
    WHERE business_id = ${input.businessId}
      AND endpoint_name = ANY(${endpointNames}::text[])
      AND status = 'fetched'
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
      AND start_date::date BETWEEN ${normalizeDate(input.startDate)}::date AND ${normalizeDate(input.endDate)}::date
      AND end_date::date BETWEEN ${normalizeDate(input.startDate)}::date AND ${normalizeDate(input.endDate)}::date
    GROUP BY endpoint_name
  ` as Array<{
    endpoint_name: string;
    completed_days: number;
    ready_through_date: string | null;
  }>;

  const map = new Map<string, { completed_days: number; ready_through_date: string | null }>();
  for (const endpointName of endpointNames) {
    map.set(endpointName, { completed_days: 0, ready_through_date: null });
  }
  for (const row of rows) {
    map.set(row.endpoint_name, {
      completed_days: Number(row.completed_days ?? 0),
      ready_through_date: row.ready_through_date ?? null,
    });
  }
  return map;
}

export async function getMetaAccountDailyStats(input: {
  businessId: string;
  providerAccountId?: string | null;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      COUNT(*)::int AS row_count,
      MIN(date)::text AS first_date,
      MAX(date)::text AS last_date
    FROM meta_account_daily
    WHERE business_id = ${input.businessId}
      AND (${input.providerAccountId ?? null}::text IS NULL OR provider_account_id = ${input.providerAccountId ?? null})
  ` as Array<{
    row_count: number;
    first_date: string | null;
    last_date: string | null;
  }>;
  return rows[0] ?? { row_count: 0, first_date: null, last_date: null };
}

export async function getLatestMetaRawSnapshot(input: {
  businessId: string;
  providerAccountId: string;
  endpointName: string;
}) {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      id,
      fetched_at,
      status,
      account_timezone,
      account_currency,
      payload_json
    FROM meta_raw_snapshots
    WHERE business_id = ${input.businessId}
      AND provider_account_id = ${input.providerAccountId}
      AND endpoint_name = ${input.endpointName}
    ORDER BY fetched_at DESC
    LIMIT 1
  ` as Array<{
    id: string;
    fetched_at: string;
    status: string;
    account_timezone: string | null;
    account_currency: string | null;
    payload_json: unknown;
  }>;
  return rows[0] ?? null;
}

export async function upsertMetaAccountDailyRows(rows: MetaAccountDailyRow[]) {
  if (rows.length === 0) return;
  await runMigrations();
  const sql = getDb();

  for (const row of rows) {
    await sql`
      INSERT INTO meta_account_daily (
        business_id,
        provider_account_id,
        date,
        account_name,
        account_timezone,
        account_currency,
        spend,
        impressions,
        clicks,
        reach,
        frequency,
        conversions,
        revenue,
        roas,
        cpa,
        ctr,
        cpc,
        source_snapshot_id,
        updated_at
      )
      VALUES (
        ${row.businessId},
        ${row.providerAccountId},
        ${normalizeDate(row.date)},
        ${row.accountName},
        ${row.accountTimezone},
        ${row.accountCurrency},
        ${row.spend},
        ${row.impressions},
        ${row.clicks},
        ${row.reach},
        ${row.frequency},
        ${row.conversions},
        ${row.revenue},
        ${row.roas},
        ${row.cpa},
        ${row.ctr},
        ${row.cpc},
        ${row.sourceSnapshotId},
        now()
      )
      ON CONFLICT (business_id, provider_account_id, date) DO UPDATE SET
        account_name = EXCLUDED.account_name,
        account_timezone = EXCLUDED.account_timezone,
        account_currency = EXCLUDED.account_currency,
        spend = EXCLUDED.spend,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        reach = EXCLUDED.reach,
        frequency = EXCLUDED.frequency,
        conversions = EXCLUDED.conversions,
        revenue = EXCLUDED.revenue,
        roas = EXCLUDED.roas,
        cpa = EXCLUDED.cpa,
        ctr = EXCLUDED.ctr,
        cpc = EXCLUDED.cpc,
        source_snapshot_id = EXCLUDED.source_snapshot_id,
        updated_at = now()
    `;
  }
}

export async function upsertMetaCampaignDailyRows(rows: MetaCampaignDailyRow[]) {
  if (rows.length === 0) return;
  await runMigrations();
  const sql = getDb();

  for (const row of rows) {
    await sql`
      INSERT INTO meta_campaign_daily (
        business_id,
        provider_account_id,
        date,
        campaign_id,
        campaign_name_current,
        campaign_name_historical,
        campaign_status,
        objective,
        buying_type,
        account_timezone,
        account_currency,
        spend,
        impressions,
        clicks,
        reach,
        frequency,
        conversions,
        revenue,
        roas,
        cpa,
        ctr,
        cpc,
        source_snapshot_id,
        updated_at
      )
      VALUES (
        ${row.businessId},
        ${row.providerAccountId},
        ${normalizeDate(row.date)},
        ${row.campaignId},
        ${row.campaignNameCurrent},
        ${row.campaignNameHistorical},
        ${row.campaignStatus},
        ${row.objective},
        ${row.buyingType},
        ${row.accountTimezone},
        ${row.accountCurrency},
        ${row.spend},
        ${row.impressions},
        ${row.clicks},
        ${row.reach},
        ${row.frequency},
        ${row.conversions},
        ${row.revenue},
        ${row.roas},
        ${row.cpa},
        ${row.ctr},
        ${row.cpc},
        ${row.sourceSnapshotId},
        now()
      )
      ON CONFLICT (business_id, provider_account_id, date, campaign_id) DO UPDATE SET
        campaign_name_current = EXCLUDED.campaign_name_current,
        campaign_name_historical = EXCLUDED.campaign_name_historical,
        campaign_status = EXCLUDED.campaign_status,
        objective = EXCLUDED.objective,
        buying_type = EXCLUDED.buying_type,
        account_timezone = EXCLUDED.account_timezone,
        account_currency = EXCLUDED.account_currency,
        spend = EXCLUDED.spend,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        reach = EXCLUDED.reach,
        frequency = EXCLUDED.frequency,
        conversions = EXCLUDED.conversions,
        revenue = EXCLUDED.revenue,
        roas = EXCLUDED.roas,
        cpa = EXCLUDED.cpa,
        ctr = EXCLUDED.ctr,
        cpc = EXCLUDED.cpc,
        source_snapshot_id = EXCLUDED.source_snapshot_id,
        updated_at = now()
    `;
  }
}

export async function upsertMetaAdSetDailyRows(rows: MetaAdSetDailyRow[]) {
  if (rows.length === 0) return;
  await runMigrations();
  const sql = getDb();

  for (const row of rows) {
    await sql`
      INSERT INTO meta_adset_daily (
        business_id,
        provider_account_id,
        date,
        campaign_id,
        adset_id,
        adset_name_current,
        adset_name_historical,
        adset_status,
        account_timezone,
        account_currency,
        spend,
        impressions,
        clicks,
        reach,
        frequency,
        conversions,
        revenue,
        roas,
        cpa,
        ctr,
        cpc,
        source_snapshot_id,
        updated_at
      )
      VALUES (
        ${row.businessId},
        ${row.providerAccountId},
        ${normalizeDate(row.date)},
        ${row.campaignId},
        ${row.adsetId},
        ${row.adsetNameCurrent},
        ${row.adsetNameHistorical},
        ${row.adsetStatus},
        ${row.accountTimezone},
        ${row.accountCurrency},
        ${row.spend},
        ${row.impressions},
        ${row.clicks},
        ${row.reach},
        ${row.frequency},
        ${row.conversions},
        ${row.revenue},
        ${row.roas},
        ${row.cpa},
        ${row.ctr},
        ${row.cpc},
        ${row.sourceSnapshotId},
        now()
      )
      ON CONFLICT (business_id, provider_account_id, date, adset_id) DO UPDATE SET
        campaign_id = EXCLUDED.campaign_id,
        adset_name_current = EXCLUDED.adset_name_current,
        adset_name_historical = EXCLUDED.adset_name_historical,
        adset_status = EXCLUDED.adset_status,
        account_timezone = EXCLUDED.account_timezone,
        account_currency = EXCLUDED.account_currency,
        spend = EXCLUDED.spend,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        reach = EXCLUDED.reach,
        frequency = EXCLUDED.frequency,
        conversions = EXCLUDED.conversions,
        revenue = EXCLUDED.revenue,
        roas = EXCLUDED.roas,
        cpa = EXCLUDED.cpa,
        ctr = EXCLUDED.ctr,
        cpc = EXCLUDED.cpc,
        source_snapshot_id = EXCLUDED.source_snapshot_id,
        updated_at = now()
    `;
  }
}

export async function upsertMetaAdDailyRows(rows: MetaAdDailyRow[]) {
  if (rows.length === 0) return;
  await runMigrations();
  const sql = getDb();

  for (const row of rows) {
    await sql`
      INSERT INTO meta_ad_daily (
        business_id,
        provider_account_id,
        date,
        campaign_id,
        adset_id,
        ad_id,
        ad_name_current,
        ad_name_historical,
        ad_status,
        account_timezone,
        account_currency,
        spend,
        impressions,
        clicks,
        reach,
        frequency,
        conversions,
        revenue,
        roas,
        cpa,
        ctr,
        cpc,
        source_snapshot_id,
        payload_json,
        updated_at
      )
      VALUES (
        ${row.businessId},
        ${row.providerAccountId},
        ${normalizeDate(row.date)},
        ${row.campaignId},
        ${row.adsetId},
        ${row.adId},
        ${row.adNameCurrent},
        ${row.adNameHistorical},
        ${row.adStatus},
        ${row.accountTimezone},
        ${row.accountCurrency},
        ${row.spend},
        ${row.impressions},
        ${row.clicks},
        ${row.reach},
        ${row.frequency},
        ${row.conversions},
        ${row.revenue},
        ${row.roas},
        ${row.cpa},
        ${row.ctr},
        ${row.cpc},
        ${row.sourceSnapshotId},
        ${JSON.stringify(row.payloadJson ?? null)}::jsonb,
        now()
      )
      ON CONFLICT (business_id, provider_account_id, date, ad_id) DO UPDATE SET
        campaign_id = EXCLUDED.campaign_id,
        adset_id = EXCLUDED.adset_id,
        ad_name_current = EXCLUDED.ad_name_current,
        ad_name_historical = EXCLUDED.ad_name_historical,
        ad_status = EXCLUDED.ad_status,
        account_timezone = EXCLUDED.account_timezone,
        account_currency = EXCLUDED.account_currency,
        spend = EXCLUDED.spend,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        reach = EXCLUDED.reach,
        frequency = EXCLUDED.frequency,
        conversions = EXCLUDED.conversions,
        revenue = EXCLUDED.revenue,
        roas = EXCLUDED.roas,
        cpa = EXCLUDED.cpa,
        ctr = EXCLUDED.ctr,
        cpc = EXCLUDED.cpc,
        source_snapshot_id = EXCLUDED.source_snapshot_id,
        payload_json = EXCLUDED.payload_json,
        updated_at = now()
    `;
  }
}

export async function upsertMetaCreativeDailyRows(rows: MetaCreativeDailyRow[]) {
  if (rows.length === 0) return;
  await runMigrations();
  const sql = getDb();

  for (const row of rows) {
    await sql`
      INSERT INTO meta_creative_daily (
        business_id,
        provider_account_id,
        date,
        campaign_id,
        adset_id,
        ad_id,
        creative_id,
        creative_name,
        headline,
        primary_text,
        destination_url,
        thumbnail_url,
        asset_type,
        account_timezone,
        account_currency,
        spend,
        impressions,
        clicks,
        conversions,
        revenue,
        roas,
        ctr,
        cpc,
        source_snapshot_id,
        payload_json,
        updated_at
      )
      VALUES (
        ${row.businessId},
        ${row.providerAccountId},
        ${normalizeDate(row.date)},
        ${row.campaignId},
        ${row.adsetId},
        ${row.adId},
        ${row.creativeId},
        ${row.creativeName},
        ${row.headline},
        ${row.primaryText},
        ${row.destinationUrl},
        ${row.thumbnailUrl},
        ${row.assetType},
        ${row.accountTimezone},
        ${row.accountCurrency},
        ${row.spend},
        ${row.impressions},
        ${row.clicks},
        ${row.conversions},
        ${row.revenue},
        ${row.roas},
        ${row.ctr},
        ${row.cpc},
        ${row.sourceSnapshotId},
        ${JSON.stringify(row.payloadJson ?? null)}::jsonb,
        now()
      )
      ON CONFLICT (business_id, provider_account_id, date, creative_id) DO UPDATE SET
        campaign_id = EXCLUDED.campaign_id,
        adset_id = EXCLUDED.adset_id,
        ad_id = EXCLUDED.ad_id,
        creative_name = EXCLUDED.creative_name,
        headline = EXCLUDED.headline,
        primary_text = EXCLUDED.primary_text,
        destination_url = EXCLUDED.destination_url,
        thumbnail_url = EXCLUDED.thumbnail_url,
        asset_type = EXCLUDED.asset_type,
        account_timezone = EXCLUDED.account_timezone,
        account_currency = EXCLUDED.account_currency,
        spend = EXCLUDED.spend,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        conversions = EXCLUDED.conversions,
        revenue = EXCLUDED.revenue,
        roas = EXCLUDED.roas,
        ctr = EXCLUDED.ctr,
        cpc = EXCLUDED.cpc,
        source_snapshot_id = EXCLUDED.source_snapshot_id,
        payload_json = EXCLUDED.payload_json,
        updated_at = now()
    `;
  }
}

export async function getMetaAccountDailyRange(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  providerAccountIds?: string[] | null;
}): Promise<MetaAccountDailyRow[]> {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      business_id,
      provider_account_id,
      date,
      account_name,
      account_timezone,
      account_currency,
      spend,
      impressions,
      clicks,
      reach,
      frequency,
      conversions,
      revenue,
      roas,
      cpa,
      ctr,
      cpc,
      source_snapshot_id,
      created_at,
      updated_at
    FROM meta_account_daily
    WHERE business_id = ${input.businessId}
      AND date >= ${normalizeDate(input.startDate)}
      AND date <= ${normalizeDate(input.endDate)}
      AND (
        ${input.providerAccountIds ?? null}::text[] IS NULL
        OR provider_account_id = ANY(${input.providerAccountIds ?? null}::text[])
      )
    ORDER BY date ASC, provider_account_id ASC
  ` as Array<{
    business_id: string;
    provider_account_id: string;
    date: string;
    account_name: string | null;
    account_timezone: string;
    account_currency: string;
    spend: number;
    impressions: number;
    clicks: number;
    reach: number;
    frequency: number | null;
    conversions: number;
    revenue: number;
    roas: number;
    cpa: number | null;
    ctr: number | null;
    cpc: number | null;
    source_snapshot_id: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    businessId: row.business_id,
    providerAccountId: row.provider_account_id,
    date: row.date,
    accountName: row.account_name,
    accountTimezone: row.account_timezone,
    accountCurrency: row.account_currency,
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    reach: Number(row.reach ?? 0),
    frequency: row.frequency == null ? null : Number(row.frequency),
    conversions: Number(row.conversions ?? 0),
    revenue: Number(row.revenue ?? 0),
    roas: Number(row.roas ?? 0),
    cpa: row.cpa == null ? null : Number(row.cpa),
    ctr: row.ctr == null ? null : Number(row.ctr),
    cpc: row.cpc == null ? null : Number(row.cpc),
    sourceSnapshotId: row.source_snapshot_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getMetaCampaignDailyRange(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  providerAccountIds?: string[] | null;
}): Promise<MetaCampaignDailyRow[]> {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      business_id,
      provider_account_id,
      date,
      campaign_id,
      campaign_name_current,
      campaign_name_historical,
      campaign_status,
      objective,
      buying_type,
      account_timezone,
      account_currency,
      spend,
      impressions,
      clicks,
      reach,
      frequency,
      conversions,
      revenue,
      roas,
      cpa,
      ctr,
      cpc,
      source_snapshot_id,
      created_at,
      updated_at
    FROM meta_campaign_daily
    WHERE business_id = ${input.businessId}
      AND date >= ${normalizeDate(input.startDate)}
      AND date <= ${normalizeDate(input.endDate)}
      AND (
        ${input.providerAccountIds ?? null}::text[] IS NULL
        OR provider_account_id = ANY(${input.providerAccountIds ?? null}::text[])
      )
    ORDER BY date ASC, provider_account_id ASC, campaign_id ASC
  ` as Array<{
    business_id: string;
    provider_account_id: string;
    date: string;
    campaign_id: string;
    campaign_name_current: string | null;
    campaign_name_historical: string | null;
    campaign_status: string | null;
    objective: string | null;
    buying_type: string | null;
    account_timezone: string;
    account_currency: string;
    spend: number;
    impressions: number;
    clicks: number;
    reach: number;
    frequency: number | null;
    conversions: number;
    revenue: number;
    roas: number;
    cpa: number | null;
    ctr: number | null;
    cpc: number | null;
    source_snapshot_id: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    businessId: row.business_id,
    providerAccountId: row.provider_account_id,
    date: row.date,
    campaignId: row.campaign_id,
    campaignNameCurrent: row.campaign_name_current,
    campaignNameHistorical: row.campaign_name_historical,
    campaignStatus: row.campaign_status,
    objective: row.objective,
    buyingType: row.buying_type,
    accountTimezone: row.account_timezone,
    accountCurrency: row.account_currency,
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    reach: Number(row.reach ?? 0),
    frequency: row.frequency == null ? null : Number(row.frequency),
    conversions: Number(row.conversions ?? 0),
    revenue: Number(row.revenue ?? 0),
    roas: Number(row.roas ?? 0),
    cpa: row.cpa == null ? null : Number(row.cpa),
    ctr: row.ctr == null ? null : Number(row.ctr),
    cpc: row.cpc == null ? null : Number(row.cpc),
    sourceSnapshotId: row.source_snapshot_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getMetaAdSetDailyRange(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  providerAccountIds?: string[] | null;
  campaignIds?: string[] | null;
}): Promise<MetaAdSetDailyRow[]> {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      business_id,
      provider_account_id,
      date,
      campaign_id,
      adset_id,
      adset_name_current,
      adset_name_historical,
      adset_status,
      account_timezone,
      account_currency,
      spend,
      impressions,
      clicks,
      reach,
      frequency,
      conversions,
      revenue,
      roas,
      cpa,
      ctr,
      cpc,
      source_snapshot_id,
      created_at,
      updated_at
    FROM meta_adset_daily
    WHERE business_id = ${input.businessId}
      AND date >= ${normalizeDate(input.startDate)}
      AND date <= ${normalizeDate(input.endDate)}
      AND (
        ${input.providerAccountIds ?? null}::text[] IS NULL
        OR provider_account_id = ANY(${input.providerAccountIds ?? null}::text[])
      )
      AND (
        ${input.campaignIds ?? null}::text[] IS NULL
        OR campaign_id = ANY(${input.campaignIds ?? null}::text[])
      )
    ORDER BY date ASC, provider_account_id ASC, campaign_id ASC, adset_id ASC
  ` as Array<{
    business_id: string;
    provider_account_id: string;
    date: string;
    campaign_id: string | null;
    adset_id: string;
    adset_name_current: string | null;
    adset_name_historical: string | null;
    adset_status: string | null;
    account_timezone: string;
    account_currency: string;
    spend: number;
    impressions: number;
    clicks: number;
    reach: number;
    frequency: number | null;
    conversions: number;
    revenue: number;
    roas: number;
    cpa: number | null;
    ctr: number | null;
    cpc: number | null;
    source_snapshot_id: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    businessId: row.business_id,
    providerAccountId: row.provider_account_id,
    date: row.date,
    campaignId: row.campaign_id,
    adsetId: row.adset_id,
    adsetNameCurrent: row.adset_name_current,
    adsetNameHistorical: row.adset_name_historical,
    adsetStatus: row.adset_status,
    accountTimezone: row.account_timezone,
    accountCurrency: row.account_currency,
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    reach: Number(row.reach ?? 0),
    frequency: row.frequency == null ? null : Number(row.frequency),
    conversions: Number(row.conversions ?? 0),
    revenue: Number(row.revenue ?? 0),
    roas: Number(row.roas ?? 0),
    cpa: row.cpa == null ? null : Number(row.cpa),
    ctr: row.ctr == null ? null : Number(row.ctr),
    cpc: row.cpc == null ? null : Number(row.cpc),
    sourceSnapshotId: row.source_snapshot_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getMetaAdDailyRange(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  providerAccountIds?: string[] | null;
}): Promise<MetaAdDailyRow[]> {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      business_id,
      provider_account_id,
      date,
      campaign_id,
      adset_id,
      ad_id,
      ad_name_current,
      ad_name_historical,
      ad_status,
      account_timezone,
      account_currency,
      spend,
      impressions,
      clicks,
      reach,
      frequency,
      conversions,
      revenue,
      roas,
      cpa,
      ctr,
      cpc,
      source_snapshot_id,
      payload_json,
      created_at,
      updated_at
    FROM meta_ad_daily
    WHERE business_id = ${input.businessId}
      AND date >= ${normalizeDate(input.startDate)}
      AND date <= ${normalizeDate(input.endDate)}
      AND (
        ${input.providerAccountIds ?? null}::text[] IS NULL
        OR provider_account_id = ANY(${input.providerAccountIds ?? null}::text[])
      )
    ORDER BY date ASC, provider_account_id ASC, ad_id ASC
  ` as Array<{
    business_id: string;
    provider_account_id: string;
    date: string;
    campaign_id: string | null;
    adset_id: string | null;
    ad_id: string;
    ad_name_current: string | null;
    ad_name_historical: string | null;
    ad_status: string | null;
    account_timezone: string;
    account_currency: string;
    spend: number;
    impressions: number;
    clicks: number;
    reach: number;
    frequency: number | null;
    conversions: number;
    revenue: number;
    roas: number;
    cpa: number | null;
    ctr: number | null;
    cpc: number | null;
    source_snapshot_id: string | null;
    payload_json: unknown;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    businessId: row.business_id,
    providerAccountId: row.provider_account_id,
    date: row.date,
    campaignId: row.campaign_id,
    adsetId: row.adset_id,
    adId: row.ad_id,
    adNameCurrent: row.ad_name_current,
    adNameHistorical: row.ad_name_historical,
    adStatus: row.ad_status,
    accountTimezone: row.account_timezone,
    accountCurrency: row.account_currency,
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    reach: Number(row.reach ?? 0),
    frequency: row.frequency == null ? null : Number(row.frequency),
    conversions: Number(row.conversions ?? 0),
    revenue: Number(row.revenue ?? 0),
    roas: Number(row.roas ?? 0),
    cpa: row.cpa == null ? null : Number(row.cpa),
    ctr: row.ctr == null ? null : Number(row.ctr),
    cpc: row.cpc == null ? null : Number(row.cpc),
    sourceSnapshotId: row.source_snapshot_id,
    payloadJson: row.payload_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getMetaCreativeDailyRange(input: {
  businessId: string;
  startDate: string;
  endDate: string;
  providerAccountIds?: string[] | null;
}): Promise<MetaCreativeDailyRow[]> {
  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    SELECT
      business_id,
      provider_account_id,
      date,
      campaign_id,
      adset_id,
      ad_id,
      creative_id,
      creative_name,
      headline,
      primary_text,
      destination_url,
      thumbnail_url,
      asset_type,
      account_timezone,
      account_currency,
      spend,
      impressions,
      clicks,
      conversions,
      revenue,
      roas,
      ctr,
      cpc,
      source_snapshot_id,
      payload_json,
      created_at,
      updated_at
    FROM meta_creative_daily
    WHERE business_id = ${input.businessId}
      AND date >= ${normalizeDate(input.startDate)}
      AND date <= ${normalizeDate(input.endDate)}
      AND (
        ${input.providerAccountIds ?? null}::text[] IS NULL
        OR provider_account_id = ANY(${input.providerAccountIds ?? null}::text[])
      )
    ORDER BY date ASC, provider_account_id ASC, creative_id ASC
  ` as Array<{
    business_id: string;
    provider_account_id: string;
    date: string;
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
    account_timezone: string;
    account_currency: string;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
    roas: number;
    ctr: number | null;
    cpc: number | null;
    source_snapshot_id: string | null;
    payload_json: unknown;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    businessId: row.business_id,
    providerAccountId: row.provider_account_id,
    date: row.date,
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
    accountTimezone: row.account_timezone,
    accountCurrency: row.account_currency,
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    reach: 0,
    frequency: null,
    conversions: Number(row.conversions ?? 0),
    revenue: Number(row.revenue ?? 0),
    roas: Number(row.roas ?? 0),
    cpa: null,
    ctr: row.ctr == null ? null : Number(row.ctr),
    cpc: row.cpc == null ? null : Number(row.cpc),
    sourceSnapshotId: row.source_snapshot_id,
    payloadJson: row.payload_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getMetaRawSnapshotsForWindow(input: {
  businessId: string;
  endpointNames: string[];
  startDate: string;
  endDate: string;
  providerAccountIds?: string[] | null;
}) {
  const endpointNames = Array.from(new Set(input.endpointNames.filter(Boolean)));
  if (endpointNames.length === 0) return [];

  await runMigrations();
  const sql = getDb();
  const rows = await sql`
    WITH ranked AS (
      SELECT
        id,
        business_id,
        provider_account_id,
        endpoint_name,
        entity_scope,
        start_date,
        end_date,
        account_timezone,
        account_currency,
        payload_json,
        payload_hash,
        request_context,
        provider_http_status,
        status,
        fetched_at,
        created_at,
        updated_at,
        ROW_NUMBER() OVER (
          PARTITION BY provider_account_id, endpoint_name, start_date, end_date
          ORDER BY fetched_at DESC, created_at DESC
        ) AS row_num
      FROM meta_raw_snapshots
      WHERE business_id = ${input.businessId}
        AND endpoint_name = ANY(${endpointNames}::text[])
        AND start_date >= ${normalizeDate(input.startDate)}
        AND end_date <= ${normalizeDate(input.endDate)}
        AND (
          ${input.providerAccountIds ?? null}::text[] IS NULL
          OR provider_account_id = ANY(${input.providerAccountIds ?? null}::text[])
        )
    )
    SELECT
      id,
      business_id,
      provider_account_id,
      endpoint_name,
      entity_scope,
      start_date,
      end_date,
      account_timezone,
      account_currency,
      payload_json,
      payload_hash,
      request_context,
      provider_http_status,
      status,
      fetched_at,
      created_at,
      updated_at
    FROM ranked
    WHERE row_num = 1
    ORDER BY start_date ASC, provider_account_id ASC, endpoint_name ASC
  ` as Array<{
    id: string;
    business_id: string;
    provider_account_id: string;
    endpoint_name: string;
    entity_scope: string;
    start_date: string;
    end_date: string;
    account_timezone: string | null;
    account_currency: string | null;
    payload_json: unknown;
    payload_hash: string;
    request_context: Record<string, unknown> | null;
    provider_http_status: number | null;
    status: MetaRawSnapshotRecord["status"];
    fetched_at: string;
    created_at: string;
    updated_at: string;
  }>;
  return rows;
}
