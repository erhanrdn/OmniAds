-- live-db-baseline-checks.sql
-- Read-only baseline verification pack for production/staging DBs.
-- Safe usage: run each query independently and capture output before any refactor phase.

-- -----------------------------------------------------------------------------
-- 1) Table-level approximate row count and family summary
-- -----------------------------------------------------------------------------
WITH tracked_tables AS (
  SELECT *
  FROM (
    VALUES
      ('core', 'users'),
      ('core', 'businesses'),
      ('core', 'memberships'),
      ('core', 'sessions'),
      ('core', 'invites'),
      ('core', 'integrations'),
      ('core', 'provider_account_assignments'),
      ('core', 'provider_account_snapshots'),
      ('core', 'business_cost_models'),
      ('core', 'shopify_subscriptions'),
      ('core', 'shopify_install_contexts'),
      ('core', 'discount_codes'),
      ('core', 'discount_redemptions'),
      ('core', 'custom_reports'),
      ('control', 'provider_account_rollover_state'),
      ('control', 'provider_cooldown_state'),
      ('control', 'provider_quota_usage'),
      ('control', 'provider_sync_jobs'),
      ('control', 'meta_sync_jobs'),
      ('control', 'meta_sync_partitions'),
      ('control', 'meta_sync_runs'),
      ('control', 'meta_sync_checkpoints'),
      ('control', 'meta_sync_state'),
      ('control', 'google_ads_sync_jobs'),
      ('control', 'google_ads_sync_partitions'),
      ('control', 'google_ads_sync_runs'),
      ('control', 'google_ads_sync_checkpoints'),
      ('control', 'google_ads_sync_state'),
      ('control', 'google_ads_runner_leases'),
      ('control', 'sync_runner_leases'),
      ('control', 'sync_worker_heartbeats'),
      ('control', 'shopify_sync_state'),
      ('control', 'shopify_repair_intents'),
      ('control', 'shopify_serving_overrides'),
      ('raw', 'meta_raw_snapshots'),
      ('raw', 'google_ads_raw_snapshots'),
      ('raw', 'shopify_raw_snapshots'),
      ('warehouse', 'meta_config_snapshots'),
      ('warehouse', 'meta_account_daily'),
      ('warehouse', 'meta_campaign_daily'),
      ('warehouse', 'meta_adset_daily'),
      ('warehouse', 'meta_breakdown_daily'),
      ('warehouse', 'meta_ad_daily'),
      ('warehouse', 'meta_creative_daily'),
      ('warehouse', 'meta_authoritative_source_manifests'),
      ('warehouse', 'meta_authoritative_slice_versions'),
      ('warehouse', 'meta_authoritative_publication_pointers'),
      ('warehouse', 'google_ads_account_daily'),
      ('warehouse', 'google_ads_campaign_daily'),
      ('warehouse', 'google_ads_ad_group_daily'),
      ('warehouse', 'google_ads_ad_daily'),
      ('warehouse', 'google_ads_keyword_daily'),
      ('warehouse', 'google_ads_search_term_daily'),
      ('warehouse', 'google_ads_asset_group_daily'),
      ('warehouse', 'google_ads_asset_daily'),
      ('warehouse', 'google_ads_audience_daily'),
      ('warehouse', 'google_ads_geo_daily'),
      ('warehouse', 'google_ads_device_daily'),
      ('warehouse', 'google_ads_product_daily'),
      ('warehouse', 'google_ads_query_dictionary'),
      ('warehouse', 'google_ads_search_query_hot_daily'),
      ('warehouse', 'google_ads_top_query_weekly'),
      ('warehouse', 'google_ads_search_cluster_daily'),
      ('warehouse', 'shopify_orders'),
      ('warehouse', 'shopify_order_lines'),
      ('warehouse', 'shopify_order_transactions'),
      ('warehouse', 'shopify_refunds'),
      ('warehouse', 'shopify_returns'),
      ('warehouse', 'shopify_customer_events'),
      ('warehouse', 'shopify_sales_events'),
      ('serving', 'creative_share_snapshots'),
      ('serving', 'custom_report_share_snapshots'),
      ('serving', 'creative_media_cache'),
      ('serving', 'meta_creatives_snapshots'),
      ('serving', 'meta_creative_score_snapshots'),
      ('serving', 'platform_overview_daily_summary'),
      ('serving', 'platform_overview_summary_ranges'),
      ('serving', 'provider_reporting_snapshots'),
      ('serving', 'google_ads_advisor_memory'),
      ('serving', 'google_ads_advisor_snapshots'),
      ('serving', 'ai_daily_insights'),
      ('serving', 'ai_creative_decisions_cache'),
      ('serving', 'seo_ai_monthly_analyses'),
      ('serving', 'seo_results_cache'),
      ('serving', 'shopify_serving_state'),
      ('serving', 'shopify_serving_state_history'),
      ('serving', 'shopify_reconciliation_runs'),
      ('audit', 'admin_audit_logs'),
      ('audit', 'google_ads_advisor_execution_logs'),
      ('audit', 'google_ads_decision_action_outcome_logs'),
      ('audit', 'meta_authoritative_reconciliation_events'),
      ('audit', 'shopify_webhook_deliveries'),
      ('audit', 'sync_reclaim_events')
  ) AS t(family, table_name)
),
table_stats AS (
  SELECT
    tt.family,
    tt.table_name,
    COALESCE(s.n_live_tup, c.reltuples::bigint, 0) AS approx_rows,
    s.last_analyze,
    s.last_autoanalyze,
    s.last_vacuum,
    s.last_autovacuum
  FROM tracked_tables tt
  LEFT JOIN pg_class c
    ON c.relname = tt.table_name
  LEFT JOIN pg_namespace n
    ON n.oid = c.relnamespace
   AND n.nspname = 'public'
  LEFT JOIN pg_stat_user_tables s
    ON s.relid = c.oid
)
SELECT *
FROM table_stats
ORDER BY family, table_name;

