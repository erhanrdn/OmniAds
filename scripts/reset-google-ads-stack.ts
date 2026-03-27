import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql.query("DELETE FROM provider_reporting_snapshots WHERE provider IN ('google_ads','google_ads_gaql')");
  await sql.query("DELETE FROM provider_sync_jobs WHERE provider = 'google_ads'");
  await sql.query("DELETE FROM provider_account_assignments WHERE provider = 'google'");
  await sql.query("DELETE FROM provider_account_snapshots WHERE provider = 'google'");
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
  await sql.query(`
    UPDATE integrations
    SET
      status = 'disconnected',
      access_token = NULL,
      refresh_token = NULL,
      token_expires_at = NULL,
      error_message = NULL,
      metadata = '{}'::jsonb,
      disconnected_at = now(),
      updated_at = now()
    WHERE provider = 'google'
  `);
  console.log("google_reset_done");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
