import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import { clearCachedReports } from "@/lib/reporting-cache";

export interface MetaCleanupSummary {
  providerReportingSnapshotsDeleted: number;
  metaConfigSnapshotsDeleted: number;
  metaCreativesSnapshotsDeleted: number;
  metaRawSnapshotsDeleted: number;
  metaSyncJobsDeleted: number;
  metaAccountDailyDeleted: number;
  metaCampaignDailyDeleted: number;
  metaAdsetDailyDeleted: number;
  metaAdDailyDeleted: number;
  metaCreativeDailyDeleted: number;
  providerAssignmentsDeleted: number;
  integrationsDisconnected: number;
}

export interface MetaCacheCleanupSummary {
  providerReportingSnapshotsDeleted: number;
  metaCreativesSnapshotsDeleted: number;
}

export interface MetaCreativeMediaPruneSummary {
  metaAdDailyUpdated: number;
  metaCreativeDailyUpdated: number;
}

export interface MetaSucceededParentRunningCheckpointCleanupGroup {
  checkpointScope: string;
  phase: string;
  epochBucket: "epoch_match" | "epoch_mismatch" | "checkpoint_epoch_null";
  timingBucket:
    | "checkpoint_updated_before_or_at_parent_finished"
    | "checkpoint_updated_after_parent_finished";
  count: number;
}

export interface MetaSucceededParentRunningCheckpointCleanupSummary {
  businessId: string | null;
  totalClosed: number;
  remainingRunningChildrenOfSucceededParents: number;
  groups: MetaSucceededParentRunningCheckpointCleanupGroup[];
}

async function execCount(query: Promise<unknown>) {
  const rows = await query;
  const first = Array.isArray(rows) ? rows[0] : null;
  const raw = (first as { count?: number | string } | undefined)?.count ?? 0;
  const count = typeof raw === "string" ? Number(raw) : Number(raw);
  return Number.isFinite(count) ? count : 0;
}

export async function purgeAllMetaDataAndDisconnect(): Promise<MetaCleanupSummary> {
  await runMigrations();
  const sql = getDb();

  const providerReportingSnapshotsDeleted = await execCount(sql`
    WITH deleted AS (
      DELETE FROM provider_reporting_snapshots
      WHERE provider = 'meta'
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM deleted
  `);
  const metaConfigSnapshotsDeleted = await execCount(sql`
    WITH deleted AS (
      DELETE FROM meta_config_snapshots
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM deleted
  `);
  const metaCreativesSnapshotsDeleted = await execCount(sql`
    WITH deleted AS (
      DELETE FROM meta_creatives_snapshots
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM deleted
  `);
  const metaCreativeDailyDeleted = await execCount(sql`
    WITH deleted AS (
      DELETE FROM meta_creative_daily
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM deleted
  `);
  const metaAdDailyDeleted = await execCount(sql`
    WITH deleted AS (
      DELETE FROM meta_ad_daily
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM deleted
  `);
  const metaAdsetDailyDeleted = await execCount(sql`
    WITH deleted AS (
      DELETE FROM meta_adset_daily
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM deleted
  `);
  const metaCampaignDailyDeleted = await execCount(sql`
    WITH deleted AS (
      DELETE FROM meta_campaign_daily
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM deleted
  `);
  const metaAccountDailyDeleted = await execCount(sql`
    WITH deleted AS (
      DELETE FROM meta_account_daily
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM deleted
  `);
  const metaRawSnapshotsDeleted = await execCount(sql`
    WITH deleted AS (
      DELETE FROM meta_raw_snapshots
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM deleted
  `);
  const metaSyncJobsDeleted = await execCount(sql`
    WITH deleted AS (
      DELETE FROM meta_sync_jobs
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM deleted
  `);

  const providerAssignmentsDeleted = await execCount(sql`
    WITH deleted AS (
      DELETE FROM provider_account_assignments
      WHERE provider = 'meta'
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM deleted
  `);

  const integrationsDisconnected = await execCount(sql`
    WITH updated AS (
      UPDATE integrations SET
        status           = 'disconnected',
        access_token     = NULL,
        refresh_token    = NULL,
        token_expires_at = NULL,
        error_message    = NULL,
        metadata         = '{}'::jsonb,
        disconnected_at  = now(),
        updated_at       = now()
      WHERE provider = 'meta'
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM updated
  `);

  return {
    providerReportingSnapshotsDeleted,
    metaConfigSnapshotsDeleted,
    metaCreativesSnapshotsDeleted,
    metaRawSnapshotsDeleted,
    metaSyncJobsDeleted,
    metaAccountDailyDeleted,
    metaCampaignDailyDeleted,
    metaAdsetDailyDeleted,
    metaAdDailyDeleted,
    metaCreativeDailyDeleted,
    providerAssignmentsDeleted,
    integrationsDisconnected,
  };
}