WITH tracked_tables AS (
  SELECT *
  FROM (
    VALUES
      ('core', 'users'),
      ('core', 'businesses'),
      ('core', 'memberships'),
      ('core', 'sessions'),
      ('core', 'invites'),
      ('core', 'integrations'),
      ('core', 'provider_account_assignments'),
      ('core', 'provider_account_snapshots'),
      ('core', 'business_cost_models'),
      ('core', 'shopify_subscriptions'),
      ('core', 'shopify_install_contexts'),
      ('core', 'discount_codes'),
      ('core', 'discount_redemptions'),
      ('core', 'custom_reports'),
      ('control', 'provider_account_rollover_state'),
      ('control', 'provider_cooldown_state'),
      ('control', 'provider_quota_usage'),
      ('control', 'provider_sync_jobs'),
      ('control', 'meta_sync_jobs'),
      ('control', 'meta_sync_partitions'),
      ('control', 'meta_sync_runs'),
      ('control', 'meta_sync_checkpoints'),
      ('control', 'meta_sync_state'),
      ('control', 'google_ads_sync_jobs'),
      ('control', 'google_ads_sync_partitions'),
      ('control', 'google_ads_sync_runs'),
      ('control', 'google_ads_sync_checkpoints'),
      ('control', 'google_ads_sync_state'),
      ('control', 'google_ads_runner_leases'),
      ('control', 'sync_runner_leases'),
      ('control', 'sync_worker_heartbeats'),
      ('control', 'shopify_sync_state'),
      ('control', 'shopify_repair_intents'),
      ('control', 'shopify_serving_overrides'),
      ('raw', 'meta_raw_snapshots'),
      ('raw', 'google_ads_raw_snapshots'),
      ('raw', 'shopify_raw_snapshots'),
      ('warehouse', 'meta_config_snapshots'),
      ('warehouse', 'meta_account_daily'),
      ('warehouse', 'meta_campaign_daily'),
      ('warehouse', 'meta_adset_daily'),
      ('warehouse', 'meta_breakdown_daily'),
      ('warehouse', 'meta_ad_daily'),
      ('warehouse', 'meta_creative_daily'),
      ('warehouse', 'meta_authoritative_source_manifests'),
      ('warehouse', 'meta_authoritative_slice_versions'),
      ('warehouse', 'meta_authoritative_publication_pointers'),
      ('warehouse', 'google_ads_account_daily'),
      ('warehouse', 'google_ads_campaign_daily'),
      ('warehouse', 'google_ads_ad_group_daily'),
      ('warehouse', 'google_ads_ad_daily'),
      ('warehouse', 'google_ads_keyword_daily'),
      ('warehouse', 'google_ads_search_term_daily'),
      ('warehouse', 'google_ads_asset_group_daily'),
      ('warehouse', 'google_ads_asset_daily'),
      ('warehouse', 'google_ads_audience_daily'),
      ('warehouse', 'google_ads_geo_daily'),
      ('warehouse', 'google_ads_device_daily'),
      ('warehouse', 'google_ads_product_daily'),
      ('warehouse', 'google_ads_query_dictionary'),
      ('warehouse', 'google_ads_search_query_hot_daily'),
      ('warehouse', 'google_ads_top_query_weekly'),
      ('warehouse', 'google_ads_search_cluster_daily'),
      ('warehouse', 'shopify_orders'),
      ('warehouse', 'shopify_order_lines'),
      ('warehouse', 'shopify_order_transactions'),
      ('warehouse', 'shopify_refunds'),
      ('warehouse', 'shopify_returns'),
      ('warehouse', 'shopify_customer_events'),
      ('warehouse', 'shopify_sales_events'),
      ('serving', 'creative_share_snapshots'),
      ('serving', 'custom_report_share_snapshots'),
      ('serving', 'creative_media_cache'),
      ('serving', 'meta_creatives_snapshots'),
      ('serving', 'meta_creative_score_snapshots'),
      ('serving', 'platform_overview_daily_summary'),
      ('serving', 'platform_overview_summary_ranges'),
      ('serving', 'provider_reporting_snapshots'),
      ('serving', 'google_ads_advisor_memory'),
      ('serving', 'google_ads_advisor_snapshots'),
      ('serving', 'ai_daily_insights'),
      ('serving', 'ai_creative_decisions_cache'),
      ('serving', 'seo_ai_monthly_analyses'),
      ('serving', 'seo_results_cache'),
      ('serving', 'shopify_serving_state'),
      ('serving', 'shopify_serving_state_history'),
      ('serving', 'shopify_reconciliation_runs'),
      ('audit', 'admin_audit_logs'),
      ('audit', 'google_ads_advisor_execution_logs'),
      ('audit', 'google_ads_decision_action_outcome_logs'),
      ('audit', 'meta_authoritative_reconciliation_events'),
      ('audit', 'shopify_webhook_deliveries'),
      ('audit', 'sync_reclaim_events')
  ) AS t(family, table_name)
)
SELECT
  family,
  COUNT(*) AS table_count
