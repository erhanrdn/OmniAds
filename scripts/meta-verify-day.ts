import { configureOperationalScriptRuntime } from "./_operational-runtime";

async function main() {
  configureOperationalScriptRuntime();
  const { getMetaAuthoritativeDayVerification } =
    await import("@/lib/meta/warehouse");
  const { buildMetaVerifyDayReport } =
    await import("@/lib/meta/authoritative-ops");

  const businessId = process.argv[2];
  const providerAccountId = process.argv[3];
  const day = process.argv[4];

  if (!businessId || businessId === "--help" || !providerAccountId || !day) {
    console.log(
      "usage: node --import tsx scripts/meta-verify-day.ts <businessId> <providerAccountId> <day>",
    );
    process.exit(businessId === "--help" ? 0 : 1);
  }

  const verification = await getMetaAuthoritativeDayVerification({
    businessId,
    providerAccountId,
    day,
  });

  console.log(JSON.stringify(buildMetaVerifyDayReport(verification), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
