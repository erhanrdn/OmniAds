import { getDb } from "@/lib/db";
import { clearAllProviderAccountAssignmentsForProvider } from "@/lib/provider-account-assignments";
import { clearAllProviderAccountSnapshotsForProvider } from "@/lib/provider-account-snapshots";
import { disconnectAllIntegrationsForProvider } from "@/lib/integrations";

async function main() {
  const sql = getDb();
  await sql.query("DELETE FROM provider_reporting_snapshots WHERE provider IN ('google_ads','google_ads_gaql')");
  await sql.query("DELETE FROM provider_sync_jobs WHERE provider = 'google_ads'");
  await clearAllProviderAccountAssignmentsForProvider("google");
  await clearAllProviderAccountSnapshotsForProvider("google");
  await sql.query("DELETE FROM google_ads_product_daily");
  await sql.query("DELETE FROM google_ads_device_daily");
  await sql.query("DELETE FROM google_ads_geo_daily");
  await sql.query("DELETE FROM google_ads_audience_daily");
  await sql.query("DELETE FROM google_ads_asset_daily");
  await sql.query("DELETE FROM google_ads_asset_group_daily");
  await sql.query("DELETE FROM google_ads_search_term_daily");
  await sql.query("DELETE FROM google_ads_keyword_daily");
  await sql.query("DELETE FROM google_ads_ad_daily");
  await sql.query("DELETE FROM google_ads_ad_group_daily");
  await sql.query("DELETE FROM google_ads_campaign_daily");
  await sql.query("DELETE FROM google_ads_account_daily");
  await sql.query("DELETE FROM google_ads_raw_snapshots");
  await sql.query("DELETE FROM google_ads_sync_jobs");
  await disconnectAllIntegrationsForProvider("google");
  console.log("google_reset_done");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
