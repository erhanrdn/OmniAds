import { getDb } from "@/lib/db";
import { logStartupError, logStartupEvent } from "@/lib/startup-diagnostics";

let migrationsPromise: Promise<void> | null = null;
let migrationsCompleted = false;
let loggedMigrationSkip = false;

const DEFAULT_MIGRATION_TIMEOUT_MS = 60_000;

function runtimeMigrationsEnabled() {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.ENABLE_RUNTIME_MIGRATIONS === "1";
}

function getMigrationTimeoutMs() {
  const raw = process.env.MIGRATION_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_MIGRATION_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MIGRATION_TIMEOUT_MS;
}

function withMigrationTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Database migrations timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
      promise.finally(() => clearTimeout(timer)).catch(() => clearTimeout(timer));
    }),
  ]);
}

function buildGoogleAdsWarehouseTableQuery(tableName: string) {
  return `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      business_id       TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      date              DATE NOT NULL,
      account_timezone  TEXT NOT NULL DEFAULT 'UTC',
      account_currency  TEXT NOT NULL DEFAULT 'USD',
      entity_key        TEXT NOT NULL,
      entity_label      TEXT,
      campaign_id       TEXT,
      campaign_name     TEXT,
      ad_group_id       TEXT,
      ad_group_name     TEXT,
      status            TEXT,
      channel           TEXT,
      classification    TEXT,
      payload_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
      spend             NUMERIC(18, 4) NOT NULL DEFAULT 0,
      revenue           NUMERIC(18, 4) NOT NULL DEFAULT 0,
      conversions       NUMERIC(18, 4) NOT NULL DEFAULT 0,
      impressions       BIGINT NOT NULL DEFAULT 0,
      clicks            BIGINT NOT NULL DEFAULT 0,
      ctr               NUMERIC(18, 4),
      cpc               NUMERIC(18, 4),
      cpa               NUMERIC(18, 4),
      roas              NUMERIC(18, 4) NOT NULL DEFAULT 0,
      conversion_rate   NUMERIC(18, 4),
      interaction_rate  NUMERIC(18, 4),
      source_snapshot_id UUID REFERENCES google_ads_raw_snapshots(id) ON DELETE SET NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (business_id, provider_account_id, date, entity_key)
    )
  `;
}

function buildGoogleAdsWarehouseIndexQueries(tableName: string) {
  return [
    `CREATE INDEX IF NOT EXISTS idx_${tableName}_business_date ON ${tableName} (business_id, date DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_${tableName}_account_date ON ${tableName} (provider_account_id, date DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_${tableName}_campaign_date ON ${tableName} (campaign_id, date DESC)`,
  ];
}

