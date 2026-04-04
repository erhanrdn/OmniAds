import { loadEnvConfig } from "@next/env";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

loadEnvConfig(process.cwd());

async function main() {
  await runMigrations({ force: true, reason: "deploy" });
  const sql = getDb();
  const [verification] = (await sql`
    SELECT json_build_object(
      'metaSyncPartitionsLeaseEpochExists',
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'meta_sync_partitions'
          AND column_name = 'lease_epoch'
      ),
      'metaSyncCheckpointsLeaseEpochExists',
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'meta_sync_checkpoints'
          AND column_name = 'lease_epoch'
      ),
      'metaSyncPartitionsLeaseEpochNullCount',
      (
        SELECT COUNT(*)::int
        FROM meta_sync_partitions
        WHERE lease_epoch IS NULL
      ),
      'metaSyncCheckpointsLeaseEpochNullRowsExist',
      EXISTS (
        SELECT 1
        FROM meta_sync_checkpoints
        WHERE lease_epoch IS NULL
        LIMIT 1
      ),
      'metaSyncCheckpointsLeaseEpochNullCountEstimate',
      (
        SELECT CASE
          WHEN EXISTS (
            SELECT 1
            FROM meta_sync_checkpoints
            WHERE lease_epoch IS NULL
            LIMIT 1
          )
            THEN GREATEST(0, FLOOR(reltuples))::bigint
          ELSE 0
        END
        FROM pg_class
        WHERE oid = 'meta_sync_checkpoints'::regclass
        LIMIT 1
      ),
      'metaSyncCheckpointsLeaseEpochNullCount',
      (
        SELECT COUNT(*)::int
        FROM (
          SELECT 1
          FROM meta_sync_checkpoints
          WHERE lease_epoch IS NULL
          LIMIT 1000
        ) limited_rows
      )
    ) AS summary
  `) as Array<{ summary: unknown }>;

  console.log(JSON.stringify(verification?.summary ?? null, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
