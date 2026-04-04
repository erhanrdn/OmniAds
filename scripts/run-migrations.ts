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
        FROM pg_attribute attribute
        JOIN pg_class class ON class.oid = attribute.attrelid
        WHERE class.oid = 'meta_sync_partitions'::regclass
          AND attribute.attname = 'lease_epoch'
          AND NOT attribute.attisdropped
      ),
      'metaSyncCheckpointsLeaseEpochExists',
      EXISTS (
        SELECT 1
        FROM pg_attribute attribute
        JOIN pg_class class ON class.oid = attribute.attrelid
        WHERE class.oid = 'meta_sync_checkpoints'::regclass
          AND attribute.attname = 'lease_epoch'
          AND NOT attribute.attisdropped
      ),
      'metaSyncPartitionsLeaseEpochNullCount',
      (
        SELECT COUNT(*)::int
        FROM meta_sync_partitions
        WHERE lease_epoch IS NULL
      ),
      'metaSyncCheckpointsLeaseEpochNullCountEstimate',
      (
        SELECT CASE
          WHEN stats.null_frac IS NULL
            THEN NULL
          ELSE GREATEST(0, FLOOR(class.reltuples * stats.null_frac))::bigint
        END
        FROM pg_class class
        LEFT JOIN pg_stats stats
          ON stats.schemaname = 'public'
         AND stats.tablename = 'meta_sync_checkpoints'
         AND stats.attname = 'lease_epoch'
        WHERE class.oid = 'meta_sync_checkpoints'::regclass
        LIMIT 1
      )
    ) AS summary
  `) as Array<{ summary: unknown }>;

  console.log(JSON.stringify(verification?.summary ?? null, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