FROM tracked_tables
GROUP BY family
ORDER BY family;

-- -----------------------------------------------------------------------------
-- 2) Duplicate natural-key checks
-- -----------------------------------------------------------------------------
WITH duplicate_checks AS (
  SELECT 'integrations' AS table_name, business_id || '|' || provider AS natural_key, COUNT(*) AS row_count
  FROM integrations
  GROUP BY 1, 2
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT 'provider_account_assignments', business_id || '|' || provider, COUNT(*)
  FROM provider_account_assignments
  GROUP BY 1, 2
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT 'provider_account_snapshots', business_id || '|' || provider, COUNT(*)
  FROM provider_account_snapshots
  GROUP BY 1, 2
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT 'meta_account_daily', business_id || '|' || provider_account_id || '|' || date::text, COUNT(*)
  FROM meta_account_daily
  GROUP BY 1, 2
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT 'meta_campaign_daily', business_id || '|' || provider_account_id || '|' || date::text || '|' || campaign_id, COUNT(*)
  FROM meta_campaign_daily
  GROUP BY 1, 2
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT 'meta_adset_daily', business_id || '|' || provider_account_id || '|' || date::text || '|' || adset_id, COUNT(*)
  FROM meta_adset_daily
  GROUP BY 1, 2
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT 'meta_breakdown_daily', business_id || '|' || provider_account_id || '|' || date::text || '|' || breakdown_type || '|' || breakdown_key, COUNT(*)
  FROM meta_breakdown_daily
  GROUP BY 1, 2
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT 'meta_ad_daily', business_id || '|' || provider_account_id || '|' || date::text || '|' || ad_id, COUNT(*)
  FROM meta_ad_daily
  GROUP BY 1, 2
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT 'meta_creative_daily', business_id || '|' || provider_account_id || '|' || date::text || '|' || creative_id, COUNT(*)
  FROM meta_creative_daily
  GROUP BY 1, 2
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT 'google_ads_account_daily', business_id || '|' || provider_account_id || '|' || date::text || '|' || entity_key, COUNT(*)
  FROM google_ads_account_daily
  GROUP BY 1, 2
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT 'google_ads_campaign_daily', business_id || '|' || provider_account_id || '|' || date::text || '|' || entity_key, COUNT(*)
  FROM google_ads_campaign_daily
  GROUP BY 1, 2
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT 'google_ads_search_term_daily', business_id || '|' || provider_account_id || '|' || date::text || '|' || entity_key, COUNT(*)
  FROM google_ads_search_term_daily
  GROUP BY 1, 2
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT 'shopify_orders', business_id || '|' || provider_account_id || '|' || shop_id || '|' || order_id, COUNT(*)
  FROM shopify_orders
  GROUP BY 1, 2
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT 'shopify_refunds', business_id || '|' || provider_account_id || '|' || shop_id || '|' || refund_id, COUNT(*)
  FROM shopify_refunds
  GROUP BY 1, 2
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT 'shopify_returns', business_id || '|' || provider_account_id || '|' || shop_id || '|' || return_id, COUNT(*)
  FROM shopify_returns
  GROUP BY 1, 2
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT 'platform_overview_daily_summary', business_id || '|' || provider || '|' || provider_account_id || '|' || date::text, COUNT(*)
  FROM platform_overview_daily_summary
  GROUP BY 1, 2
  HAVING COUNT(*) > 1

  UNION ALL

  SELECT 'platform_overview_summary_ranges', business_id || '|' || provider || '|' || provider_account_ids_hash || '|' || start_date::text || '|' || end_date::text, COUNT(*)
  FROM platform_overview_summary_ranges
  GROUP BY 1, 2
  HAVING COUNT(*) > 1
)
SELECT *
FROM duplicate_checks
ORDER BY table_name, row_count DESC, natural_key;

