import { configureOperationalScriptRuntime } from "./_operational-runtime";

async function main() {
  configureOperationalScriptRuntime();
  const {
    enqueueGoogleAdsScheduledWork,
    refreshGoogleAdsSyncStateForBusiness,
  } = await import("@/lib/sync/google-ads-sync");
  const businessId = process.argv[2];
  if (!businessId) {
    console.error(
      "usage: node --import tsx scripts/google-ads-reschedule.ts <businessId>",
    );
    process.exit(1);
  }

  const result = await enqueueGoogleAdsScheduledWork(businessId);
  await refreshGoogleAdsSyncStateForBusiness({ businessId }).catch(() => null);
  console.log(JSON.stringify({ businessId, result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