export async function runMigrations(options?: { force?: boolean; reason?: string }) {
  const force = options?.force ?? false;
  const reason = options?.reason ?? "unspecified";

  if (!force && !runtimeMigrationsEnabled()) {
    if (!loggedMigrationSkip) {
      loggedMigrationSkip = true;
      logStartupEvent("migrations_skipped_runtime_disabled", { reason, nodeEnv: process.env.NODE_ENV });
    }
    return;
  }

  if (migrationsCompleted) return;
  if (migrationsPromise) {
    await migrationsPromise;
    return;
  }

  const timeoutMs = getMigrationTimeoutMs();
  logStartupEvent("migrations_started", { reason, force, timeoutMs });

  migrationsPromise = withMigrationTimeout(
    (async () => {
      const sql = getDb();

      // ── PHASE 1: Tables with no FK dependencies (run in parallel) ──────────
      await Promise.all([
        sql`CREATE TABLE IF NOT EXISTS users (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name          TEXT NOT NULL,
          email         TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          avatar        TEXT,
          language      TEXT NOT NULL DEFAULT 'en',
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS integrations (
          id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id           TEXT NOT NULL,
          provider              TEXT NOT NULL,
          status                TEXT NOT NULL DEFAULT 'disconnected',
          provider_account_id   TEXT,
          provider_account_name TEXT,
          access_token          TEXT,
          refresh_token         TEXT,
          token_expires_at      TIMESTAMPTZ,
          scopes                TEXT,
          error_message         TEXT,
          connected_at          TIMESTAMPTZ,
          disconnected_at       TIMESTAMPTZ,
          created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS provider_account_assignments (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id TEXT NOT NULL,
          provider    TEXT NOT NULL,
          account_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS provider_account_snapshots (
          id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id      TEXT NOT NULL,
          provider         TEXT NOT NULL,
          accounts_payload JSONB NOT NULL DEFAULT '[]'::jsonb,
          fetched_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          refresh_failed   BOOLEAN NOT NULL DEFAULT FALSE,
          last_error       TEXT,
          refresh_requested_at TIMESTAMPTZ,
          last_refresh_attempt_at TIMESTAMPTZ,
          next_refresh_after TIMESTAMPTZ,
          refresh_in_progress BOOLEAN NOT NULL DEFAULT FALSE,
          accounts_hash     TEXT,
          source_reason     TEXT,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS provider_reporting_snapshots (
          id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id    TEXT NOT NULL,
          provider       TEXT NOT NULL,
          report_type    TEXT NOT NULL,
          date_range_key TEXT NOT NULL,
          payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS meta_config_snapshots (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id   TEXT NOT NULL,
          account_id    TEXT NOT NULL,
          entity_level  TEXT NOT NULL CHECK (entity_level IN ('campaign', 'adset')),
          entity_id     TEXT NOT NULL,
          payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
          snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
          captured_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS creative_share_snapshots (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          token      TEXT NOT NULL UNIQUE,
          payload    JSONB NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS custom_reports (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id TEXT NOT NULL,
          name        TEXT NOT NULL,
          description TEXT,
          template_id TEXT,
          definition  JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS custom_report_share_snapshots (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          token      TEXT NOT NULL UNIQUE,
          report_id  TEXT,
          payload    JSONB NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS creative_media_cache (
          id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          creative_id     TEXT NOT NULL,
          business_id     TEXT NOT NULL,
          provider        TEXT NOT NULL DEFAULT 'meta',
          source_url      TEXT NOT NULL,
          storage_key     TEXT UNIQUE,
          content_type    TEXT,
          file_size_bytes INTEGER,
          status          TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'downloading', 'cached', 'failed')),
          error_message   TEXT,
          retry_count     INTEGER NOT NULL DEFAULT 0,
          cached_at       TIMESTAMPTZ,
          expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
          created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS meta_creatives_snapshots (
          id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          snapshot_key           TEXT NOT NULL UNIQUE,
          business_id            TEXT NOT NULL,
          assigned_accounts_hash TEXT NOT NULL,
          start_date             DATE NOT NULL,
          end_date               DATE NOT NULL,
          group_by               TEXT NOT NULL,
          format                 TEXT NOT NULL,
          sort                   TEXT NOT NULL,
          payload                JSONB NOT NULL,
          snapshot_level         TEXT NOT NULL CHECK (snapshot_level IN ('metadata', 'full')),
          row_count              INTEGER NOT NULL DEFAULT 0,
          preview_ready_count    INTEGER NOT NULL DEFAULT 0,
          last_synced_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          refresh_started_at     TIMESTAMPTZ,
          created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS shopify_subscriptions (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          shop_id       TEXT NOT NULL UNIQUE,
          plan_id       TEXT NOT NULL,
          status        TEXT NOT NULL,
          billing_cycle TEXT NOT NULL,
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS ai_daily_insights (
          id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id     TEXT NOT NULL,
          insight_date    DATE NOT NULL,
          locale          TEXT NOT NULL DEFAULT 'en',
          summary         TEXT NOT NULL DEFAULT '',
          risks           JSONB NOT NULL DEFAULT '[]'::jsonb,
          opportunities   JSONB NOT NULL DEFAULT '[]'::jsonb,
          recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
          raw_response    JSONB,
          status          TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
          error_message   TEXT,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS ai_creative_decisions_cache (
          id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id    TEXT NOT NULL,
          analysis_key   TEXT NOT NULL,
          locale         TEXT NOT NULL DEFAULT 'en',
          currency       TEXT NOT NULL DEFAULT 'USD',
          creative_count INTEGER NOT NULL DEFAULT 0,
          decisions      JSONB NOT NULL DEFAULT '[]'::jsonb,
          source         TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'fallback')),
          warning        TEXT,
          created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS seo_ai_monthly_analyses (
          id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id    TEXT NOT NULL,
          analysis_month DATE NOT NULL,
          period_start   DATE NOT NULL,
          period_end     DATE NOT NULL,
          analysis       JSONB,
          raw_response   JSONB,
          status         TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
          error_message  TEXT,
          created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS google_ads_advisor_memory (
          id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id                TEXT NOT NULL,
          account_id                 TEXT NOT NULL,
          recommendation_fingerprint TEXT NOT NULL,
          recommendation_type        TEXT NOT NULL,
          entity_id                  TEXT,
          first_seen_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_seen_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
          prior_status               TEXT,
          current_status             TEXT NOT NULL DEFAULT 'new',
          seen_count                 INTEGER NOT NULL DEFAULT 1,
          last_do_bucket             TEXT NOT NULL DEFAULT 'do_later',
          user_action                TEXT,
          dismiss_reason             TEXT,
          suppress_until             TIMESTAMPTZ,
          applied_at                 TIMESTAMPTZ,
          outcome_check_at           TIMESTAMPTZ,
          outcome_check_window_days  INTEGER,
          outcome_verdict            TEXT,
          outcome_metric             TEXT,
          outcome_delta              NUMERIC(18, 4),
          outcome_verdict_fail_reason TEXT,
          outcome_confidence         TEXT,
          execution_status           TEXT,
          executed_at                TIMESTAMPTZ,
          execution_error            TEXT,
          rollback_available         BOOLEAN,
          rollback_executed_at       TIMESTAMPTZ,
          completion_mode            TEXT,
          completed_step_count       INTEGER,
          total_step_count           INTEGER,
          completed_step_ids         JSONB,
          skipped_step_ids           JSONB,
          core_step_ids              JSONB,
          execution_metadata         JSONB,
          applied_snapshot           JSONB,
          recommendation_snapshot    JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, account_id, recommendation_fingerprint)
        )`,
        sql`CREATE TABLE IF NOT EXISTS google_ads_advisor_execution_logs (
          id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id                TEXT NOT NULL,
          account_id                 TEXT NOT NULL,
          recommendation_fingerprint TEXT NOT NULL,
          mutate_action_type         TEXT NOT NULL,
          operation                  TEXT NOT NULL,
          status                     TEXT NOT NULL,
          payload_json               JSONB,
          response_json              JSONB,
          error_message              TEXT,
          created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS google_ads_advisor_snapshots (
          id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id           TEXT NOT NULL,
          account_id            TEXT,
          analysis_version      TEXT NOT NULL DEFAULT 'v1',
          analysis_mode         TEXT NOT NULL DEFAULT 'snapshot',
          as_of_date            DATE NOT NULL,
          selected_window_key   TEXT NOT NULL DEFAULT 'last90',
          advisor_payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
          historical_support_json JSONB,
          source_max_updated_at TIMESTAMPTZ,
          status                TEXT NOT NULL DEFAULT 'success',
          error_message         TEXT,
          generated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, account_id, as_of_date, analysis_version)
        )`,
      ]);

      // ── PHASE 2: businesses (deps: users) + alter phase-1 tables ──────────
      await Promise.all([
        sql`CREATE TABLE IF NOT EXISTS businesses (
          id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name             TEXT NOT NULL,
          owner_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          timezone         TEXT NOT NULL DEFAULT 'UTC',
          currency         TEXT NOT NULL DEFAULT 'USD',
          is_demo_business BOOLEAN NOT NULL DEFAULT FALSE,
          industry         TEXT,
          platform         TEXT,
          metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT`,
        sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_id TEXT`,
        sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'password'`,
        sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en'`,
        sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT false`,
        sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ`,
        sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`,
        sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_override TEXT`,
        sql`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb`,
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_biz_provider ON integrations (business_id, provider)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_integrations_business_id ON integrations (business_id)`.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_account_assignments_biz_provider ON provider_account_assignments (business_id, provider)`.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_account_snapshots_biz_provider ON provider_account_snapshots (business_id, provider)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_provider_account_snapshots_business ON provider_account_snapshots (business_id)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_provider_account_snapshots_next_refresh ON provider_account_snapshots (next_refresh_after)`.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_reporting_snapshots_lookup ON provider_reporting_snapshots (business_id, provider, report_type, date_range_key)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_provider_reporting_snapshots_business ON provider_reporting_snapshots (business_id, updated_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_config_snapshots_lookup ON meta_config_snapshots (business_id, entity_level, entity_id, captured_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_creative_share_snapshots_token ON creative_share_snapshots (token)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_custom_reports_business ON custom_reports (business_id, updated_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_custom_report_share_snapshots_token ON custom_report_share_snapshots (token)`.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_creative_media_cache_creative_biz ON creative_media_cache (creative_id, business_id, provider)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_creative_media_cache_status ON creative_media_cache (status)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_creative_media_cache_storage_key ON creative_media_cache (storage_key)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_creative_media_cache_expires ON creative_media_cache (expires_at)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_creatives_snapshots_business ON meta_creatives_snapshots (business_id, last_synced_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_creatives_snapshots_refresh ON meta_creatives_snapshots (refresh_started_at)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_subscriptions_shop_id ON shopify_subscriptions (shop_id)`.catch(() => {}),
        sql`ALTER TABLE ai_daily_insights ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en'`.catch(() => {}),
        sql`ALTER TABLE ai_creative_decisions_cache ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'en'`.catch(() => {}),
        sql`DROP INDEX IF EXISTS idx_ai_daily_insights_biz_date`.catch(() => {}),
        sql`DROP INDEX IF EXISTS idx_ai_creative_decisions_cache_business_analysis`.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_daily_insights_biz_date_locale ON ai_daily_insights (business_id, insight_date, locale)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_ai_daily_insights_business ON ai_daily_insights (business_id, insight_date DESC)`.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_creative_decisions_cache_business_analysis_locale ON ai_creative_decisions_cache (business_id, analysis_key, locale)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_ai_creative_decisions_cache_business_updated ON ai_creative_decisions_cache (business_id, updated_at DESC)`.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_ai_monthly_analyses_business_month ON seo_ai_monthly_analyses (business_id, analysis_month)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_seo_ai_monthly_analyses_business_updated ON seo_ai_monthly_analyses (business_id, updated_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_advisor_memory_scope ON google_ads_advisor_memory (business_id, account_id, last_seen_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_advisor_memory_suppress_until ON google_ads_advisor_memory (suppress_until)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_advisor_memory_status ON google_ads_advisor_memory (current_status, updated_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_advisor_memory_outcome_check ON google_ads_advisor_memory (outcome_check_at)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_advisor_execution_logs_scope ON google_ads_advisor_execution_logs (business_id, account_id, created_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_advisor_snapshots_scope ON google_ads_advisor_snapshots (business_id, account_id, generated_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_advisor_snapshots_status ON google_ads_advisor_snapshots (status, updated_at DESC)`.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id) WHERE google_id IS NOT NULL`.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_facebook_id ON users (facebook_id) WHERE facebook_id IS NOT NULL`.catch(() => {}),
      ]);

      // ── PHASE 3: Tables that depend on users+businesses ───────────────────
      await Promise.all([
        sql`CREATE TABLE IF NOT EXISTS memberships (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          role        TEXT NOT NULL CHECK (role IN ('admin', 'collaborator', 'guest')),
          status      TEXT NOT NULL CHECK (status IN ('active', 'invited', 'pending')),
          joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (user_id, business_id)
        )`,
        sql`CREATE TABLE IF NOT EXISTS invites (
          id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email              TEXT NOT NULL,
          business_id        UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          role               TEXT NOT NULL CHECK (role IN ('admin', 'collaborator', 'guest')),
          token              TEXT NOT NULL UNIQUE,
          status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
          invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          expires_at         TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
          accepted_at        TIMESTAMPTZ,
          created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS sessions (
          id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash         TEXT NOT NULL UNIQUE,
          active_business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
          expires_at         TIMESTAMPTZ NOT NULL,
          created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS business_cost_models (
          id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id        UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          cogs_percent       DOUBLE PRECISION NOT NULL DEFAULT 0,
          shipping_percent   DOUBLE PRECISION NOT NULL DEFAULT 0,
          fee_percent        DOUBLE PRECISION NOT NULL DEFAULT 0,
          fixed_monthly_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
          fixed_cost         DOUBLE PRECISION NOT NULL DEFAULT 0,
          created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id)
        )`,
        sql`CREATE TABLE IF NOT EXISTS admin_audit_logs (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          admin_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          action      TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id   TEXT,
          meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS discount_codes (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          code        TEXT NOT NULL UNIQUE,
          description TEXT,
          type        TEXT NOT NULL CHECK (type IN ('percent', 'fixed')),
          value       NUMERIC(10,2) NOT NULL,
          max_uses    INTEGER,
          uses        INTEGER NOT NULL DEFAULT 0,
          applies_to  TEXT[] NOT NULL DEFAULT '{}',
          valid_from  TIMESTAMPTZ,
          valid_until TIMESTAMPTZ,
          is_active   BOOLEAN NOT NULL DEFAULT true,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_by  UUID REFERENCES users(id) ON DELETE SET NULL
        )`,
        sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS is_demo_business BOOLEAN NOT NULL DEFAULT FALSE`,
        sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS industry TEXT`,
        sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS platform TEXT`,
        sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb`,
        sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS plan_override TEXT`,
        sql`ALTER TABLE provider_account_snapshots ADD COLUMN IF NOT EXISTS refresh_requested_at TIMESTAMPTZ`,
        sql`ALTER TABLE provider_account_snapshots ADD COLUMN IF NOT EXISTS last_refresh_attempt_at TIMESTAMPTZ`,
        sql`ALTER TABLE provider_account_snapshots ADD COLUMN IF NOT EXISTS next_refresh_after TIMESTAMPTZ`,
        sql`ALTER TABLE provider_account_snapshots ADD COLUMN IF NOT EXISTS refresh_in_progress BOOLEAN NOT NULL DEFAULT FALSE`,
        sql`ALTER TABLE provider_account_snapshots ADD COLUMN IF NOT EXISTS accounts_hash TEXT`,
        sql`ALTER TABLE provider_account_snapshots ADD COLUMN IF NOT EXISTS source_reason TEXT`,
        sql`ALTER TABLE provider_account_snapshots ADD COLUMN IF NOT EXISTS last_successful_refresh_at TIMESTAMPTZ`,
        sql`ALTER TABLE provider_account_snapshots ADD COLUMN IF NOT EXISTS refresh_failure_streak INTEGER NOT NULL DEFAULT 0`,
        sql`ALTER TABLE shopify_subscriptions ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE SET NULL`,
        sql`ALTER TABLE shopify_subscriptions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL`,
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS outcome_check_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS outcome_check_window_days INTEGER`.catch(() => {}),
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS outcome_verdict TEXT`.catch(() => {}),
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS outcome_metric TEXT`.catch(() => {}),
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS outcome_delta NUMERIC(18, 4)`.catch(() => {}),
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS outcome_verdict_fail_reason TEXT`.catch(() => {}),
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS outcome_confidence TEXT`.catch(() => {}),
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS execution_status TEXT`.catch(() => {}),
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS execution_error TEXT`.catch(() => {}),
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS rollback_available BOOLEAN`.catch(() => {}),
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS rollback_executed_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS completion_mode TEXT`.catch(() => {}),
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS completed_step_count INTEGER`.catch(() => {}),
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS total_step_count INTEGER`.catch(() => {}),
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS completed_step_ids JSONB`.catch(() => {}),
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS skipped_step_ids JSONB`.catch(() => {}),
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS core_step_ids JSONB`.catch(() => {}),
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS execution_metadata JSONB`.catch(() => {}),
        sql`ALTER TABLE google_ads_advisor_memory ADD COLUMN IF NOT EXISTS applied_snapshot JSONB`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS google_ads_advisor_execution_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id TEXT NOT NULL,
          account_id TEXT NOT NULL,
          recommendation_fingerprint TEXT NOT NULL,
          mutate_action_type TEXT NOT NULL,
          operation TEXT NOT NULL,
          status TEXT NOT NULL,
          payload_json JSONB,
          response_json JSONB,
          error_message TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`.catch(() => {}),
      ]);

      // ── PHASE 4: Tables with deeper deps + all remaining indexes ──────────
      await Promise.all([
        sql`CREATE TABLE IF NOT EXISTS discount_redemptions (
          id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          code_id     UUID NOT NULL REFERENCES discount_codes(id) ON DELETE CASCADE,
          user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
          plan_id     TEXT NOT NULL,
          amount_off  NUMERIC(10,2) NOT NULL,
          redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        sql`CREATE TABLE IF NOT EXISTS shopify_install_contexts (
          id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          token                 TEXT NOT NULL UNIQUE,
          shop_domain           TEXT NOT NULL,
          shop_name             TEXT,
          access_token          TEXT NOT NULL,
          scopes                TEXT,
          metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
          return_to             TEXT,
          session_id            UUID REFERENCES sessions(id) ON DELETE SET NULL,
          user_id               UUID REFERENCES users(id) ON DELETE SET NULL,
          preferred_business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
          created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
          expires_at            TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes')
        )`,
        sql`ALTER TABLE invites ADD COLUMN IF NOT EXISTS invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL`,
        sql`ALTER TABLE invites ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')`,
        sql`ALTER TABLE invites ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ`,
        sql`ALTER TABLE invites ADD COLUMN IF NOT EXISTS workspace_ids UUID[]`,
        sql`ALTER TABLE business_cost_models ADD COLUMN IF NOT EXISTS fixed_monthly_cost DOUBLE PRECISION NOT NULL DEFAULT 0`,
        sql`ALTER TABLE business_cost_models ADD COLUMN IF NOT EXISTS fixed_cost DOUBLE PRECISION NOT NULL DEFAULT 0`,
        sql`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_invites_business_id ON invites (business_id)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_invites_email ON invites (email)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_business_cost_models_business_id ON business_cost_models (business_id)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin ON admin_audit_logs (admin_id, created_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON admin_audit_logs (created_at DESC)`.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes (lower(code))`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_subscriptions_business_id ON shopify_subscriptions (business_id)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_subscriptions_user_id ON shopify_subscriptions (user_id)`.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_shopify_install_contexts_token ON shopify_install_contexts (token)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_install_contexts_expires_at ON shopify_install_contexts (expires_at)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_install_contexts_user_id ON shopify_install_contexts (user_id)`.catch(() => {}),
      ]);

      // Phase 4b: discount_redemptions indexes (after table created above)
      await Promise.all([
        sql`CREATE INDEX IF NOT EXISTS idx_discount_redemptions_code ON discount_redemptions (code_id)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_discount_redemptions_user ON discount_redemptions (user_id)`.catch(() => {}),
        sql`UPDATE business_cost_models SET fixed_monthly_cost = fixed_cost WHERE fixed_monthly_cost = 0 AND fixed_cost <> 0`,
        sql`UPDATE business_cost_models SET fixed_cost = fixed_monthly_cost WHERE fixed_cost = 0 AND fixed_monthly_cost <> 0`,
        sql`CREATE TABLE IF NOT EXISTS seo_results_cache (
          id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id  TEXT NOT NULL,
          cache_type   TEXT NOT NULL CHECK (cache_type IN ('overview', 'findings')),
          start_date   DATE NOT NULL,
          end_date     DATE NOT NULL,
          payload      JSONB NOT NULL,
          generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_results_cache_lookup ON seo_results_cache (business_id, cache_type, start_date, end_date)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_seo_results_cache_business ON seo_results_cache (business_id, generated_at DESC)`.catch(() => {}),
        // ── Google integration: quota & sync tables ──────────────────────────
        sql`CREATE TABLE IF NOT EXISTS provider_cooldown_state (
          id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id   TEXT NOT NULL,
          provider      TEXT NOT NULL,
          request_type  TEXT NOT NULL,
          failed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
          failure_count INT NOT NULL DEFAULT 1,
          error_message TEXT,
          http_status   INT,
          cooldown_until TIMESTAMPTZ NOT NULL,
          updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        )`.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_cooldown_state_key ON provider_cooldown_state (business_id, provider, request_type)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_provider_cooldown_state_until ON provider_cooldown_state (cooldown_until)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS provider_sync_jobs (
          id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id    TEXT NOT NULL,
          provider       TEXT NOT NULL,
          report_type    TEXT NOT NULL,
          date_range_key TEXT NOT NULL,
          status         TEXT NOT NULL DEFAULT 'pending',
          triggered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          started_at     TIMESTAMPTZ,
          lock_owner     TEXT,
          lock_expires_at TIMESTAMPTZ,
          completed_at   TIMESTAMPTZ,
          error_message  TEXT
        )`.catch(() => {}),
        sql`ALTER TABLE provider_sync_jobs ADD COLUMN IF NOT EXISTS lock_owner TEXT`.catch(() => {}),
        sql`ALTER TABLE provider_sync_jobs ADD COLUMN IF NOT EXISTS lock_expires_at TIMESTAMPTZ`.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_sync_jobs_key ON provider_sync_jobs (business_id, provider, report_type, date_range_key)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_provider_sync_jobs_status ON provider_sync_jobs (status, triggered_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_provider_sync_jobs_lock_expiry ON provider_sync_jobs (lock_expires_at)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS provider_quota_usage (
          id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id    TEXT NOT NULL,
          provider       TEXT NOT NULL,
          quota_date     DATE NOT NULL DEFAULT CURRENT_DATE,
          call_count     INT NOT NULL DEFAULT 0,
          error_count    INT NOT NULL DEFAULT 0,
          last_called_at TIMESTAMPTZ
        )`.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_quota_usage_key ON provider_quota_usage (business_id, provider, quota_date)`.catch(() => {}),
        // ── Meta warehouse-first pilot tables ───────────────────────────────
        sql`CREATE TABLE IF NOT EXISTS meta_sync_jobs (
          id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id         TEXT NOT NULL,
          provider_account_id TEXT NOT NULL,
          sync_type           TEXT NOT NULL
                              CHECK (sync_type IN ('initial_backfill', 'incremental_recent', 'today_refresh', 'repair_window', 'reconnect_backfill')),
          scope               TEXT NOT NULL DEFAULT 'account_daily',
          start_date          DATE NOT NULL,
          end_date            DATE NOT NULL,
          status              TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'running', 'succeeded', 'partial', 'failed', 'cancelled')),
          progress_percent    DOUBLE PRECISION NOT NULL DEFAULT 0,
          trigger_source      TEXT NOT NULL DEFAULT 'system',
          retry_count         INTEGER NOT NULL DEFAULT 0,
          last_error          TEXT,
          triggered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          started_at          TIMESTAMPTZ,
          finished_at         TIMESTAMPTZ,
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_sync_jobs_business ON meta_sync_jobs (business_id, triggered_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_sync_jobs_account ON meta_sync_jobs (provider_account_id, triggered_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_sync_jobs_status ON meta_sync_jobs (status, triggered_at DESC)`.catch(() => {}),
        sql`
          WITH ranked AS (
            SELECT
              id,
              ROW_NUMBER() OVER (
                PARTITION BY business_id, provider_account_id, sync_type, scope, start_date, end_date, trigger_source
                ORDER BY updated_at DESC, triggered_at DESC, id DESC
              ) AS row_number
            FROM meta_sync_jobs
            WHERE status = 'running'
          )
          UPDATE meta_sync_jobs job
          SET
            status = 'failed',
            last_error = COALESCE(job.last_error, 'duplicate running sync job cleaned up during migration'),
            finished_at = now(),
            updated_at = now()
          FROM ranked
          WHERE job.id = ranked.id
            AND ranked.row_number > 1
        `.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_sync_jobs_running_unique
          ON meta_sync_jobs (
            business_id,
            provider_account_id,
            sync_type,
            scope,
            start_date,
            end_date,
            trigger_source
          )
          WHERE status = 'running'`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS meta_sync_partitions (
          id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id         TEXT NOT NULL,
          provider_account_id TEXT NOT NULL,
          lane                TEXT NOT NULL CHECK (lane IN ('core', 'extended', 'maintenance')),
          scope               TEXT NOT NULL,
          partition_date      DATE NOT NULL,
          status              TEXT NOT NULL DEFAULT 'queued'
                              CHECK (status IN ('queued', 'leased', 'running', 'succeeded', 'failed', 'dead_letter', 'cancelled')),
          priority            INTEGER NOT NULL DEFAULT 0,
          source              TEXT NOT NULL DEFAULT 'system',
          lease_owner         TEXT,
          lease_expires_at    TIMESTAMPTZ,
          attempt_count       INTEGER NOT NULL DEFAULT 0,
          next_retry_at       TIMESTAMPTZ,
          last_error          TEXT,
          created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          started_at          TIMESTAMPTZ,
          finished_at         TIMESTAMPTZ,
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, lane, scope, partition_date)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_sync_partitions_queue
          ON meta_sync_partitions (business_id, lane, status, priority DESC, partition_date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_sync_partitions_lease
          ON meta_sync_partitions (status, lease_expires_at, next_retry_at, updated_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS meta_sync_runs (
          id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          partition_id        UUID REFERENCES meta_sync_partitions(id) ON DELETE CASCADE,
          business_id         TEXT NOT NULL,
          provider_account_id TEXT NOT NULL,
          lane                TEXT NOT NULL CHECK (lane IN ('core', 'extended', 'maintenance')),
          scope               TEXT NOT NULL,
          partition_date      DATE NOT NULL,
          status              TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),
          worker_id           TEXT,
          attempt_count       INTEGER NOT NULL DEFAULT 0,
          row_count           INTEGER,
          duration_ms         INTEGER,
          error_class         TEXT,
          error_message       TEXT,
          meta_json           JSONB NOT NULL DEFAULT '{}'::jsonb,
          started_at          TIMESTAMPTZ,
          finished_at         TIMESTAMPTZ,
          created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_sync_runs_partition ON meta_sync_runs (partition_id, created_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_sync_runs_business ON meta_sync_runs (business_id, created_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS meta_sync_checkpoints (
          id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          partition_id              UUID NOT NULL REFERENCES meta_sync_partitions(id) ON DELETE CASCADE,
          business_id               TEXT NOT NULL,
          provider_account_id       TEXT NOT NULL,
          checkpoint_scope          TEXT NOT NULL,
          phase                     TEXT NOT NULL
                                    CHECK (phase IN ('fetch_raw', 'transform', 'bulk_upsert', 'finalize')),
          status                    TEXT NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
          page_index                INTEGER NOT NULL DEFAULT 0,
          next_page_url             TEXT,
          provider_cursor           TEXT,
          rows_fetched              INTEGER NOT NULL DEFAULT 0,
          rows_written              INTEGER NOT NULL DEFAULT 0,
          last_successful_entity_key TEXT,
          last_response_headers     JSONB NOT NULL DEFAULT '{}'::jsonb,
          checkpoint_hash           TEXT,
          attempt_count             INTEGER NOT NULL DEFAULT 0,
          retry_after_at            TIMESTAMPTZ,
          lease_owner               TEXT,
          lease_expires_at          TIMESTAMPTZ,
          started_at                TIMESTAMPTZ,
          finished_at               TIMESTAMPTZ,
          created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (partition_id, checkpoint_scope)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_sync_checkpoints_partition
          ON meta_sync_checkpoints (partition_id, updated_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_sync_checkpoints_scope
          ON meta_sync_checkpoints (business_id, provider_account_id, checkpoint_scope, status, updated_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS sync_worker_heartbeats (
          worker_id          TEXT PRIMARY KEY,
          instance_type      TEXT NOT NULL,
          provider_scope     TEXT NOT NULL,
          status             TEXT NOT NULL DEFAULT 'starting'
                             CHECK (status IN ('starting', 'idle', 'running', 'stopping', 'stopped')),
          last_heartbeat_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          last_business_id   TEXT,
          last_partition_id  TEXT,
          meta_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_sync_worker_heartbeats_status
          ON sync_worker_heartbeats (status, last_heartbeat_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS sync_reclaim_events (
          id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          provider_scope    TEXT NOT NULL,
          business_id       TEXT NOT NULL,
          partition_id      TEXT,
          checkpoint_scope  TEXT,
          event_type        TEXT NOT NULL
                           CHECK (event_type IN ('reclaimed', 'poisoned')),
          disposition       TEXT,
          reason_code       TEXT,
          detail            TEXT,
          created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
        )`.catch(() => {}),
        sql`ALTER TABLE sync_reclaim_events ADD COLUMN IF NOT EXISTS disposition TEXT`.catch(() => {}),
        sql`ALTER TABLE sync_reclaim_events ADD COLUMN IF NOT EXISTS reason_code TEXT`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_sync_reclaim_events_provider
          ON sync_reclaim_events (provider_scope, business_id, created_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS sync_runner_leases (
          business_id        TEXT NOT NULL,
          provider_scope     TEXT NOT NULL,
          lease_owner        TEXT NOT NULL,
          lease_expires_at   TIMESTAMPTZ NOT NULL,
          created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (business_id, provider_scope)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_sync_runner_leases_expiry
          ON sync_runner_leases (provider_scope, lease_expires_at, updated_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS meta_sync_state (
          business_id                   TEXT NOT NULL,
          provider_account_id           TEXT NOT NULL,
          scope                         TEXT NOT NULL,
          historical_target_start       DATE NOT NULL,
          historical_target_end         DATE NOT NULL,
          effective_target_start        DATE NOT NULL,
          effective_target_end          DATE NOT NULL,
          ready_through_date            DATE,
          last_successful_partition_date DATE,
          latest_background_activity_at TIMESTAMPTZ,
          latest_successful_sync_at     TIMESTAMPTZ,
          completed_days                INTEGER NOT NULL DEFAULT 0,
          dead_letter_count             INTEGER NOT NULL DEFAULT 0,
          updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (business_id, provider_account_id, scope)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_sync_state_business
          ON meta_sync_state (business_id, scope, updated_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS meta_raw_snapshots (
          id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id          TEXT NOT NULL,
          provider_account_id  TEXT NOT NULL,
          partition_id         UUID REFERENCES meta_sync_partitions(id) ON DELETE CASCADE,
          checkpoint_id        UUID REFERENCES meta_sync_checkpoints(id) ON DELETE SET NULL,
          endpoint_name        TEXT NOT NULL,
          entity_scope         TEXT NOT NULL DEFAULT 'account',
          page_index           INTEGER,
          provider_cursor      TEXT,
          start_date           DATE NOT NULL,
          end_date             DATE NOT NULL,
          account_timezone     TEXT,
          account_currency     TEXT,
          payload_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
          payload_hash         TEXT NOT NULL,
          request_context      JSONB NOT NULL DEFAULT '{}'::jsonb,
          response_headers     JSONB NOT NULL DEFAULT '{}'::jsonb,
          provider_http_status INTEGER,
          status               TEXT NOT NULL DEFAULT 'fetched'
                               CHECK (status IN ('fetched', 'partial', 'failed')),
          fetched_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_raw_snapshots_business ON meta_raw_snapshots (business_id, fetched_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_raw_snapshots_account ON meta_raw_snapshots (provider_account_id, fetched_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_raw_snapshots_window ON meta_raw_snapshots (business_id, provider_account_id, start_date, end_date)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_raw_snapshots_endpoint ON meta_raw_snapshots (endpoint_name, fetched_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_raw_snapshots_partition_endpoint
          ON meta_raw_snapshots (partition_id, endpoint_name, page_index)`.catch(() => {}),
        sql`ALTER TABLE meta_raw_snapshots ADD COLUMN IF NOT EXISTS partition_id UUID REFERENCES meta_sync_partitions(id) ON DELETE CASCADE`.catch(() => {}),
        sql`ALTER TABLE meta_raw_snapshots ADD COLUMN IF NOT EXISTS checkpoint_id UUID REFERENCES meta_sync_checkpoints(id) ON DELETE SET NULL`.catch(() => {}),
        sql`ALTER TABLE meta_raw_snapshots ADD COLUMN IF NOT EXISTS page_index INTEGER`.catch(() => {}),
        sql`ALTER TABLE meta_raw_snapshots ADD COLUMN IF NOT EXISTS provider_cursor TEXT`.catch(() => {}),
        sql`ALTER TABLE meta_raw_snapshots ADD COLUMN IF NOT EXISTS response_headers JSONB NOT NULL DEFAULT '{}'::jsonb`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS meta_account_daily (
          id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id          TEXT NOT NULL,
          provider_account_id  TEXT NOT NULL,
          date                 DATE NOT NULL,
          account_name         TEXT,
          account_timezone     TEXT NOT NULL,
          account_currency     TEXT NOT NULL,
          spend                DOUBLE PRECISION NOT NULL DEFAULT 0,
          impressions          BIGINT NOT NULL DEFAULT 0,
          clicks               BIGINT NOT NULL DEFAULT 0,
          reach                BIGINT NOT NULL DEFAULT 0,
          frequency            DOUBLE PRECISION,
          conversions          DOUBLE PRECISION NOT NULL DEFAULT 0,
          revenue              DOUBLE PRECISION NOT NULL DEFAULT 0,
          roas                 DOUBLE PRECISION NOT NULL DEFAULT 0,
          cpa                  DOUBLE PRECISION,
          ctr                  DOUBLE PRECISION,
          cpc                  DOUBLE PRECISION,
          source_snapshot_id   UUID REFERENCES meta_raw_snapshots(id) ON DELETE SET NULL,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, date)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_account_daily_business_date ON meta_account_daily (business_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_account_daily_account_date ON meta_account_daily (provider_account_id, date DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS meta_campaign_daily (
          id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id             TEXT NOT NULL,
          provider_account_id     TEXT NOT NULL,
          date                    DATE NOT NULL,
          campaign_id             TEXT NOT NULL,
          campaign_name_current   TEXT,
          campaign_name_historical TEXT,
          campaign_status         TEXT,
          objective               TEXT,
          buying_type             TEXT,
          account_timezone        TEXT NOT NULL,
          account_currency        TEXT NOT NULL,
          spend                   DOUBLE PRECISION NOT NULL DEFAULT 0,
          impressions             BIGINT NOT NULL DEFAULT 0,
          clicks                  BIGINT NOT NULL DEFAULT 0,
          reach                   BIGINT NOT NULL DEFAULT 0,
          frequency               DOUBLE PRECISION,
          conversions             DOUBLE PRECISION NOT NULL DEFAULT 0,
          revenue                 DOUBLE PRECISION NOT NULL DEFAULT 0,
          roas                    DOUBLE PRECISION NOT NULL DEFAULT 0,
          cpa                     DOUBLE PRECISION,
          ctr                     DOUBLE PRECISION,
          cpc                     DOUBLE PRECISION,
          source_snapshot_id      UUID REFERENCES meta_raw_snapshots(id) ON DELETE SET NULL,
          created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, date, campaign_id)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_campaign_daily_business_date ON meta_campaign_daily (business_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_campaign_daily_account_date ON meta_campaign_daily (provider_account_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_campaign_daily_campaign ON meta_campaign_daily (campaign_id, date DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS meta_adset_daily (
          id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id          TEXT NOT NULL,
          provider_account_id  TEXT NOT NULL,
          date                 DATE NOT NULL,
          campaign_id          TEXT,
          adset_id             TEXT NOT NULL,
          adset_name_current   TEXT,
          adset_name_historical TEXT,
          adset_status         TEXT,
          account_timezone     TEXT NOT NULL,
          account_currency     TEXT NOT NULL,
          spend                DOUBLE PRECISION NOT NULL DEFAULT 0,
          impressions          BIGINT NOT NULL DEFAULT 0,
          clicks               BIGINT NOT NULL DEFAULT 0,
          reach                BIGINT NOT NULL DEFAULT 0,
          frequency            DOUBLE PRECISION,
          conversions          DOUBLE PRECISION NOT NULL DEFAULT 0,
          revenue              DOUBLE PRECISION NOT NULL DEFAULT 0,
          roas                 DOUBLE PRECISION NOT NULL DEFAULT 0,
          cpa                  DOUBLE PRECISION,
          ctr                  DOUBLE PRECISION,
          cpc                  DOUBLE PRECISION,
          source_snapshot_id   UUID REFERENCES meta_raw_snapshots(id) ON DELETE SET NULL,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, date, adset_id)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_adset_daily_business_date ON meta_adset_daily (business_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_adset_daily_account_date ON meta_adset_daily (provider_account_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_adset_daily_adset ON meta_adset_daily (adset_id, date DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS meta_ad_daily (
          id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id         TEXT NOT NULL,
          provider_account_id TEXT NOT NULL,
          date                DATE NOT NULL,
          campaign_id         TEXT,
          adset_id            TEXT,
          ad_id               TEXT NOT NULL,
          ad_name_current     TEXT,
          ad_name_historical  TEXT,
          ad_status           TEXT,
          account_timezone    TEXT NOT NULL,
          account_currency    TEXT NOT NULL,
          spend               DOUBLE PRECISION NOT NULL DEFAULT 0,
          impressions         BIGINT NOT NULL DEFAULT 0,
          clicks              BIGINT NOT NULL DEFAULT 0,
          reach               BIGINT NOT NULL DEFAULT 0,
          frequency           DOUBLE PRECISION,
          conversions         DOUBLE PRECISION NOT NULL DEFAULT 0,
          revenue             DOUBLE PRECISION NOT NULL DEFAULT 0,
          roas                DOUBLE PRECISION NOT NULL DEFAULT 0,
          cpa                 DOUBLE PRECISION,
          ctr                 DOUBLE PRECISION,
          cpc                 DOUBLE PRECISION,
          source_snapshot_id  UUID REFERENCES meta_raw_snapshots(id) ON DELETE SET NULL,
          created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, date, ad_id)
        )`.catch(() => {}),
        sql`ALTER TABLE meta_ad_daily ADD COLUMN IF NOT EXISTS payload_json JSONB`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_ad_daily_business_date ON meta_ad_daily (business_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_ad_daily_account_date ON meta_ad_daily (provider_account_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_ad_daily_ad ON meta_ad_daily (ad_id, date DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS meta_creative_daily (
          id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id         TEXT NOT NULL,
          provider_account_id TEXT NOT NULL,
          date                DATE NOT NULL,
          campaign_id         TEXT,
          adset_id            TEXT,
          ad_id               TEXT,
          creative_id         TEXT NOT NULL,
          creative_name       TEXT,
          headline            TEXT,
          primary_text        TEXT,
          destination_url     TEXT,
          thumbnail_url       TEXT,
          asset_type          TEXT,
          account_timezone    TEXT NOT NULL,
          account_currency    TEXT NOT NULL,
          spend               DOUBLE PRECISION NOT NULL DEFAULT 0,
          impressions         BIGINT NOT NULL DEFAULT 0,
          clicks              BIGINT NOT NULL DEFAULT 0,
          conversions         DOUBLE PRECISION NOT NULL DEFAULT 0,
          revenue             DOUBLE PRECISION NOT NULL DEFAULT 0,
          roas                DOUBLE PRECISION NOT NULL DEFAULT 0,
          ctr                 DOUBLE PRECISION,
          cpc                 DOUBLE PRECISION,
          source_snapshot_id  UUID REFERENCES meta_raw_snapshots(id) ON DELETE SET NULL,
          created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, date, creative_id)
        )`.catch(() => {}),
        sql`ALTER TABLE meta_creative_daily ADD COLUMN IF NOT EXISTS payload_json JSONB`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_creative_daily_business_date ON meta_creative_daily (business_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_creative_daily_account_date ON meta_creative_daily (provider_account_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_creative_daily_creative ON meta_creative_daily (creative_id, date DESC)`.catch(() => {}),
        // ── Google Ads warehouse-first tables ──────────────────────────────
        sql`CREATE TABLE IF NOT EXISTS google_ads_sync_jobs (
          id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id         TEXT NOT NULL,
          provider_account_id TEXT NOT NULL,
          sync_type           TEXT NOT NULL
                              CHECK (sync_type IN ('initial_backfill', 'incremental_recent', 'today_refresh', 'repair_window', 'reconnect_backfill')),
          scope               TEXT NOT NULL DEFAULT 'account_daily',
          start_date          DATE NOT NULL,
          end_date            DATE NOT NULL,
          status              TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'running', 'succeeded', 'partial', 'failed', 'cancelled')),
          progress_percent    DOUBLE PRECISION NOT NULL DEFAULT 0,
          trigger_source      TEXT NOT NULL DEFAULT 'system',
          retry_count         INTEGER NOT NULL DEFAULT 0,
          last_error          TEXT,
          triggered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          started_at          TIMESTAMPTZ,
          finished_at         TIMESTAMPTZ,
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_sync_jobs_business ON google_ads_sync_jobs (business_id, triggered_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_sync_jobs_account ON google_ads_sync_jobs (provider_account_id, triggered_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_sync_jobs_status ON google_ads_sync_jobs (status, triggered_at DESC)`.catch(() => {}),
        sql`
          WITH ranked AS (
            SELECT
              id,
              ROW_NUMBER() OVER (
                PARTITION BY business_id, provider_account_id, sync_type, scope, start_date, end_date, trigger_source
                ORDER BY updated_at DESC, triggered_at DESC, id DESC
              ) AS row_number
            FROM google_ads_sync_jobs
            WHERE status = 'running'
          )
          UPDATE google_ads_sync_jobs job
          SET
            status = 'failed',
            last_error = COALESCE(job.last_error, 'duplicate running sync job cleaned up during migration'),
            finished_at = now(),
            updated_at = now()
          FROM ranked
          WHERE job.id = ranked.id
            AND ranked.row_number > 1
        `.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_google_ads_sync_jobs_running_unique
          ON google_ads_sync_jobs (
            business_id,
            provider_account_id,
            sync_type,
            scope,
            start_date,
            end_date,
            trigger_source
          )
          WHERE status = 'running'`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS google_ads_runner_leases (
          business_id       TEXT NOT NULL,
          lane              TEXT NOT NULL CHECK (lane IN ('core', 'extended', 'maintenance')),
          lease_owner       TEXT NOT NULL,
          lease_expires_at  TIMESTAMPTZ NOT NULL,
          created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (business_id, lane)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_runner_leases_expiry
          ON google_ads_runner_leases (lease_expires_at, updated_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS google_ads_sync_partitions (
          id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id         TEXT NOT NULL,
          provider_account_id TEXT NOT NULL,
          lane                TEXT NOT NULL CHECK (lane IN ('core', 'extended', 'maintenance')),
          scope               TEXT NOT NULL,
          partition_date      DATE NOT NULL,
          status              TEXT NOT NULL DEFAULT 'queued'
                              CHECK (status IN ('queued', 'leased', 'running', 'succeeded', 'failed', 'dead_letter', 'cancelled')),
          priority            INTEGER NOT NULL DEFAULT 0,
          source              TEXT NOT NULL DEFAULT 'system',
          lease_owner         TEXT,
          lease_expires_at    TIMESTAMPTZ,
          attempt_count       INTEGER NOT NULL DEFAULT 0,
          next_retry_at       TIMESTAMPTZ,
          last_error          TEXT,
          created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          started_at          TIMESTAMPTZ,
          finished_at         TIMESTAMPTZ,
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, lane, scope, partition_date)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_sync_partitions_queue
          ON google_ads_sync_partitions (business_id, lane, status, priority DESC, partition_date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_sync_partitions_lease
          ON google_ads_sync_partitions (status, lease_expires_at, next_retry_at, updated_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS google_ads_sync_runs (
          id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          partition_id        UUID REFERENCES google_ads_sync_partitions(id) ON DELETE CASCADE,
          business_id         TEXT NOT NULL,
          provider_account_id TEXT NOT NULL,
          lane                TEXT NOT NULL CHECK (lane IN ('core', 'extended', 'maintenance')),
          scope               TEXT NOT NULL,
          partition_date      DATE NOT NULL,
          status              TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),
          worker_id           TEXT,
          attempt_count       INTEGER NOT NULL DEFAULT 0,
          row_count           INTEGER,
          duration_ms         INTEGER,
          error_class         TEXT,
          error_message       TEXT,
          meta_json           JSONB NOT NULL DEFAULT '{}'::jsonb,
          started_at          TIMESTAMPTZ,
          finished_at         TIMESTAMPTZ,
          created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_sync_runs_partition ON google_ads_sync_runs (partition_id, created_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_sync_runs_business ON google_ads_sync_runs (business_id, created_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS google_ads_sync_checkpoints (
          id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          partition_id               UUID NOT NULL REFERENCES google_ads_sync_partitions(id) ON DELETE CASCADE,
          business_id                TEXT NOT NULL,
          provider_account_id        TEXT NOT NULL,
          checkpoint_scope           TEXT NOT NULL,
          phase                      TEXT NOT NULL
                                      CHECK (phase IN ('fetch_raw', 'transform', 'bulk_upsert', 'finalize')),
          status                     TEXT NOT NULL
                                      CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
          page_index                 INTEGER NOT NULL DEFAULT 0,
          next_page_token            TEXT,
          provider_cursor            TEXT,
          rows_fetched               INTEGER NOT NULL DEFAULT 0,
          rows_written               INTEGER NOT NULL DEFAULT 0,
          last_successful_entity_key TEXT,
          last_response_headers      JSONB NOT NULL DEFAULT '{}'::jsonb,
          checkpoint_hash            TEXT,
          attempt_count              INTEGER NOT NULL DEFAULT 0,
          retry_after_at             TIMESTAMPTZ,
          lease_owner                TEXT,
          lease_expires_at           TIMESTAMPTZ,
          started_at                 TIMESTAMPTZ,
          finished_at                TIMESTAMPTZ,
          created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (partition_id, checkpoint_scope)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_sync_checkpoints_partition
          ON google_ads_sync_checkpoints (partition_id, updated_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_sync_checkpoints_scope
          ON google_ads_sync_checkpoints (business_id, provider_account_id, checkpoint_scope, status, updated_at DESC)`.catch(() => {}),
        sql`ALTER TABLE google_ads_sync_checkpoints ADD COLUMN IF NOT EXISTS is_paginated BOOLEAN NOT NULL DEFAULT FALSE`.catch(() => {}),
        sql`ALTER TABLE google_ads_sync_checkpoints ADD COLUMN IF NOT EXISTS raw_snapshot_ids JSONB NOT NULL DEFAULT '[]'::jsonb`.catch(() => {}),
        sql`ALTER TABLE google_ads_sync_checkpoints ADD COLUMN IF NOT EXISTS progress_heartbeat_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE google_ads_sync_checkpoints ADD COLUMN IF NOT EXISTS poisoned_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE google_ads_sync_checkpoints ADD COLUMN IF NOT EXISTS poison_reason TEXT`.catch(() => {}),
        sql`ALTER TABLE google_ads_sync_checkpoints ADD COLUMN IF NOT EXISTS replay_reason_code TEXT`.catch(() => {}),
        sql`ALTER TABLE google_ads_sync_checkpoints ADD COLUMN IF NOT EXISTS replay_detail TEXT`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS google_ads_sync_state (
          business_id                  TEXT NOT NULL,
          provider_account_id          TEXT NOT NULL,
          scope                        TEXT NOT NULL,
          historical_target_start      DATE NOT NULL,
          historical_target_end        DATE NOT NULL,
          effective_target_start       DATE NOT NULL,
          effective_target_end         DATE NOT NULL,
          ready_through_date           DATE,
          last_successful_partition_date DATE,
          latest_background_activity_at TIMESTAMPTZ,
          latest_successful_sync_at    TIMESTAMPTZ,
          completed_days               INTEGER NOT NULL DEFAULT 0,
          dead_letter_count            INTEGER NOT NULL DEFAULT 0,
          updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (business_id, provider_account_id, scope)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_sync_state_business
          ON google_ads_sync_state (business_id, scope, updated_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS google_ads_raw_snapshots (
          id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id          TEXT NOT NULL,
          provider_account_id  TEXT NOT NULL,
          endpoint_name        TEXT NOT NULL,
          entity_scope         TEXT NOT NULL DEFAULT 'account',
          start_date           DATE NOT NULL,
          end_date             DATE NOT NULL,
          account_timezone     TEXT,
          account_currency     TEXT,
          payload_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
          payload_hash         TEXT NOT NULL,
          request_context      JSONB NOT NULL DEFAULT '{}'::jsonb,
          provider_http_status INTEGER,
          status               TEXT NOT NULL DEFAULT 'fetched'
                               CHECK (status IN ('fetched', 'partial', 'failed')),
          fetched_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_raw_snapshots_business ON google_ads_raw_snapshots (business_id, fetched_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_raw_snapshots_account ON google_ads_raw_snapshots (provider_account_id, fetched_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_raw_snapshots_window ON google_ads_raw_snapshots (business_id, provider_account_id, start_date, end_date)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_raw_snapshots_endpoint ON google_ads_raw_snapshots (endpoint_name, fetched_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_raw_snapshots_partition_endpoint
          ON google_ads_raw_snapshots (partition_id, endpoint_name, page_index)`.catch(() => {}),
        sql`ALTER TABLE google_ads_raw_snapshots ADD COLUMN IF NOT EXISTS partition_id UUID REFERENCES google_ads_sync_partitions(id) ON DELETE CASCADE`.catch(() => {}),
        sql`ALTER TABLE google_ads_raw_snapshots ADD COLUMN IF NOT EXISTS checkpoint_id UUID REFERENCES google_ads_sync_checkpoints(id) ON DELETE SET NULL`.catch(() => {}),
        sql`ALTER TABLE google_ads_raw_snapshots ADD COLUMN IF NOT EXISTS page_index INTEGER`.catch(() => {}),
        sql`ALTER TABLE google_ads_raw_snapshots ADD COLUMN IF NOT EXISTS provider_cursor TEXT`.catch(() => {}),
        sql`ALTER TABLE google_ads_raw_snapshots ADD COLUMN IF NOT EXISTS response_headers JSONB NOT NULL DEFAULT '{}'::jsonb`.catch(() => {}),
        sql.query(buildGoogleAdsWarehouseTableQuery("google_ads_account_daily")).catch(() => {}),
        sql.query(buildGoogleAdsWarehouseTableQuery("google_ads_campaign_daily")).catch(() => {}),
        sql.query(buildGoogleAdsWarehouseTableQuery("google_ads_ad_group_daily")).catch(() => {}),
        sql.query(buildGoogleAdsWarehouseTableQuery("google_ads_ad_daily")).catch(() => {}),
        sql.query(buildGoogleAdsWarehouseTableQuery("google_ads_keyword_daily")).catch(() => {}),
        sql.query(buildGoogleAdsWarehouseTableQuery("google_ads_search_term_daily")).catch(() => {}),
        sql.query(buildGoogleAdsWarehouseTableQuery("google_ads_asset_group_daily")).catch(() => {}),
        sql.query(buildGoogleAdsWarehouseTableQuery("google_ads_asset_daily")).catch(() => {}),
        sql.query(buildGoogleAdsWarehouseTableQuery("google_ads_audience_daily")).catch(() => {}),
        sql.query(buildGoogleAdsWarehouseTableQuery("google_ads_geo_daily")).catch(() => {}),
        sql.query(buildGoogleAdsWarehouseTableQuery("google_ads_device_daily")).catch(() => {}),
        sql.query(buildGoogleAdsWarehouseTableQuery("google_ads_product_daily")).catch(() => {}),
        ...buildGoogleAdsWarehouseIndexQueries("google_ads_account_daily").map((query) => sql.query(query).catch(() => {})),
        ...buildGoogleAdsWarehouseIndexQueries("google_ads_campaign_daily").map((query) => sql.query(query).catch(() => {})),
        ...buildGoogleAdsWarehouseIndexQueries("google_ads_ad_group_daily").map((query) => sql.query(query).catch(() => {})),
        ...buildGoogleAdsWarehouseIndexQueries("google_ads_ad_daily").map((query) => sql.query(query).catch(() => {})),
        ...buildGoogleAdsWarehouseIndexQueries("google_ads_keyword_daily").map((query) => sql.query(query).catch(() => {})),
        ...buildGoogleAdsWarehouseIndexQueries("google_ads_search_term_daily").map((query) => sql.query(query).catch(() => {})),
        ...buildGoogleAdsWarehouseIndexQueries("google_ads_asset_group_daily").map((query) => sql.query(query).catch(() => {})),
        ...buildGoogleAdsWarehouseIndexQueries("google_ads_asset_daily").map((query) => sql.query(query).catch(() => {})),
        ...buildGoogleAdsWarehouseIndexQueries("google_ads_audience_daily").map((query) => sql.query(query).catch(() => {})),
        ...buildGoogleAdsWarehouseIndexQueries("google_ads_geo_daily").map((query) => sql.query(query).catch(() => {})),
        ...buildGoogleAdsWarehouseIndexQueries("google_ads_device_daily").map((query) => sql.query(query).catch(() => {})),
        ...buildGoogleAdsWarehouseIndexQueries("google_ads_product_daily").map((query) => sql.query(query).catch(() => {})),
        sql`CREATE TABLE IF NOT EXISTS shopify_raw_snapshots (
          id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id          TEXT NOT NULL,
          provider_account_id  TEXT NOT NULL,
          endpoint_name        TEXT NOT NULL,
          entity_scope         TEXT NOT NULL DEFAULT 'shop',
          start_date           DATE,
          end_date             DATE,
          payload_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
          payload_hash         TEXT NOT NULL,
          request_context      JSONB NOT NULL DEFAULT '{}'::jsonb,
          response_headers     JSONB NOT NULL DEFAULT '{}'::jsonb,
          provider_http_status INTEGER,
          status               TEXT NOT NULL DEFAULT 'fetched'
                               CHECK (status IN ('fetched', 'partial', 'failed')),
          fetched_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_raw_snapshots_business
          ON shopify_raw_snapshots (business_id, fetched_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_raw_snapshots_account
          ON shopify_raw_snapshots (provider_account_id, fetched_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_raw_snapshots_endpoint
          ON shopify_raw_snapshots (endpoint_name, fetched_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS shopify_orders (
          id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id              TEXT NOT NULL,
          provider_account_id      TEXT NOT NULL,
          shop_id                  TEXT NOT NULL,
          order_id                 TEXT NOT NULL,
          order_name               TEXT,
          customer_id              TEXT,
          currency_code            TEXT,
          shop_currency_code       TEXT,
          order_created_at         TIMESTAMPTZ NOT NULL,
          order_created_date_local DATE,
          order_updated_at         TIMESTAMPTZ,
          order_updated_date_local DATE,
          order_processed_at       TIMESTAMPTZ,
          order_cancelled_at       TIMESTAMPTZ,
          order_closed_at          TIMESTAMPTZ,
          financial_status         TEXT,
          fulfillment_status       TEXT,
          customer_journey_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
          subtotal_price           NUMERIC(18, 4) NOT NULL DEFAULT 0,
          total_discounts          NUMERIC(18, 4) NOT NULL DEFAULT 0,
          total_shipping           NUMERIC(18, 4) NOT NULL DEFAULT 0,
          total_tax                NUMERIC(18, 4) NOT NULL DEFAULT 0,
          total_refunded           NUMERIC(18, 4) NOT NULL DEFAULT 0,
          total_price              NUMERIC(18, 4) NOT NULL DEFAULT 0,
          original_total_price     NUMERIC(18, 4) NOT NULL DEFAULT 0,
          current_total_price      NUMERIC(18, 4) NOT NULL DEFAULT 0,
          payload_json             JSONB NOT NULL DEFAULT '{}'::jsonb,
          source_snapshot_id       UUID REFERENCES shopify_raw_snapshots(id) ON DELETE SET NULL,
          created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, shop_id, order_id)
        )`.catch(() => {}),
        sql`ALTER TABLE shopify_orders
          ADD COLUMN IF NOT EXISTS order_created_date_local DATE`.catch(() => {}),
        sql`ALTER TABLE shopify_orders
          ADD COLUMN IF NOT EXISTS order_updated_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE shopify_orders
          ADD COLUMN IF NOT EXISTS order_updated_date_local DATE`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_orders_business_created
          ON shopify_orders (business_id, order_created_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_orders_business_created_local
          ON shopify_orders (business_id, order_created_date_local DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_orders_business_updated
          ON shopify_orders (business_id, order_updated_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_orders_shop_created
          ON shopify_orders (shop_id, order_created_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_orders_customer
          ON shopify_orders (business_id, customer_id, order_created_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS shopify_order_lines (
          id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id          TEXT NOT NULL,
          provider_account_id  TEXT NOT NULL,
          shop_id              TEXT NOT NULL,
          order_id             TEXT NOT NULL,
          line_item_id         TEXT NOT NULL,
          product_id           TEXT,
          variant_id           TEXT,
          sku                  TEXT,
          title                TEXT,
          variant_title        TEXT,
          quantity             INTEGER NOT NULL DEFAULT 0,
          discounted_total     NUMERIC(18, 4) NOT NULL DEFAULT 0,
          original_total       NUMERIC(18, 4) NOT NULL DEFAULT 0,
          tax_total            NUMERIC(18, 4) NOT NULL DEFAULT 0,
          payload_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
          source_snapshot_id   UUID REFERENCES shopify_raw_snapshots(id) ON DELETE SET NULL,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, shop_id, order_id, line_item_id)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_order_lines_business_product
          ON shopify_order_lines (business_id, product_id, variant_id)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS shopify_refunds (
          id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id          TEXT NOT NULL,
          provider_account_id  TEXT NOT NULL,
          shop_id              TEXT NOT NULL,
          order_id             TEXT NOT NULL,
          refund_id            TEXT NOT NULL,
          refunded_at          TIMESTAMPTZ NOT NULL,
          refunded_date_local  DATE,
          refunded_sales       NUMERIC(18, 4) NOT NULL DEFAULT 0,
          refunded_shipping    NUMERIC(18, 4) NOT NULL DEFAULT 0,
          refunded_taxes       NUMERIC(18, 4) NOT NULL DEFAULT 0,
          total_refunded       NUMERIC(18, 4) NOT NULL DEFAULT 0,
          payload_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
          source_snapshot_id   UUID REFERENCES shopify_raw_snapshots(id) ON DELETE SET NULL,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, shop_id, refund_id)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_refunds_business_refunded
          ON shopify_refunds (business_id, refunded_at DESC)`.catch(() => {}),
        sql`ALTER TABLE shopify_refunds
          ADD COLUMN IF NOT EXISTS refunded_date_local DATE`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_refunds_business_refunded_local
          ON shopify_refunds (business_id, refunded_date_local DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS shopify_order_transactions (
          id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id          TEXT NOT NULL,
          provider_account_id  TEXT NOT NULL,
          shop_id              TEXT NOT NULL,
          order_id             TEXT NOT NULL,
          transaction_id       TEXT NOT NULL,
          kind                 TEXT,
          status               TEXT,
          gateway              TEXT,
          processed_at         TIMESTAMPTZ,
          amount               NUMERIC(18, 4) NOT NULL DEFAULT 0,
          currency_code        TEXT,
          payload_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
          source_snapshot_id   UUID REFERENCES shopify_raw_snapshots(id) ON DELETE SET NULL,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, shop_id, transaction_id)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_order_transactions_business_processed
          ON shopify_order_transactions (business_id, processed_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS shopify_returns (
          id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id          TEXT NOT NULL,
          provider_account_id  TEXT NOT NULL,
          shop_id              TEXT NOT NULL,
          order_id             TEXT,
          return_id            TEXT NOT NULL,
          status               TEXT,
          created_at_provider  TIMESTAMPTZ NOT NULL,
          created_date_local   DATE,
          updated_at_provider  TIMESTAMPTZ,
          updated_date_local   DATE,
          payload_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
          source_snapshot_id   UUID REFERENCES shopify_raw_snapshots(id) ON DELETE SET NULL,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, shop_id, return_id)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_returns_business_created
          ON shopify_returns (business_id, created_at_provider DESC)`.catch(() => {}),
        sql`ALTER TABLE shopify_returns
          ADD COLUMN IF NOT EXISTS created_date_local DATE`.catch(() => {}),
        sql`ALTER TABLE shopify_returns
          ADD COLUMN IF NOT EXISTS updated_date_local DATE`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_returns_business_created_local
          ON shopify_returns (business_id, created_date_local DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS shopify_customer_events (
          id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id          TEXT NOT NULL,
          provider_account_id  TEXT NOT NULL,
          shop_id              TEXT NOT NULL,
          event_id             TEXT NOT NULL,
          event_type           TEXT NOT NULL,
          occurred_at          TIMESTAMPTZ NOT NULL,
          customer_id          TEXT,
          session_id           TEXT,
          page_type            TEXT,
          page_url             TEXT,
          consent_state        TEXT,
          payload_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, shop_id, event_id)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_customer_events_business_occurred
          ON shopify_customer_events (business_id, occurred_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_customer_events_session
          ON shopify_customer_events (business_id, session_id, occurred_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS shopify_serving_state (
          business_id          TEXT NOT NULL,
          provider_account_id  TEXT NOT NULL,
          canary_key           TEXT NOT NULL,
          start_date           DATE,
          end_date             DATE,
          time_zone_basis      TEXT,
          assessed_at          TIMESTAMPTZ,
          status_state         TEXT,
          preferred_source     TEXT,
          can_serve_warehouse  BOOLEAN NOT NULL DEFAULT FALSE,
          canary_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
          decision_reasons     JSONB NOT NULL DEFAULT '[]'::jsonb,
          divergence           JSONB,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (business_id, provider_account_id, canary_key)
        )`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS start_date DATE`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS end_date DATE`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS time_zone_basis TEXT`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_serving_state_business_updated
          ON shopify_serving_state (business_id, updated_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_serving_state_business_range
          ON shopify_serving_state (business_id, start_date DESC, end_date DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS shopify_sync_state (
          business_id              TEXT NOT NULL,
          provider_account_id      TEXT NOT NULL,
          sync_target              TEXT NOT NULL,
          historical_target_start  DATE,
          historical_target_end    DATE,
          ready_through_date       DATE,
          cursor_timestamp         TIMESTAMPTZ,
          cursor_value             TEXT,
          latest_sync_started_at   TIMESTAMPTZ,
          latest_successful_sync_at TIMESTAMPTZ,
          latest_sync_status       TEXT,
          latest_sync_window_start DATE,
          latest_sync_window_end   DATE,
          last_error               TEXT,
          last_result_summary      JSONB,
          updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (business_id, provider_account_id, sync_target)
        )`.catch(() => {}),
        sql`ALTER TABLE shopify_sync_state
          ADD COLUMN IF NOT EXISTS cursor_timestamp TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE shopify_sync_state
          ADD COLUMN IF NOT EXISTS cursor_value TEXT`.catch(() => {}),
        sql`ALTER TABLE shopify_sync_state
          ADD COLUMN IF NOT EXISTS last_result_summary JSONB`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_sync_state_business
          ON shopify_sync_state (business_id, updated_at DESC)`.catch(() => {}),
      ]);

      // ── Seed superadmin ───────────────────────────────────────────────────
      await sql`UPDATE users SET is_superadmin = true WHERE lower(email) = 'emrahbilaloglu@gmail.com'`;

      migrationsCompleted = true;
      logStartupEvent("migrations_completed", { reason });
    })(),
    timeoutMs,
  );

  try {
    await migrationsPromise;
  } catch (error) {
    migrationsPromise = null;

    const isSystemCatalogRace =
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "23505" &&
      "table" in error &&
      typeof (error as { table: string }).table === "string" &&
      ["pg_type", "pg_class"].includes((error as { table: string }).table);

    if (isSystemCatalogRace) {
      migrationsCompleted = true;
      logStartupEvent("migrations_completed_after_race", { reason });
      return;
    }

    logStartupError("migrations_failed", error, { reason, force });
    throw error;
  }
}