-- -----------------------------------------------------------------------------
-- 3) Null-anomaly checks on core / hot warehouse tables
-- -----------------------------------------------------------------------------
WITH null_anomalies AS (
  SELECT 'integrations' AS table_name, COUNT(*) AS null_rows
  FROM integrations
  WHERE business_id IS NULL OR provider IS NULL

  UNION ALL

  SELECT 'provider_account_assignments', COUNT(*)
  FROM provider_account_assignments
  WHERE business_id IS NULL OR provider IS NULL

  UNION ALL

  SELECT 'meta_account_daily', COUNT(*)
  FROM meta_account_daily
  WHERE business_id IS NULL OR provider_account_id IS NULL OR date IS NULL

  UNION ALL

  SELECT 'meta_campaign_daily', COUNT(*)
  FROM meta_campaign_daily
  WHERE business_id IS NULL OR provider_account_id IS NULL OR date IS NULL OR campaign_id IS NULL

  UNION ALL

  SELECT 'google_ads_account_daily', COUNT(*)
  FROM google_ads_account_daily
  WHERE business_id IS NULL OR provider_account_id IS NULL OR date IS NULL OR entity_key IS NULL

  UNION ALL

  SELECT 'google_ads_campaign_daily', COUNT(*)
  FROM google_ads_campaign_daily
  WHERE business_id IS NULL OR provider_account_id IS NULL OR date IS NULL OR entity_key IS NULL

  UNION ALL

  SELECT 'shopify_orders', COUNT(*)
  FROM shopify_orders
  WHERE business_id IS NULL OR provider_account_id IS NULL OR shop_id IS NULL OR order_id IS NULL OR order_created_at IS NULL

  UNION ALL

  SELECT 'shopify_refunds', COUNT(*)
  FROM shopify_refunds
  WHERE business_id IS NULL OR provider_account_id IS NULL OR shop_id IS NULL OR refund_id IS NULL OR refunded_at IS NULL

  UNION ALL

  SELECT 'shopify_returns', COUNT(*)
  FROM shopify_returns
  WHERE business_id IS NULL OR provider_account_id IS NULL OR shop_id IS NULL OR return_id IS NULL OR created_at_provider IS NULL

  UNION ALL

  SELECT 'platform_overview_daily_summary', COUNT(*)
  FROM platform_overview_daily_summary
  WHERE business_id IS NULL OR provider IS NULL OR provider_account_id IS NULL OR date IS NULL
)
SELECT *
FROM null_anomalies
ORDER BY table_name;

