import { configureOperationalScriptRuntime } from "./_operational-runtime";
import { cleanupMetaPartitionOrchestration } from "@/lib/meta/warehouse";

async function main() {
  configureOperationalScriptRuntime();
  const { getMetaAuthoritativeBusinessOpsSnapshot } =
    await import("@/lib/meta/warehouse");
  const { buildMetaStateCheckOutput } =
    await import("@/lib/meta/authoritative-ops");
  const businessId = process.argv[2];
  if (!businessId) {
    console.error("usage: node --import tsx scripts/meta-cleanup.ts <businessId>");
    process.exit(1);
  }
  const result = await cleanupMetaPartitionOrchestration({ businessId });
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
