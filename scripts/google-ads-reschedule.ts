import { loadEnvConfig } from "@next/env";
import { scheduleGoogleAdsBackgroundSync, syncGoogleAdsReports } from "@/lib/sync/google-ads-sync";

loadEnvConfig(process.cwd());

async function main() {
  const businessId = process.argv[2];
  if (!businessId) {
    console.error("usage: node --import tsx scripts/google-ads-reschedule.ts <businessId>");
    process.exit(1);
  }

  scheduleGoogleAdsBackgroundSync({ businessId, delayMs: 0 });
  const result = await syncGoogleAdsReports(businessId);
  console.log(JSON.stringify({ businessId, result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