export async function purgeMetaLegacyCaches(businessId?: string | null): Promise<MetaCacheCleanupSummary> {
  await runMigrations();
  const sql = getDb();

  const providerReportingSnapshotsDeleted = await clearCachedReports({
    provider: "meta",
    businessId: businessId ?? null,
  });

  const metaCreativesSnapshotsDeleted = await execCount(sql`
    WITH deleted AS (
      DELETE FROM meta_creatives_snapshots
      WHERE (${businessId ?? null}::text IS NULL OR business_id = ${businessId ?? null})
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM deleted
  `);

  return {
    providerReportingSnapshotsDeleted,
    metaCreativesSnapshotsDeleted,
  };
}

export async function closeSucceededMetaParentRunningCheckpoints(input?: {
  businessId?: string | null;
}): Promise<MetaSucceededParentRunningCheckpointCleanupSummary> {
  await runMigrations({ force: true, reason: "meta_orphan_checkpoint_cleanup" });
  const sql = getDb();
  const businessId = input?.businessId?.trim() || null;

  const [row] = (await sql`
    WITH candidate_checkpoints AS (
      SELECT
        checkpoint.id,
        checkpoint.business_id,
        checkpoint.provider_account_id,
        checkpoint.checkpoint_scope,
        checkpoint.phase,
        CASE
          WHEN checkpoint.lease_epoch IS NULL THEN 'checkpoint_epoch_null'
          WHEN COALESCE(checkpoint.lease_epoch, 0) = COALESCE(partition.lease_epoch, 0)
            THEN 'epoch_match'
          ELSE 'epoch_mismatch'
        END AS epoch_bucket,
        CASE
          WHEN partition.finished_at IS NOT NULL AND checkpoint.updated_at <= partition.finished_at
            THEN 'checkpoint_updated_before_or_at_parent_finished'
          ELSE 'checkpoint_updated_after_parent_finished'
        END AS timing_bucket
      FROM meta_sync_checkpoints checkpoint
      JOIN meta_sync_partitions partition
        ON partition.id = checkpoint.partition_id
      WHERE partition.status = 'succeeded'
        AND checkpoint.status = 'running'
        AND (${businessId}::text IS NULL OR checkpoint.business_id = ${businessId})
    ),
    updated_checkpoints AS (
      UPDATE meta_sync_checkpoints checkpoint
      SET
        status = 'succeeded',
        phase = 'finalize',
        next_page_url = NULL,
        provider_cursor = NULL,
        finished_at = COALESCE(checkpoint.finished_at, now()),
        updated_at = now()
      FROM candidate_checkpoints candidate
      WHERE checkpoint.id = candidate.id
      RETURNING
        candidate.checkpoint_scope,
        candidate.phase,
        candidate.epoch_bucket,
        candidate.timing_bucket
    ),
    grouped AS (
      SELECT
        checkpoint_scope,
        phase,
        epoch_bucket,
        timing_bucket,
        COUNT(*)::int AS row_count
      FROM updated_checkpoints
      GROUP BY checkpoint_scope, phase, epoch_bucket, timing_bucket
    )
    SELECT json_build_object(
      'businessId', ${businessId}::text,
      'totalClosed', COALESCE((SELECT SUM(row_count)::int FROM grouped), 0),
      'groups',
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'checkpointScope', checkpoint_scope,
              'phase', phase,
              'epochBucket', epoch_bucket,
              'timingBucket', timing_bucket,
              'count', row_count
            )
            ORDER BY checkpoint_scope, phase, epoch_bucket, timing_bucket
          )
          FROM grouped
        ),
        '[]'::json
      )
    ) AS summary
  `) as Array<{ summary: MetaSucceededParentRunningCheckpointCleanupSummary }>;

  const [remainingRow] = (await sql`
    SELECT COUNT(*)::int AS count
    FROM meta_sync_checkpoints checkpoint
    JOIN meta_sync_partitions partition
      ON partition.id = checkpoint.partition_id
    WHERE partition.status = 'succeeded'
      AND checkpoint.status = 'running'
      AND (${businessId}::text IS NULL OR checkpoint.business_id = ${businessId})
  `) as Array<{ count: number }>;

  const remainingRunningChildrenOfSucceededParents =
    typeof remainingRow?.count === "number" ? remainingRow.count : 0;

  if (row?.summary) {
    return {
      ...row.summary,
      remainingRunningChildrenOfSucceededParents,
    };
  }

  return {
    businessId,
    totalClosed: 0,
    remainingRunningChildrenOfSucceededParents,
    groups: [],
  };
}

