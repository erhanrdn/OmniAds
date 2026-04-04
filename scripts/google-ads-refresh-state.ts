import { configureOperationalScriptRuntime } from "./_operational-runtime";

async function main() {
  configureOperationalScriptRuntime();
  const { refreshGoogleAdsSyncStateForBusiness } =
    await import("@/lib/sync/google-ads-sync");
  const businessId = process.argv[2];
  if (!businessId) {
    console.error(
      "usage: node --import tsx scripts/google-ads-refresh-state.ts <businessId>",
    );
    process.exit(1);
  }

  await refreshGoogleAdsSyncStateForBusiness({ businessId });
  console.log(JSON.stringify({ businessId, refreshed: true }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
