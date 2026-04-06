import { loadEnvConfig } from "@next/env";
import { getDbWithTimeout, resetDbClientCache } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

loadEnvConfig(process.cwd());

const DEPLOY_MIGRATION_TIMEOUT_MS = 120_000;

async function main() {
  await runMigrations({
    force: true,
    reason: "deploy",
    timeoutMs: DEPLOY_MIGRATION_TIMEOUT_MS,
  });
  const sql = getDbWithTimeout(DEPLOY_MIGRATION_TIMEOUT_MS);
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
      'metaSyncCheckpointsLeaseEpochNullRowsPresent',
      (
        SELECT EXISTS (
          SELECT 1
          FROM meta_sync_checkpoints
          WHERE lease_epoch IS NULL
          LIMIT 1
        )
      )
    ) AS summary
  `) as Array<{ summary: unknown }>;

  console.log(JSON.stringify(verification?.summary ?? null, null, 2));
}

main()
  .then(() => {
    resetDbClientCache();
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    resetDbClientCache();
    process.exit(1);
  });
