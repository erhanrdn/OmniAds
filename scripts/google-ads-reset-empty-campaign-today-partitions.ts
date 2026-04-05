import { getDb } from "@/lib/db";
import { configureOperationalScriptRuntime } from "./_operational-runtime";

async function main() {
  configureOperationalScriptRuntime();
  const businessIds = process.argv.slice(2);
  if (businessIds.length === 0) {
    console.error(
      "usage: node --import tsx scripts/google-ads-reset-empty-campaign-today-partitions.ts <businessId> [businessId...]",
    );
    process.exit(1);
  }

  const sql = getDb();
  const rows = (await sql.query(
    `
      WITH candidates AS (
        SELECT partition.id
        FROM google_ads_sync_partitions partition
        LEFT JOIN google_ads_sync_checkpoints checkpoint
          ON checkpoint.partition_id = partition.id
          AND checkpoint.checkpoint_scope = 'campaign_daily'
        WHERE partition.business_id = ANY($1::text[])
          AND partition.scope = 'campaign_daily'
          AND partition.lane = 'maintenance'
          AND partition.source = 'today'
          AND partition.status = 'succeeded'
        GROUP BY partition.id
        HAVING MAX(
          CASE
            WHEN checkpoint.status = 'succeeded'
              AND COALESCE(checkpoint.rows_written, 0) = 0
            THEN 1
            ELSE 0
          END
        ) = 1
      )
      UPDATE google_ads_sync_partitions partition
      SET
        status = 'queued',
        lease_owner = NULL,
        lease_expires_at = NULL,
        finished_at = NULL,
        last_error = 'requeued after empty campaign_daily false-success guard',
        next_retry_at = now(),
        updated_at = now()
      FROM candidates
      WHERE partition.id = candidates.id
      RETURNING
        partition.id,
        partition.business_id,
        partition.provider_account_id,
        partition.partition_date,
        partition.attempt_count
    `,
    [businessIds],
  )) as Array<Record<string, unknown>>;

  console.log(
    JSON.stringify(
      {
        businessIds,
        resetCount: rows.length,
        rows,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
