import { configureOperationalScriptRuntime } from "./_operational-runtime";

async function main() {
  configureOperationalScriptRuntime();
  const { refreshMetaSyncStateForBusiness } =
    await import("@/lib/sync/meta-sync");
  const businessId = process.argv[2];
  if (!businessId) {
    console.error(
      "usage: node --import tsx scripts/meta-refresh-state.ts <businessId>",
    );
    process.exit(1);
  }
  await refreshMetaSyncStateForBusiness({ businessId });
  console.log(JSON.stringify({ businessId, ok: true }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
