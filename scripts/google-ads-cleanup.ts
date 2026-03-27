import { loadEnvConfig } from "@next/env";
import { cleanupGoogleAdsPartitionOrchestration } from "@/lib/google-ads/warehouse";

loadEnvConfig(process.cwd());

async function main() {
  const businessId = process.argv[2];
  if (!businessId) {
    console.error("usage: node --import tsx scripts/google-ads-cleanup.ts <businessId>");
    process.exit(1);
  }

  const result = await cleanupGoogleAdsPartitionOrchestration({ businessId });
  console.log(JSON.stringify({ businessId, result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
