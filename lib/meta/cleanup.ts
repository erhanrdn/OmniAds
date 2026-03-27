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
