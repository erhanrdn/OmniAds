import { configureOperationalScriptRuntime } from "./_operational-runtime";

async function main() {
  configureOperationalScriptRuntime();
  const { syncMetaReports } = await import("@/lib/sync/meta-sync");
  const { getMetaAuthoritativeBusinessOpsSnapshot } =
    await import("@/lib/meta/warehouse");
  const { buildMetaStateCheckOutput } =
    await import("@/lib/meta/authoritative-ops");
  const businessId = process.argv[2];
  if (!businessId) {
    console.error(
      "usage: node --import tsx scripts/meta-reschedule.ts <businessId>",
    );
    process.exit(1);
  }
  if (process.env.SYNC_WORKER_MODE === "1" && !process.env.META_WORKER_ID) {
    process.env.META_WORKER_ID = `meta-repair:${businessId}`;
  }
  const result = await syncMetaReports(businessId);
  const snapshot = await getMetaAuthoritativeBusinessOpsSnapshot({ businessId }).catch(() => null);
  console.log(
    JSON.stringify(
      {
        businessId,
        result,
        authoritative: snapshot ? buildMetaStateCheckOutput(snapshot) : null,
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
