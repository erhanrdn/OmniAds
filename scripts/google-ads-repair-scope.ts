import { loadEnvConfig } from "@next/env";
import { runGoogleAdsTargetedRepair } from "@/lib/sync/google-ads-sync";
import type { GoogleAdsWarehouseScope } from "@/lib/google-ads/warehouse-types";

loadEnvConfig(process.cwd());

async function main() {
  const businessId = process.argv[2];
  const scope = process.argv[3] as GoogleAdsWarehouseScope | undefined;
  const startDate = process.argv[4];
  const endDate = process.argv[5];

  if (!businessId || !scope || !startDate || !endDate) {
    console.error(
      "usage: node --import tsx scripts/google-ads-repair-scope.ts <businessId> <scope> <startDate> <endDate>"
    );
    process.exit(1);
  }

  const result = await runGoogleAdsTargetedRepair({
    businessId,
    scope,
    startDate,
    endDate,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
