import { loadEnvConfig } from "@next/env";
import { replayGoogleAdsDeadLetterPartitions } from "@/lib/google-ads/warehouse";
import type { GoogleAdsWarehouseScope } from "@/lib/google-ads/warehouse-types";

loadEnvConfig(process.cwd());

const GOOGLE_ADS_SCOPES: GoogleAdsWarehouseScope[] = [
  "account_daily",
  "campaign_daily",
  "ad_group_daily",
  "ad_daily",
  "keyword_daily",
  "search_term_daily",
  "asset_group_daily",
  "asset_daily",
  "audience_daily",
  "geo_daily",
  "device_daily",
  "product_daily",
];

async function main() {
  const businessId = process.argv[2];
  const requestedScope = process.argv[3] ?? null;
  if (!businessId) {
    console.error(
      "usage: node --import tsx scripts/google-ads-replay-dead-letter.ts <businessId> [scope]"
    );
    process.exit(1);
  }

  const rows = await replayGoogleAdsDeadLetterPartitions({
    businessId,
    scope:
      requestedScope && GOOGLE_ADS_SCOPES.includes(requestedScope as GoogleAdsWarehouseScope)
        ? (requestedScope as GoogleAdsWarehouseScope)
        : null,
  });

  console.log(
    JSON.stringify(
      {
        businessId,
        scope: requestedScope,
        replayedCount: rows.length,
        rows,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
