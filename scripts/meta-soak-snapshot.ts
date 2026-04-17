import { configureOperationalScriptRuntime } from "./_operational-runtime";
import { runOperationalMigrationsIfEnabled } from "./_operational-runtime";

async function main() {
  const runtime = configureOperationalScriptRuntime();
  const { getMetaAuthoritativeBusinessOpsSnapshot } =
    await import("@/lib/meta/warehouse");
  const { buildMetaSoakSnapshotOutput } =
    await import("@/lib/meta/authoritative-ops");
  const { getDb } = await import("@/lib/db");
  const { runMigrations } = await import("@/lib/migrations");

  const businessId = process.argv[2];
  const sinceIso = process.argv[3] ?? null;

  if (!businessId || businessId === "--help") {
    console.log(
      "usage: node --import tsx scripts/meta-soak-snapshot.ts <businessId> [sinceIso]",
    );
    process.exit(businessId ? 0 : 1);
  }

  const authoritative = await getMetaAuthoritativeBusinessOpsSnapshot({ businessId });
  let progressDiff: { states?: Array<Record<string, unknown>>; partitions?: Array<Record<string, unknown>> } | null = null;

  if (sinceIso) {
    await runOperationalMigrationsIfEnabled(runtime);
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
    ])) as unknown as [Array<Record<string, unknown>>, Array<Record<string, unknown>>];
    progressDiff = { states, partitions };
  }

  console.log(
    JSON.stringify(
      buildMetaSoakSnapshotOutput({
        businessId,
        capturedAt: new Date().toISOString(),
        sinceIso,
        authoritative,
        progressDiff,
      }),
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
