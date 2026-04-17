import {
  assertOperationalOwnerMaintenance,
  configureOperationalScriptRuntime,
  runOperationalMigrationsIfEnabled,
} from "./_operational-runtime";
import { getDb } from "@/lib/db";

async function main() {
  const runtime = configureOperationalScriptRuntime({
    lane: "owner_maintenance",
  });
  assertOperationalOwnerMaintenance({
    runtimeMigrationsEnabled: runtime.runtimeMigrationsEnabled,
    scriptName: "meta-truth-state-cleanup",
  });
  await runOperationalMigrationsIfEnabled({
    runtimeMigrationsEnabled: runtime.runtimeMigrationsEnabled,
    lane: runtime.lane,
    scriptName: "meta-truth-state-cleanup",
  });
  const sql = getDb();

  await sql.query("BEGIN");
  try {
    await sql`
      UPDATE meta_account_daily
      SET
        truth_state = COALESCE(truth_state, 'finalized'),
        truth_version = COALESCE(truth_version, 1),
        validation_status = COALESCE(validation_status, 'passed'),
        finalized_at = COALESCE(finalized_at, updated_at, created_at, now()),
        source_run_id = COALESCE(source_run_id, 'legacy-backfill')
      WHERE truth_state IS NULL
         OR truth_version IS NULL
         OR validation_status IS NULL
    `;
    await sql`
      UPDATE meta_campaign_daily
      SET
        truth_state = COALESCE(truth_state, 'finalized'),
        truth_version = COALESCE(truth_version, 1),
        validation_status = COALESCE(validation_status, 'passed'),
        finalized_at = COALESCE(finalized_at, updated_at, created_at, now()),
        source_run_id = COALESCE(source_run_id, 'legacy-backfill')
      WHERE truth_state IS NULL
         OR truth_version IS NULL
         OR validation_status IS NULL
    `;
    await sql`
      UPDATE meta_adset_daily
      SET
        truth_state = COALESCE(truth_state, 'finalized'),
        truth_version = COALESCE(truth_version, 1),
        validation_status = COALESCE(validation_status, 'passed'),
        finalized_at = COALESCE(finalized_at, updated_at, created_at, now()),
        source_run_id = COALESCE(source_run_id, 'legacy-backfill')
      WHERE truth_state IS NULL
         OR truth_version IS NULL
         OR validation_status IS NULL
    `;
    await sql`
      UPDATE meta_breakdown_daily
      SET
        truth_state = COALESCE(truth_state, 'finalized'),
        truth_version = COALESCE(truth_version, 1),
        validation_status = COALESCE(validation_status, 'passed'),
        finalized_at = COALESCE(finalized_at, updated_at, created_at, now()),
        source_run_id = COALESCE(source_run_id, 'legacy-backfill')
      WHERE truth_state IS NULL
         OR truth_version IS NULL
         OR validation_status IS NULL
    `.catch(() => undefined);
    await sql.query("COMMIT");
  } catch (error) {
    await sql.query("ROLLBACK").catch(() => undefined);
    throw error;
  }

  const [account, campaign, adset, breakdown] = await Promise.all([
    (sql`SELECT COUNT(*)::int AS count FROM meta_account_daily WHERE truth_state IS NULL` as unknown as Promise<Array<{ count: number }>>),
    (sql`SELECT COUNT(*)::int AS count FROM meta_campaign_daily WHERE truth_state IS NULL` as unknown as Promise<Array<{ count: number }>>),
    (sql`SELECT COUNT(*)::int AS count FROM meta_adset_daily WHERE truth_state IS NULL` as unknown as Promise<Array<{ count: number }>>),
    (sql`SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'meta_breakdown_daily'` as unknown as Promise<Array<{ count: number }>>),
  ]);

  const remainingBreakdownNulls =
    Number(breakdown[0]?.count ?? 0) > 0
      ? ((await (sql`SELECT COUNT(*)::int AS count FROM meta_breakdown_daily WHERE truth_state IS NULL` as unknown as Promise<Array<{ count: number }>>))[0]?.count ?? 0)
      : 0;

  const summary = {
    accountNullTruthState: Number(account[0]?.count ?? 0),
    campaignNullTruthState: Number(campaign[0]?.count ?? 0),
    adsetNullTruthState: Number(adset[0]?.count ?? 0),
    breakdownNullTruthState: Number(remainingBreakdownNulls),
    cleanupComplete:
      Number(account[0]?.count ?? 0) === 0 &&
      Number(campaign[0]?.count ?? 0) === 0 &&
      Number(adset[0]?.count ?? 0) === 0 &&
      Number(remainingBreakdownNulls) === 0,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
