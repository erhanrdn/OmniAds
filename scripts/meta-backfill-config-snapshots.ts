import { configureOperationalScriptRuntime } from "./_operational-runtime";

async function main() {
  configureOperationalScriptRuntime();
  const { backfillMetaCampaignConfigSnapshots } = await import("@/lib/api/meta");
  const businessId = process.argv[2];

  if (!businessId) {
    console.error(
      "usage: node --import tsx scripts/meta-backfill-config-snapshots.ts <businessId> [providerAccountId]",
    );
    process.exit(1);
  }
  const providerAccountId = process.argv[3] ?? null;
  const result = await backfillMetaCampaignConfigSnapshots({
    businessId,
    providerAccountId,
  });
  console.log(
    JSON.stringify(
      result,
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