-- -----------------------------------------------------------------------------
-- 4) Date-coverage gap checks (last 30 full days)
-- -----------------------------------------------------------------------------
WITH window_days AS (
  SELECT generate_series(current_date - interval '30 day', current_date - interval '1 day', interval '1 day')::date AS day
),
meta_accounts AS (
  SELECT DISTINCT business_id, provider_account_id
  FROM meta_account_daily
  WHERE date >= current_date - interval '30 day'
),
google_accounts AS (
  SELECT DISTINCT business_id, provider_account_id
  FROM google_ads_account_daily
  WHERE date >= current_date - interval '30 day'
),
shopify_accounts AS (
  SELECT DISTINCT business_id, provider_account_id
  FROM shopify_orders
  WHERE COALESCE(order_created_date_local, order_created_at::date) >= current_date - interval '30 day'
),
meta_gaps AS (
  SELECT 'meta_account_daily' AS table_name, a.business_id, a.provider_account_id, d.day
  FROM meta_accounts a
  CROSS JOIN window_days d
  LEFT JOIN meta_account_daily m
    ON m.business_id = a.business_id
   AND m.provider_account_id = a.provider_account_id
   AND m.date = d.day
  WHERE m.id IS NULL
),
google_gaps AS (
  SELECT 'google_ads_account_daily' AS table_name, a.business_id, a.provider_account_id, d.day
  FROM google_accounts a
  CROSS JOIN window_days d
  LEFT JOIN google_ads_account_daily g
    ON g.business_id = a.business_id
   AND g.provider_account_id = a.provider_account_id
   AND g.date = d.day
  WHERE g.id IS NULL
),
shopify_gaps AS (
  SELECT 'shopify_orders' AS table_name, a.business_id, a.provider_account_id, d.day
  FROM shopify_accounts a
  CROSS JOIN window_days d
  LEFT JOIN shopify_orders o
    ON o.business_id = a.business_id
   AND o.provider_account_id = a.provider_account_id
   AND COALESCE(o.order_created_date_local, o.order_created_at::date) = d.day
  WHERE o.id IS NULL
)
SELECT *
FROM (
  SELECT * FROM meta_gaps
  UNION ALL
  SELECT * FROM google_gaps
  UNION ALL
  SELECT * FROM shopify_gaps
) gaps
ORDER BY table_name, business_id, provider_account_id, day;

-- -----------------------------------------------------------------------------
-- 5) Projection vs warehouse parity checks (last 30 full days)
-- -----------------------------------------------------------------------------
WITH projection AS (
  SELECT
    business_id,
    provider,
    date::date AS day,
    ROUND(SUM(spend)::numeric, 4) AS spend,
    ROUND(SUM(revenue)::numeric, 4) AS revenue,
    ROUND(SUM(purchases)::numeric, 4) AS purchases
  FROM platform_overview_daily_summary
  WHERE date >= current_date - interval '30 day'
    AND date < current_date
  GROUP BY 1, 2, 3
),
warehouse_meta AS (
  SELECT
    business_id,
    'meta'::text AS provider,
    date::date AS day,
    ROUND(SUM(spend)::numeric, 4) AS spend,
    ROUND(SUM(revenue)::numeric, 4) AS revenue,
    ROUND(SUM(conversions)::numeric, 4) AS purchases
  FROM meta_account_daily
  WHERE date >= current_date - interval '30 day'
    AND date < current_date
    AND truth_state = 'finalized'
  GROUP BY 1, 2, 3
),
warehouse_google AS (
  SELECT
    business_id,
    'google'::text AS provider,
    date::date AS day,
    ROUND(SUM(spend)::numeric, 4) AS spend,
    ROUND(SUM(revenue)::numeric, 4) AS revenue,
    ROUND(SUM(conversions)::numeric, 4) AS purchases
  FROM google_ads_account_daily
  WHERE date >= current_date - interval '30 day'
    AND date < current_date
  GROUP BY 1, 2, 3
),
warehouse_union AS (
  SELECT * FROM warehouse_meta
  UNION ALL
  SELECT * FROM warehouse_google
)
SELECT
  COALESCE(p.business_id, w.business_id) AS business_id,
  COALESCE(p.provider, w.provider) AS provider,
  COALESCE(p.day, w.day) AS day,
  p.spend AS projection_spend,
  w.spend AS warehouse_spend,
  ROUND(COALESCE(p.spend, 0) - COALESCE(w.spend, 0), 4) AS spend_delta,
  p.revenue AS projection_revenue,
  w.revenue AS warehouse_revenue,
  ROUND(COALESCE(p.revenue, 0) - COALESCE(w.revenue, 0), 4) AS revenue_delta,
  p.purchases AS projection_purchases,
  w.purchases AS warehouse_purchases,
  ROUND(COALESCE(p.purchases, 0) - COALESCE(w.purchases, 0), 4) AS purchase_delta
