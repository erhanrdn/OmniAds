import { loadEnvConfig } from "@next/env";
import { getDb } from "@/lib/db";
import { configureOperationalScriptRuntime } from "./_operational-runtime";

loadEnvConfig(process.cwd());

async function main() {
  configureOperationalScriptRuntime({
    lane: "read_only_observation",
  });
  const businessId = process.argv[2];
  const sinceIso = process.argv[3];
  if (!businessId || !sinceIso) {
    console.error("usage: node --import tsx scripts/meta-progress-diff.ts <businessId> <sinceIso>");
    process.exit(1);
  }

  const sql = getDb();
  const [states, partitions] = (await Promise.all([
    sql`
      SELECT scope, provider_account_id, completed_days, ready_through_date, updated_at
      FROM meta_sync_state
      WHERE business_id = ${businessId}
        AND updated_at >= ${sinceIso}
      ORDER BY scope, provider_account_id, updated_at DESC
    `,
    sql`
      SELECT lane, scope, status, COUNT(*)::int AS count, MAX(updated_at) AS latest_updated_at
      FROM meta_sync_partitions
      WHERE business_id = ${businessId}
        AND updated_at >= ${sinceIso}
      GROUP BY lane, scope, status
      ORDER BY lane, scope, status
    `,
  ])) as [Array<Record<string, unknown>>, Array<Record<string, unknown>>];

  console.log(JSON.stringify({ businessId, sinceIso, states, partitions }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