export async function pruneMetaCreativeMediaOutsideRetention(input: {
  businessId?: string | null;
  keepFromDate: string;
}): Promise<MetaCreativeMediaPruneSummary> {
  await runMigrations();
  const sql = getDb();

  const metaAdDailyUpdated = await execCount(sql`
    WITH updated AS (
      UPDATE meta_ad_daily
      SET
        payload_json = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    COALESCE(payload_json, '{}'::jsonb),
                    '{preview_url}',
                    'null'::jsonb,
                    true
                  ),
                  '{thumbnail_url}',
                  'null'::jsonb,
                  true
                ),
                '{image_url}',
                'null'::jsonb,
                true
              ),
              '{table_thumbnail_url}',
              'null'::jsonb,
              true
            ),
            '{card_preview_url}',
            'null'::jsonb,
            true
          ),
          '{preview}',
          jsonb_set(
            jsonb_set(
              jsonb_set(COALESCE(payload_json->'preview', '{}'::jsonb), '{image_url}', 'null'::jsonb, true),
              '{poster_url}',
              'null'::jsonb,
              true
            ),
            '{video_url}',
            'null'::jsonb,
            true
          ),
          true
        ),
        updated_at = now()
      WHERE (${input.businessId ?? null}::text IS NULL OR business_id = ${input.businessId ?? null})
        AND date::date < ${input.keepFromDate}::date
        AND (
          NULLIF(payload_json->>'preview_url', '') IS NOT NULL OR
          NULLIF(payload_json->>'thumbnail_url', '') IS NOT NULL OR
          NULLIF(payload_json->>'image_url', '') IS NOT NULL OR
          NULLIF(payload_json->>'table_thumbnail_url', '') IS NOT NULL OR
          NULLIF(payload_json->>'card_preview_url', '') IS NOT NULL OR
          NULLIF(payload_json->'preview'->>'image_url', '') IS NOT NULL OR
          NULLIF(payload_json->'preview'->>'poster_url', '') IS NOT NULL OR
          NULLIF(payload_json->'preview'->>'video_url', '') IS NOT NULL
        )
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM updated
  `);

  const metaCreativeDailyUpdated = await execCount(sql`
    WITH updated AS (
      UPDATE meta_creative_daily
      SET
        thumbnail_url = NULL,
        payload_json = jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    COALESCE(payload_json, '{}'::jsonb),
                    '{preview_url}',
                    'null'::jsonb,
                    true
                  ),
                  '{thumbnail_url}',
                  'null'::jsonb,
                  true
                ),
                '{image_url}',
                'null'::jsonb,
                true
              ),
              '{table_thumbnail_url}',
              'null'::jsonb,
              true
            ),
            '{card_preview_url}',
            'null'::jsonb,
            true
          ),
          '{preview}',
          jsonb_set(
            jsonb_set(
              jsonb_set(COALESCE(payload_json->'preview', '{}'::jsonb), '{image_url}', 'null'::jsonb, true),
              '{poster_url}',
              'null'::jsonb,
              true
            ),
            '{video_url}',
            'null'::jsonb,
            true
          ),
          true
        ),
        updated_at = now()
      WHERE (${input.businessId ?? null}::text IS NULL OR business_id = ${input.businessId ?? null})
        AND date::date < ${input.keepFromDate}::date
        AND (
          thumbnail_url IS NOT NULL OR
          NULLIF(payload_json->>'preview_url', '') IS NOT NULL OR
          NULLIF(payload_json->>'thumbnail_url', '') IS NOT NULL OR
          NULLIF(payload_json->>'image_url', '') IS NOT NULL OR
          NULLIF(payload_json->>'table_thumbnail_url', '') IS NOT NULL OR
          NULLIF(payload_json->>'card_preview_url', '') IS NOT NULL OR
          NULLIF(payload_json->'preview'->>'image_url', '') IS NOT NULL OR
          NULLIF(payload_json->'preview'->>'poster_url', '') IS NOT NULL OR
          NULLIF(payload_json->'preview'->>'video_url', '') IS NOT NULL
        )
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM updated
  `);

  return {
    metaAdDailyUpdated,
    metaCreativeDailyUpdated,
  };
}
