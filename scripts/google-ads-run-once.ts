import { configureOperationalScriptRuntime } from "./_operational-runtime";

async function main() {
  configureOperationalScriptRuntime();
  if (!process.env.SYNC_WORKER_MODE) {
    process.env.SYNC_WORKER_MODE = "1";
  }
  if (!process.env.WORKER_INSTANCE_ID) {
    process.env.WORKER_INSTANCE_ID = `script-google-ads-run-once:${process.pid}`;
  }
  const { syncGoogleAdsReports } = await import("@/lib/sync/google-ads-sync");
  const businessId = process.argv[2];
  if (!businessId) {
    console.error(
      "usage: node --import tsx scripts/google-ads-run-once.ts <businessId>",
    );
    process.exit(1);
  }

  const result = await syncGoogleAdsReports(businessId);
  console.log(JSON.stringify({ businessId, result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