FROM projection p
FULL OUTER JOIN warehouse_union w
  ON w.business_id = p.business_id
 AND w.provider = p.provider
 AND w.day = p.day
WHERE
  ABS(COALESCE(p.spend, 0) - COALESCE(w.spend, 0)) > 0.01
  OR ABS(COALESCE(p.revenue, 0) - COALESCE(w.revenue, 0)) > 0.01
  OR ABS(COALESCE(p.purchases, 0) - COALESCE(w.purchases, 0)) > 0.01
ORDER BY business_id, provider, day;

-- -----------------------------------------------------------------------------
-- 6) Provider sanity aggregates for the last 14 full days
-- -----------------------------------------------------------------------------
WITH meta_agg AS (
  SELECT
    business_id,
    provider_account_id,
    MIN(date) AS min_day,
    MAX(date) AS max_day,
    COUNT(*) AS row_count,
    ROUND(SUM(spend)::numeric, 4) AS spend,
    ROUND(SUM(revenue)::numeric, 4) AS revenue,
    ROUND(SUM(conversions)::numeric, 4) AS purchases
  FROM meta_account_daily
  WHERE date >= current_date - interval '14 day'
    AND date < current_date
  GROUP BY 1, 2
),
google_agg AS (
  SELECT
    business_id,
    provider_account_id,
    MIN(date) AS min_day,
    MAX(date) AS max_day,
    COUNT(*) AS row_count,
    ROUND(SUM(spend)::numeric, 4) AS spend,
    ROUND(SUM(revenue)::numeric, 4) AS revenue,
    ROUND(SUM(conversions)::numeric, 4) AS purchases
  FROM google_ads_account_daily
  WHERE date >= current_date - interval '14 day'
    AND date < current_date
  GROUP BY 1, 2
),
shopify_agg AS (
  SELECT
    business_id,
    provider_account_id,
    MIN(COALESCE(order_created_date_local, order_created_at::date)) AS min_day,
    MAX(COALESCE(order_created_date_local, order_created_at::date)) AS max_day,
    COUNT(*) AS order_rows,
    ROUND(SUM(total_price)::numeric, 4) AS gross_revenue
  FROM shopify_orders
  WHERE COALESCE(order_created_date_local, order_created_at::date) >= current_date - interval '14 day'
    AND COALESCE(order_created_date_local, order_created_at::date) < current_date
  GROUP BY 1, 2
),
shopify_refund_agg AS (
  SELECT
    business_id,
    provider_account_id,
    ROUND(SUM(refunded_sales + refunded_shipping + refunded_taxes)::numeric, 4) AS refunded_revenue,
    COUNT(*) AS refund_rows
  FROM shopify_refunds
  WHERE COALESCE(refunded_date_local, refunded_at::date) >= current_date - interval '14 day'
    AND COALESCE(refunded_date_local, refunded_at::date) < current_date
  GROUP BY 1, 2
)
SELECT
  'meta' AS provider,
  business_id,
  provider_account_id,
  min_day,
  max_day,
  row_count,
  spend,
  revenue,
  purchases
FROM meta_agg

UNION ALL

SELECT
  'google' AS provider,
  business_id,
  provider_account_id,
  min_day,
  max_day,
  row_count,
  spend,
  revenue,
  purchases
FROM google_agg

UNION ALL

SELECT
  'shopify' AS provider,
  o.business_id,
  o.provider_account_id,
  o.min_day,
  o.max_day,
  o.order_rows AS row_count,
  NULL::numeric AS spend,
  ROUND(o.gross_revenue - COALESCE(r.refunded_revenue, 0), 4) AS revenue,
  o.order_rows::numeric AS purchases
FROM shopify_agg o
LEFT JOIN shopify_refund_agg r
  ON r.business_id = o.business_id
 AND r.provider_account_id = o.provider_account_id
ORDER BY provider, business_id, provider_account_id;
