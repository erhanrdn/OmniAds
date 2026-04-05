import { configureOperationalScriptRuntime } from "./_operational-runtime";

async function main() {
  configureOperationalScriptRuntime();
  const { syncMetaRepairRange } = await import("@/lib/sync/meta-sync");

  const businessId = process.argv[2];
  const startDate = process.argv[3];
  const endDate = process.argv[4];

  if (!businessId || !startDate || !endDate) {
    console.error(
      "usage: node --import tsx scripts/meta-repair-config-history.ts <businessId> <startDate> <endDate>",
    );
    process.exit(1);
  }

  const result = await syncMetaRepairRange({
    businessId,
    startDate,
    endDate,
  });

  console.log(
    JSON.stringify(
      {
        businessId,
        startDate,
        endDate,
        scopes: ["campaign_daily", "adset_daily"],
        result,
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
