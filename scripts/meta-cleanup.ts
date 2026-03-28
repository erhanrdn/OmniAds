import { cleanupMetaPartitionOrchestration } from "@/lib/meta/warehouse";

async function main() {
  const businessId = process.argv[2];
  if (!businessId) {
    console.error("usage: node --import tsx scripts/meta-cleanup.ts <businessId>");
    process.exit(1);
  }
  const result = await cleanupMetaPartitionOrchestration({ businessId });
  console.log(JSON.stringify({ businessId, result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
