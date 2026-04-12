import { getDb, getDbWithTimeout } from "@/lib/db";
import { logStartupError, logStartupEvent } from "@/lib/startup-diagnostics";

let migrationsPromise: Promise<void> | null = null;
let migrationsCompleted = false;
let loggedMigrationSkip = false;

const DEFAULT_MIGRATION_TIMEOUT_MS = 60_000;
type MigrationBatchQuery = Promise<unknown>;

function createMigrationDb(sql: ReturnType<typeof getDb>) {
  let queue = Promise.resolve();

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = queue.then(operation, operation);
    queue = next.then(() => undefined, () => undefined);
    return next;
  };

  return Object.assign(
    ((strings: TemplateStringsArray, ...values: unknown[]) =>
      enqueue(() => sql(strings, ...values))) as ReturnType<typeof getDb>,
    {
      query: ((...args: Parameters<ReturnType<typeof getDb>["query"]>) =>
        enqueue(() => sql.query(...args))) as ReturnType<typeof getDb>["query"],
    },
  );
}

async function runMigrationBatchSequentially(queries: MigrationBatchQuery[]) {
  for (const query of queries) {
    await query;
  }
}

function runtimeMigrationsEnabled() {
  const explicit = process.env.ENABLE_RUNTIME_MIGRATIONS?.trim().toLowerCase();
  if (explicit === "1" || explicit === "true") return true;
  if (explicit === "0" || explicit === "false") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return false;
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
    `CREATE INDEX IF NOT EXISTS idx_${tableName}_business_account_date ON ${tableName} (business_id, provider_account_id, date DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_${tableName}_business_date_entity ON ${tableName} (business_id, date DESC, entity_key)`,
    `CREATE INDEX IF NOT EXISTS idx_${tableName}_campaign_date ON ${tableName} (campaign_id, date DESC)`,
  ];
}

export async function runMigrations(options?: {
  force?: boolean;
  reason?: string;
  timeoutMs?: number;
}) {
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

  const timeoutMs = options?.timeoutMs ?? getMigrationTimeoutMs();
  logStartupEvent("migrations_started", { reason, force, timeoutMs });

  migrationsPromise = withMigrationTimeout(
    (async () => {
      const sql = createMigrationDb(
        options?.timeoutMs != null ? getDbWithTimeout(options.timeoutMs) : getDb()
      );

      // ── PHASE 1: Tables with no FK dependencies (ordered batch) ───────────
      await runMigrationBatchSequentially([
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
        sql`CREATE TABLE IF NOT EXISTS provider_account_rollover_state (
          provider                 TEXT NOT NULL,
          business_id              TEXT NOT NULL,
          provider_account_id      TEXT NOT NULL,
          last_observed_current_date DATE NOT NULL,
          current_d1_target_date   DATE NOT NULL,
          rollover_detected_at     TIMESTAMPTZ,
          d1_finalize_started_at   TIMESTAMPTZ,
          d1_finalize_completed_at TIMESTAMPTZ,
          last_recovery_at         TIMESTAMPTZ,
          created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (provider, business_id, provider_account_id)
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
        sql`CREATE INDEX IF NOT EXISTS idx_provider_account_rollover_state_business
          ON provider_account_rollover_state (business_id, provider, updated_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_provider_account_rollover_state_target
          ON provider_account_rollover_state (provider, current_d1_target_date DESC, updated_at DESC)`.catch(() => {}),
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
          source         TEXT NOT NULL DEFAULT 'deterministic' CHECK (source IN ('deterministic', 'fallback')),
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
      await runMigrationBatchSequentially([
        sql`CREATE TABLE IF NOT EXISTS businesses (
          id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name             TEXT NOT NULL,
          owner_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          timezone         TEXT,
          timezone_source  TEXT,
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
        sql`ALTER TABLE businesses ALTER COLUMN timezone DROP NOT NULL`.catch(() => {}),
        sql`ALTER TABLE businesses ALTER COLUMN timezone DROP DEFAULT`.catch(() => {}),
        sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS timezone_source TEXT`.catch(() => {}),
        sql`ALTER TABLE integrations ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb`,
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_biz_provider ON integrations (business_id, provider)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_integrations_business_id ON integrations (business_id)`.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_account_assignments_biz_provider ON provider_account_assignments (business_id, provider)`.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_account_snapshots_biz_provider ON provider_account_snapshots (business_id, provider)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_provider_account_snapshots_business ON provider_account_snapshots (business_id)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_provider_account_snapshots_next_refresh ON provider_account_snapshots (next_refresh_after)`.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_reporting_snapshots_lookup ON provider_reporting_snapshots (business_id, provider, report_type, date_range_key)`.catch(() => {}),
        sql`
          UPDATE businesses AS business
          SET
            timezone = derived.timezone,
            timezone_source = derived.timezone_source
          FROM (
            SELECT
              b.id AS business_id,
              CASE
                WHEN NULLIF(shopify.metadata->>'iana_timezone', '') IS NOT NULL
                  THEN shopify.metadata->>'iana_timezone'
                WHEN NULLIF(ga4.metadata->>'ga4PropertyTimeZone', '') IS NOT NULL
                  THEN ga4.metadata->>'ga4PropertyTimeZone'
                ELSE NULL
              END AS timezone,
              CASE
                WHEN NULLIF(shopify.metadata->>'iana_timezone', '') IS NOT NULL THEN 'shopify'
                WHEN NULLIF(ga4.metadata->>'ga4PropertyTimeZone', '') IS NOT NULL THEN 'ga4'
                ELSE NULL
              END AS timezone_source
            FROM businesses b
            LEFT JOIN integrations shopify
              ON shopify.business_id = b.id
             AND shopify.provider = 'shopify'
             AND shopify.status = 'connected'
            LEFT JOIN integrations ga4
              ON ga4.business_id = b.id
             AND ga4.provider = 'ga4'
             AND ga4.status = 'connected'
          ) AS derived
          WHERE business.id = derived.business_id
            AND (
              business.timezone IS DISTINCT FROM derived.timezone
              OR business.timezone_source IS DISTINCT FROM derived.timezone_source
            )
        `.catch(() => {}),
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
        sql`ALTER TABLE ai_creative_decisions_cache DROP CONSTRAINT IF EXISTS ai_creative_decisions_cache_source_check`.catch(() => {}),
        sql`UPDATE ai_creative_decisions_cache SET source = 'deterministic' WHERE source = 'ai'`.catch(() => {}),
        sql`ALTER TABLE ai_creative_decisions_cache ALTER COLUMN source SET DEFAULT 'deterministic'`.catch(() => {}),
        sql`ALTER TABLE ai_creative_decisions_cache ADD CONSTRAINT ai_creative_decisions_cache_source_check CHECK (source IN ('deterministic', 'fallback'))`.catch(() => {}),
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
      await runMigrationBatchSequentially([
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
        sql`CREATE TABLE IF NOT EXISTS business_target_packs (
          id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id                    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          target_cpa                     DOUBLE PRECISION,
          target_roas                    DOUBLE PRECISION,
          break_even_cpa                 DOUBLE PRECISION,
          break_even_roas                DOUBLE PRECISION,
          contribution_margin_assumption DOUBLE PRECISION,
          aov_assumption                 DOUBLE PRECISION,
          new_customer_weight            DOUBLE PRECISION,
          default_risk_posture           TEXT NOT NULL DEFAULT 'balanced'
                                          CHECK (default_risk_posture IN ('conservative', 'balanced', 'aggressive')),
          source_label                   TEXT,
          updated_by_user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id)
        )`,
        sql`CREATE TABLE IF NOT EXISTS business_country_economics (
          id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id          UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          country_code         TEXT NOT NULL,
          economics_multiplier DOUBLE PRECISION,
          margin_modifier      DOUBLE PRECISION,
          serviceability       TEXT NOT NULL DEFAULT 'full'
                                CHECK (serviceability IN ('full', 'limited', 'blocked')),
          priority_tier        TEXT NOT NULL DEFAULT 'tier_2'
                                CHECK (priority_tier IN ('tier_1', 'tier_2', 'tier_3')),
          scale_override       TEXT NOT NULL DEFAULT 'default'
                                CHECK (scale_override IN ('default', 'prefer_scale', 'hold', 'deprioritize')),
          notes                TEXT,
          source_label         TEXT,
          updated_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, country_code)
        )`,
        sql`CREATE TABLE IF NOT EXISTS business_promo_calendar_events (
          id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id        UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          event_id           TEXT NOT NULL,
          title              TEXT NOT NULL,
          promo_type         TEXT NOT NULL DEFAULT 'sale'
                              CHECK (promo_type IN ('sale', 'launch', 'clearance', 'seasonal', 'other')),
          severity           TEXT NOT NULL DEFAULT 'medium'
                              CHECK (severity IN ('low', 'medium', 'high')),
          start_date         DATE NOT NULL,
          end_date           DATE NOT NULL,
          affected_scope     TEXT,
          notes              TEXT,
          source_label       TEXT,
          updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, event_id)
        )`,
        sql`CREATE TABLE IF NOT EXISTS business_operating_constraints (
          id                                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id                          UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          site_issue_status                    TEXT NOT NULL DEFAULT 'none'
                                                CHECK (site_issue_status IN ('none', 'watch', 'critical')),
          checkout_issue_status                TEXT NOT NULL DEFAULT 'none'
                                                CHECK (checkout_issue_status IN ('none', 'watch', 'critical')),
          conversion_tracking_issue_status     TEXT NOT NULL DEFAULT 'none'
                                                CHECK (conversion_tracking_issue_status IN ('none', 'watch', 'critical')),
          feed_issue_status                    TEXT NOT NULL DEFAULT 'none'
                                                CHECK (feed_issue_status IN ('none', 'watch', 'critical')),
          stock_pressure_status                TEXT NOT NULL DEFAULT 'healthy'
                                                CHECK (stock_pressure_status IN ('healthy', 'watch', 'blocked')),
          landing_page_concern                 TEXT,
          merchandising_concern                TEXT,
          manual_do_not_scale_reason           TEXT,
          source_label                         TEXT,
          updated_by_user_id                   UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at                           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at                           TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id)
        )`,
        sql`CREATE TABLE IF NOT EXISTS business_decision_calibration_profiles (
          id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id                UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          channel                    TEXT NOT NULL
                                       CHECK (channel IN ('meta', 'creative', 'command_center')),
          objective_family           TEXT NOT NULL
                                       CHECK (objective_family IN ('sales', 'catalog', 'leads', 'traffic', 'awareness', 'engagement', 'unknown')),
          bid_regime                 TEXT NOT NULL
                                       CHECK (bid_regime IN ('open', 'cost_cap', 'bid_cap', 'roas_floor', 'unknown')),
          archetype                  TEXT NOT NULL,
          target_roas_multiplier     DOUBLE PRECISION,
          break_even_roas_multiplier DOUBLE PRECISION,
          target_cpa_multiplier      DOUBLE PRECISION,
          break_even_cpa_multiplier  DOUBLE PRECISION,
          confidence_cap             DOUBLE PRECISION,
          action_ceiling             TEXT
                                       CHECK (action_ceiling IN ('review_hold', 'review_reduce', 'monitor_low_truth', 'degraded_no_scale')),
          notes                      TEXT,
          source_label               TEXT,
          updated_by_user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, channel, objective_family, bid_regime, archetype)
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
        sql`CREATE TABLE IF NOT EXISTS command_center_action_state (
          id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          action_fingerprint  TEXT NOT NULL,
          source_system       TEXT NOT NULL CHECK (source_system IN ('meta', 'creative')),
          source_type         TEXT NOT NULL,
          action_title        TEXT NOT NULL,
          recommended_action  TEXT NOT NULL,
          workflow_status     TEXT NOT NULL DEFAULT 'pending'
                                CHECK (workflow_status IN ('pending', 'approved', 'rejected', 'snoozed', 'completed_manual', 'executed', 'failed', 'canceled')),
          assignee_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
          snooze_until        TIMESTAMPTZ,
          latest_note_excerpt TEXT,
          note_count          INTEGER NOT NULL DEFAULT 0,
          last_mutation_id    TEXT,
          last_mutated_at     TIMESTAMPTZ,
          created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, action_fingerprint)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_command_center_action_state_business_status
          ON command_center_action_state (business_id, workflow_status, updated_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_command_center_action_state_business_assignee
          ON command_center_action_state (business_id, assignee_user_id, updated_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS command_center_action_journal (
          id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id        UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          action_fingerprint TEXT NOT NULL,
          action_title       TEXT NOT NULL,
          source_system      TEXT NOT NULL CHECK (source_system IN ('meta', 'creative')),
          source_type        TEXT NOT NULL,
          event_type         TEXT NOT NULL
                              CHECK (event_type IN ('status_changed', 'assignee_changed', 'note_added', 'handoff_created', 'handoff_acknowledged')),
          actor_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          client_mutation_id TEXT NOT NULL,
          message            TEXT NOT NULL,
          note               TEXT,
          metadata_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, client_mutation_id)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_command_center_action_journal_business_action
          ON command_center_action_journal (business_id, action_fingerprint, created_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_command_center_action_journal_business_created
          ON command_center_action_journal (business_id, created_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS command_center_mutation_receipts (
          id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id        UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          client_mutation_id TEXT NOT NULL,
          mutation_scope     TEXT NOT NULL,
          payload_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, client_mutation_id)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_command_center_mutation_receipts_business_created
          ON command_center_mutation_receipts (business_id, created_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS command_center_saved_views (
          id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          view_key        TEXT NOT NULL,
          name            TEXT NOT NULL,
          definition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, view_key)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_command_center_saved_views_business
          ON command_center_saved_views (business_id, updated_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS command_center_handoffs (
          id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id                UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          shift                      TEXT NOT NULL CHECK (shift IN ('morning', 'evening')),
          summary                    TEXT NOT NULL,
          blockers_json              JSONB NOT NULL DEFAULT '[]'::jsonb,
          watchouts_json             JSONB NOT NULL DEFAULT '[]'::jsonb,
          linked_action_fingerprints TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
          from_user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          to_user_id                 UUID REFERENCES users(id) ON DELETE SET NULL,
          acknowledged_at            TIMESTAMPTZ,
          acknowledged_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
          created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_command_center_handoffs_business_shift
          ON command_center_handoffs (business_id, shift, updated_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS command_center_feedback (
          id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id        UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          client_mutation_id TEXT NOT NULL,
          feedback_type      TEXT NOT NULL
                              CHECK (feedback_type IN ('false_positive', 'bad_recommendation', 'false_negative')),
          outcome            TEXT NOT NULL DEFAULT 'operator_note'
                              CHECK (outcome IN ('calibration_candidate', 'workflow_gap', 'operator_note')),
          scope              TEXT NOT NULL CHECK (scope IN ('action', 'queue_gap')),
          action_fingerprint TEXT,
          action_title       TEXT,
          source_system      TEXT CHECK (source_system IN ('meta', 'creative')),
          source_type        TEXT,
          workload_class     TEXT
                              CHECK (workload_class IN ('budget_shift', 'scale_promotion', 'recovery', 'creative_refresh', 'test_backlog', 'geo_review', 'risk_triage', 'policy_guardrail', 'protected_watch', 'archive_context')),
          calibration_hint_json JSONB NOT NULL DEFAULT 'null'::jsonb,
          view_key           TEXT,
          note               TEXT NOT NULL,
          actor_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, client_mutation_id)
        )`.catch(() => {}),
        sql`ALTER TABLE command_center_feedback
          ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT 'operator_note'
            CHECK (outcome IN ('calibration_candidate', 'workflow_gap', 'operator_note'))`.catch(() => {}),
        sql`ALTER TABLE command_center_feedback
          ADD COLUMN IF NOT EXISTS workload_class TEXT
            CHECK (workload_class IN ('budget_shift', 'scale_promotion', 'recovery', 'creative_refresh', 'test_backlog', 'geo_review', 'risk_triage', 'policy_guardrail', 'protected_watch', 'archive_context'))`.catch(() => {}),
        sql`ALTER TABLE command_center_feedback
          ADD COLUMN IF NOT EXISTS calibration_hint_json JSONB NOT NULL DEFAULT 'null'::jsonb`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_command_center_feedback_business_created
          ON command_center_feedback (business_id, created_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_command_center_feedback_business_action
          ON command_center_feedback (business_id, action_fingerprint, created_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS command_center_action_execution_state (
          id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id                  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          action_fingerprint           TEXT NOT NULL,
          execution_status             TEXT NOT NULL
                                        CHECK (execution_status IN ('draft', 'ready_for_apply', 'applying', 'executed', 'failed', 'rolled_back', 'manual_only', 'unsupported')),
          support_mode                 TEXT NOT NULL
                                        CHECK (support_mode IN ('supported', 'manual_only', 'unsupported')),
          source_system                TEXT NOT NULL CHECK (source_system IN ('meta', 'creative')),
          source_type                  TEXT NOT NULL,
          requested_action             TEXT NOT NULL,
          preview_hash                 TEXT,
          workflow_status_snapshot     TEXT NOT NULL DEFAULT 'pending'
                                        CHECK (workflow_status_snapshot IN ('pending', 'approved', 'rejected', 'snoozed', 'completed_manual', 'executed', 'failed', 'canceled')),
          approval_actor_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
          approval_actor_name          TEXT,
          approval_actor_email         TEXT,
          approved_at                  TIMESTAMPTZ,
          applied_by_user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
          applied_by_name              TEXT,
          applied_by_email             TEXT,
          applied_at                   TIMESTAMPTZ,
          rollback_kind                TEXT NOT NULL DEFAULT 'not_available'
                                        CHECK (rollback_kind IN ('provider_rollback', 'recovery_note_only', 'not_available')),
          rollback_note                TEXT,
          last_client_mutation_id      TEXT,
          last_error_code              TEXT,
          last_error_message           TEXT,
          current_state_json           JSONB NOT NULL DEFAULT 'null'::jsonb,
          requested_state_json         JSONB NOT NULL DEFAULT 'null'::jsonb,
          captured_pre_apply_state_json JSONB NOT NULL DEFAULT 'null'::jsonb,
          provider_response_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, action_fingerprint)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_command_center_action_execution_state_business_status
          ON command_center_action_execution_state (business_id, execution_status, updated_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS command_center_action_execution_audit (
          id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id                  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          action_fingerprint           TEXT NOT NULL,
          client_mutation_id           TEXT NOT NULL,
          operation                    TEXT NOT NULL CHECK (operation IN ('apply', 'rollback')),
          execution_status             TEXT NOT NULL
                                        CHECK (execution_status IN ('draft', 'ready_for_apply', 'applying', 'executed', 'failed', 'rolled_back', 'manual_only', 'unsupported')),
          support_mode                 TEXT NOT NULL
                                        CHECK (support_mode IN ('supported', 'manual_only', 'unsupported')),
          actor_user_id                UUID REFERENCES users(id) ON DELETE SET NULL,
          actor_name                   TEXT,
          actor_email                  TEXT,
          approval_actor_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
          approval_actor_name          TEXT,
          approval_actor_email         TEXT,
          approved_at                  TIMESTAMPTZ,
          preview_hash                 TEXT,
          rollback_kind                TEXT NOT NULL DEFAULT 'not_available'
                                        CHECK (rollback_kind IN ('provider_rollback', 'recovery_note_only', 'not_available')),
          rollback_note                TEXT,
          current_state_json           JSONB NOT NULL DEFAULT 'null'::jsonb,
          requested_state_json         JSONB NOT NULL DEFAULT 'null'::jsonb,
          captured_pre_apply_state_json JSONB NOT NULL DEFAULT 'null'::jsonb,
          provider_response_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
          failure_reason               TEXT,
          external_refs_json           JSONB NOT NULL DEFAULT 'null'::jsonb,
          created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, client_mutation_id)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_command_center_action_execution_audit_business_action
          ON command_center_action_execution_audit (business_id, action_fingerprint, created_at DESC)`.catch(() => {}),
      ]);

      // ── PHASE 4: Tables with deeper deps + all remaining indexes ──────────
      await runMigrationBatchSequentially([
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
        sql`CREATE INDEX IF NOT EXISTS idx_business_target_packs_business_id ON business_target_packs (business_id)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_business_country_economics_business_country ON business_country_economics (business_id, country_code)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_business_promo_calendar_events_business_event ON business_promo_calendar_events (business_id, event_id)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_business_promo_calendar_events_business_dates ON business_promo_calendar_events (business_id, start_date, end_date)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_business_operating_constraints_business_id ON business_operating_constraints (business_id)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_business_decision_calibration_profiles_business ON business_decision_calibration_profiles (business_id, channel)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_business_decision_calibration_profiles_profile ON business_decision_calibration_profiles (business_id, objective_family, bid_regime, archetype)`.catch(() => {}),
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
      await runMigrationBatchSequentially([
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
        sql`ALTER TABLE meta_sync_partitions ADD COLUMN IF NOT EXISTS lease_epoch BIGINT NOT NULL DEFAULT 0`.catch(() => {}),
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
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_meta_sync_runs_one_running_per_partition
          ON meta_sync_runs (partition_id)
          WHERE status = 'running'`.catch(() => {}),
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
        sql`ALTER TABLE meta_sync_checkpoints ADD COLUMN IF NOT EXISTS lease_epoch BIGINT`.catch(() => {}),
        sql`ALTER TABLE meta_sync_checkpoints ADD COLUMN IF NOT EXISTS run_id TEXT`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_sync_checkpoints_partition_epoch
          ON meta_sync_checkpoints (partition_id, lease_epoch, updated_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_sync_checkpoints_partition_run
          ON meta_sync_checkpoints (partition_id, checkpoint_scope, run_id, updated_at DESC)`.catch(() => {}),
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
        sql`ALTER TABLE meta_raw_snapshots ADD COLUMN IF NOT EXISTS run_id TEXT`.catch(() => {}),
        sql`ALTER TABLE meta_raw_snapshots ADD COLUMN IF NOT EXISTS page_index INTEGER`.catch(() => {}),
        sql`ALTER TABLE meta_raw_snapshots ADD COLUMN IF NOT EXISTS provider_cursor TEXT`.catch(() => {}),
        sql`ALTER TABLE meta_raw_snapshots ADD COLUMN IF NOT EXISTS response_headers JSONB NOT NULL DEFAULT '{}'::jsonb`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_raw_snapshots_partition_run_endpoint
          ON meta_raw_snapshots (partition_id, run_id, endpoint_name, page_index)`.catch(() => {}),
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
          metric_schema_version INTEGER NOT NULL DEFAULT 1,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, date)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_account_daily_business_date ON meta_account_daily (business_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_account_daily_account_date ON meta_account_daily (provider_account_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_account_daily_business_account_date
          ON meta_account_daily (business_id, provider_account_id, date DESC)`.catch(() => {}),
        sql`ALTER TABLE meta_account_daily ADD COLUMN IF NOT EXISTS truth_state TEXT NOT NULL DEFAULT 'finalized'`.catch(() => {}),
        sql`ALTER TABLE meta_account_daily ADD COLUMN IF NOT EXISTS truth_version INTEGER NOT NULL DEFAULT 1`.catch(() => {}),
        sql`ALTER TABLE meta_account_daily ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE meta_account_daily ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'passed'`.catch(() => {}),
        sql`ALTER TABLE meta_account_daily ADD COLUMN IF NOT EXISTS source_run_id TEXT`.catch(() => {}),
        sql`ALTER TABLE meta_account_daily ADD COLUMN IF NOT EXISTS metric_schema_version INTEGER NOT NULL DEFAULT 1`.catch(() => {}),
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
          optimization_goal       TEXT,
          bid_strategy_type       TEXT,
          bid_strategy_label      TEXT,
          manual_bid_amount       DOUBLE PRECISION,
          bid_value               DOUBLE PRECISION,
          bid_value_format        TEXT,
          daily_budget            DOUBLE PRECISION,
          lifetime_budget         DOUBLE PRECISION,
          is_budget_mixed         BOOLEAN NOT NULL DEFAULT FALSE,
          is_config_mixed         BOOLEAN NOT NULL DEFAULT FALSE,
          is_optimization_goal_mixed BOOLEAN NOT NULL DEFAULT FALSE,
          is_bid_strategy_mixed   BOOLEAN NOT NULL DEFAULT FALSE,
          is_bid_value_mixed      BOOLEAN NOT NULL DEFAULT FALSE,
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
          metric_schema_version   INTEGER NOT NULL DEFAULT 1,
          created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, date, campaign_id)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_campaign_daily_business_date ON meta_campaign_daily (business_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_campaign_daily_account_date ON meta_campaign_daily (provider_account_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_campaign_daily_campaign ON meta_campaign_daily (campaign_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_campaign_daily_business_account_date
          ON meta_campaign_daily (business_id, provider_account_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_campaign_daily_business_date_campaign
          ON meta_campaign_daily (business_id, date DESC, campaign_id)`.catch(() => {}),
        sql`ALTER TABLE meta_campaign_daily ADD COLUMN IF NOT EXISTS optimization_goal TEXT`.catch(() => {}),
        sql`ALTER TABLE meta_campaign_daily ADD COLUMN IF NOT EXISTS bid_strategy_type TEXT`.catch(() => {}),
        sql`ALTER TABLE meta_campaign_daily ADD COLUMN IF NOT EXISTS bid_strategy_label TEXT`.catch(() => {}),
        sql`ALTER TABLE meta_campaign_daily ADD COLUMN IF NOT EXISTS manual_bid_amount DOUBLE PRECISION`.catch(() => {}),
        sql`ALTER TABLE meta_campaign_daily ADD COLUMN IF NOT EXISTS bid_value DOUBLE PRECISION`.catch(() => {}),
        sql`ALTER TABLE meta_campaign_daily ADD COLUMN IF NOT EXISTS bid_value_format TEXT`.catch(() => {}),
        sql`ALTER TABLE meta_campaign_daily ADD COLUMN IF NOT EXISTS daily_budget DOUBLE PRECISION`.catch(() => {}),
        sql`ALTER TABLE meta_campaign_daily ADD COLUMN IF NOT EXISTS lifetime_budget DOUBLE PRECISION`.catch(() => {}),
        sql`ALTER TABLE meta_campaign_daily ADD COLUMN IF NOT EXISTS is_budget_mixed BOOLEAN NOT NULL DEFAULT FALSE`.catch(() => {}),
        sql`ALTER TABLE meta_campaign_daily ADD COLUMN IF NOT EXISTS is_config_mixed BOOLEAN NOT NULL DEFAULT FALSE`.catch(() => {}),
        sql`ALTER TABLE meta_campaign_daily ADD COLUMN IF NOT EXISTS is_optimization_goal_mixed BOOLEAN NOT NULL DEFAULT FALSE`.catch(() => {}),
        sql`ALTER TABLE meta_campaign_daily ADD COLUMN IF NOT EXISTS is_bid_strategy_mixed BOOLEAN NOT NULL DEFAULT FALSE`.catch(() => {}),
        sql`ALTER TABLE meta_campaign_daily ADD COLUMN IF NOT EXISTS is_bid_value_mixed BOOLEAN NOT NULL DEFAULT FALSE`.catch(() => {}),
        sql`ALTER TABLE meta_campaign_daily ADD COLUMN IF NOT EXISTS truth_state TEXT NOT NULL DEFAULT 'finalized'`.catch(() => {}),
        sql`ALTER TABLE meta_campaign_daily ADD COLUMN IF NOT EXISTS truth_version INTEGER NOT NULL DEFAULT 1`.catch(() => {}),
        sql`ALTER TABLE meta_campaign_daily ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE meta_campaign_daily ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'passed'`.catch(() => {}),
        sql`ALTER TABLE meta_campaign_daily ADD COLUMN IF NOT EXISTS source_run_id TEXT`.catch(() => {}),
        sql`ALTER TABLE meta_campaign_daily ADD COLUMN IF NOT EXISTS metric_schema_version INTEGER NOT NULL DEFAULT 1`.catch(() => {}),
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
          optimization_goal    TEXT,
          bid_strategy_type    TEXT,
          bid_strategy_label   TEXT,
          manual_bid_amount    DOUBLE PRECISION,
          bid_value            DOUBLE PRECISION,
          bid_value_format     TEXT,
          daily_budget         DOUBLE PRECISION,
          lifetime_budget      DOUBLE PRECISION,
          is_budget_mixed      BOOLEAN NOT NULL DEFAULT FALSE,
          is_config_mixed      BOOLEAN NOT NULL DEFAULT FALSE,
          is_optimization_goal_mixed BOOLEAN NOT NULL DEFAULT FALSE,
          is_bid_strategy_mixed BOOLEAN NOT NULL DEFAULT FALSE,
          is_bid_value_mixed   BOOLEAN NOT NULL DEFAULT FALSE,
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
          metric_schema_version INTEGER NOT NULL DEFAULT 1,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, date, adset_id)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_adset_daily_business_date ON meta_adset_daily (business_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_adset_daily_account_date ON meta_adset_daily (provider_account_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_adset_daily_adset ON meta_adset_daily (adset_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_adset_daily_business_account_date
          ON meta_adset_daily (business_id, provider_account_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_adset_daily_business_date_adset
          ON meta_adset_daily (business_id, date DESC, adset_id)`.catch(() => {}),
        sql`ALTER TABLE meta_adset_daily ADD COLUMN IF NOT EXISTS optimization_goal TEXT`.catch(() => {}),
        sql`ALTER TABLE meta_adset_daily ADD COLUMN IF NOT EXISTS bid_strategy_type TEXT`.catch(() => {}),
        sql`ALTER TABLE meta_adset_daily ADD COLUMN IF NOT EXISTS bid_strategy_label TEXT`.catch(() => {}),
        sql`ALTER TABLE meta_adset_daily ADD COLUMN IF NOT EXISTS manual_bid_amount DOUBLE PRECISION`.catch(() => {}),
        sql`ALTER TABLE meta_adset_daily ADD COLUMN IF NOT EXISTS bid_value DOUBLE PRECISION`.catch(() => {}),
        sql`ALTER TABLE meta_adset_daily ADD COLUMN IF NOT EXISTS bid_value_format TEXT`.catch(() => {}),
        sql`ALTER TABLE meta_adset_daily ADD COLUMN IF NOT EXISTS daily_budget DOUBLE PRECISION`.catch(() => {}),
        sql`ALTER TABLE meta_adset_daily ADD COLUMN IF NOT EXISTS lifetime_budget DOUBLE PRECISION`.catch(() => {}),
        sql`ALTER TABLE meta_adset_daily ADD COLUMN IF NOT EXISTS is_budget_mixed BOOLEAN NOT NULL DEFAULT FALSE`.catch(() => {}),
        sql`ALTER TABLE meta_adset_daily ADD COLUMN IF NOT EXISTS is_config_mixed BOOLEAN NOT NULL DEFAULT FALSE`.catch(() => {}),
        sql`ALTER TABLE meta_adset_daily ADD COLUMN IF NOT EXISTS is_optimization_goal_mixed BOOLEAN NOT NULL DEFAULT FALSE`.catch(() => {}),
        sql`ALTER TABLE meta_adset_daily ADD COLUMN IF NOT EXISTS is_bid_strategy_mixed BOOLEAN NOT NULL DEFAULT FALSE`.catch(() => {}),
        sql`ALTER TABLE meta_adset_daily ADD COLUMN IF NOT EXISTS is_bid_value_mixed BOOLEAN NOT NULL DEFAULT FALSE`.catch(() => {}),
        sql`ALTER TABLE meta_adset_daily ADD COLUMN IF NOT EXISTS truth_state TEXT NOT NULL DEFAULT 'finalized'`.catch(() => {}),
        sql`ALTER TABLE meta_adset_daily ADD COLUMN IF NOT EXISTS truth_version INTEGER NOT NULL DEFAULT 1`.catch(() => {}),
        sql`ALTER TABLE meta_adset_daily ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE meta_adset_daily ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'passed'`.catch(() => {}),
        sql`ALTER TABLE meta_adset_daily ADD COLUMN IF NOT EXISTS source_run_id TEXT`.catch(() => {}),
        sql`ALTER TABLE meta_adset_daily ADD COLUMN IF NOT EXISTS metric_schema_version INTEGER NOT NULL DEFAULT 1`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS meta_breakdown_daily (
          id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id         TEXT NOT NULL,
          provider_account_id TEXT NOT NULL,
          date                DATE NOT NULL,
          breakdown_type      TEXT NOT NULL,
          breakdown_key       TEXT NOT NULL,
          breakdown_label     TEXT NOT NULL,
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
          truth_state         TEXT NOT NULL DEFAULT 'finalized',
          truth_version       INTEGER NOT NULL DEFAULT 1,
          finalized_at        TIMESTAMPTZ,
          validation_status   TEXT NOT NULL DEFAULT 'passed',
          source_run_id       TEXT,
          created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, date, breakdown_type, breakdown_key)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_breakdown_daily_business_date
          ON meta_breakdown_daily (business_id, date DESC, breakdown_type)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_breakdown_daily_account_date
          ON meta_breakdown_daily (provider_account_id, date DESC, breakdown_type)`.catch(() => {}),
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
          link_clicks         BIGINT NOT NULL DEFAULT 0,
          source_snapshot_id  UUID REFERENCES meta_raw_snapshots(id) ON DELETE SET NULL,
          source_run_id       TEXT,
          metric_schema_version INTEGER NOT NULL DEFAULT 1,
          created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, date, ad_id)
        )`.catch(() => {}),
        sql`ALTER TABLE meta_ad_daily ADD COLUMN IF NOT EXISTS payload_json JSONB`.catch(() => {}),
        sql`ALTER TABLE meta_ad_daily ADD COLUMN IF NOT EXISTS link_clicks BIGINT NOT NULL DEFAULT 0`.catch(() => {}),
        sql`ALTER TABLE meta_ad_daily ADD COLUMN IF NOT EXISTS source_run_id TEXT`.catch(() => {}),
        sql`ALTER TABLE meta_ad_daily ADD COLUMN IF NOT EXISTS metric_schema_version INTEGER NOT NULL DEFAULT 1`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_ad_daily_business_date ON meta_ad_daily (business_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_ad_daily_account_date ON meta_ad_daily (provider_account_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_ad_daily_ad ON meta_ad_daily (ad_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_ad_daily_business_account_date
          ON meta_ad_daily (business_id, provider_account_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_ad_daily_business_date_ad
          ON meta_ad_daily (business_id, date DESC, ad_id)`.catch(() => {}),
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
          link_clicks         BIGINT NOT NULL DEFAULT 0,
          source_snapshot_id  UUID REFERENCES meta_raw_snapshots(id) ON DELETE SET NULL,
          source_run_id       TEXT,
          metric_schema_version INTEGER NOT NULL DEFAULT 1,
          created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, date, creative_id)
        )`.catch(() => {}),
        sql`ALTER TABLE meta_creative_daily ADD COLUMN IF NOT EXISTS payload_json JSONB`.catch(() => {}),
        sql`ALTER TABLE meta_creative_daily ADD COLUMN IF NOT EXISTS link_clicks BIGINT NOT NULL DEFAULT 0`.catch(() => {}),
        sql`ALTER TABLE meta_creative_daily ADD COLUMN IF NOT EXISTS source_run_id TEXT`.catch(() => {}),
        sql`ALTER TABLE meta_creative_daily ADD COLUMN IF NOT EXISTS metric_schema_version INTEGER NOT NULL DEFAULT 1`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_creative_daily_business_date ON meta_creative_daily (business_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_creative_daily_account_date ON meta_creative_daily (provider_account_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_creative_daily_creative ON meta_creative_daily (creative_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_creative_daily_business_account_date
          ON meta_creative_daily (business_id, provider_account_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_creative_daily_business_account_date_creative
          ON meta_creative_daily (business_id, provider_account_id, date DESC, creative_id)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS meta_creative_score_snapshots (
          id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id         TEXT NOT NULL,
          provider_account_id TEXT NOT NULL,
          creative_id         TEXT NOT NULL,
          as_of_date          DATE NOT NULL,
          selected_start_date DATE NOT NULL,
          selected_end_date   DATE NOT NULL,
          window_metrics      JSONB NOT NULL DEFAULT '{}'::jsonb,
          selected_row_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
          weighted_score      DOUBLE PRECISION,
          label               TEXT,
          computed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          freshness_state     TEXT NOT NULL DEFAULT 'fresh',
          rule_version        TEXT NOT NULL,
          created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (
            business_id,
            provider_account_id,
            creative_id,
            as_of_date,
            selected_start_date,
            selected_end_date,
            rule_version
          )
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_creative_score_snapshots_lookup ON meta_creative_score_snapshots (business_id, selected_start_date, selected_end_date, as_of_date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_creative_score_snapshots_creative ON meta_creative_score_snapshots (creative_id, as_of_date DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS meta_authoritative_source_manifests (
          id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id             TEXT NOT NULL,
          provider_account_id     TEXT NOT NULL,
          day                     DATE NOT NULL,
          surface                 TEXT NOT NULL,
          account_timezone        TEXT NOT NULL,
          source_kind             TEXT NOT NULL,
          source_window_kind      TEXT NOT NULL,
          run_id                  TEXT,
          fetch_status            TEXT NOT NULL DEFAULT 'pending',
          fresh_start_applied     BOOLEAN NOT NULL DEFAULT FALSE,
          checkpoint_reset_applied BOOLEAN NOT NULL DEFAULT FALSE,
          raw_snapshot_watermark  TEXT,
          source_spend            DOUBLE PRECISION,
          validation_basis_version TEXT,
          meta_json               JSONB NOT NULL DEFAULT '{}'::jsonb,
          started_at              TIMESTAMPTZ,
          completed_at            TIMESTAMPTZ,
          created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_authoritative_source_manifests_lookup
          ON meta_authoritative_source_manifests (business_id, provider_account_id, day DESC, surface, created_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_authoritative_source_manifests_run
          ON meta_authoritative_source_manifests (run_id, created_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS meta_authoritative_slice_versions (
          id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id             TEXT NOT NULL,
          provider_account_id     TEXT NOT NULL,
          day                     DATE NOT NULL,
          surface                 TEXT NOT NULL,
          manifest_id             UUID REFERENCES meta_authoritative_source_manifests(id) ON DELETE SET NULL,
          candidate_version       INTEGER NOT NULL,
          state                   TEXT NOT NULL DEFAULT 'pending_finalization',
          truth_state             TEXT NOT NULL DEFAULT 'finalized',
          validation_status       TEXT NOT NULL DEFAULT 'pending',
          status                  TEXT NOT NULL DEFAULT 'staging',
          staged_row_count        INTEGER,
          aggregated_spend        DOUBLE PRECISION,
          validation_summary      JSONB NOT NULL DEFAULT '{}'::jsonb,
          source_run_id           TEXT,
          stage_started_at        TIMESTAMPTZ,
          stage_completed_at      TIMESTAMPTZ,
          published_at            TIMESTAMPTZ,
          superseded_at           TIMESTAMPTZ,
          created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, day, surface, candidate_version)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_authoritative_slice_versions_lookup
          ON meta_authoritative_slice_versions (business_id, provider_account_id, day DESC, surface, candidate_version DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_authoritative_slice_versions_manifest
          ON meta_authoritative_slice_versions (manifest_id, created_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS meta_authoritative_publication_pointers (
          id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id             TEXT NOT NULL,
          provider_account_id     TEXT NOT NULL,
          day                     DATE NOT NULL,
          surface                 TEXT NOT NULL,
          active_slice_version_id UUID NOT NULL REFERENCES meta_authoritative_slice_versions(id) ON DELETE CASCADE,
          published_by_run_id     TEXT,
          publication_reason      TEXT NOT NULL,
          published_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, day, surface)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_authoritative_publication_pointers_slice
          ON meta_authoritative_publication_pointers (active_slice_version_id, published_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS meta_authoritative_reconciliation_events (
          id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id             TEXT NOT NULL,
          provider_account_id     TEXT NOT NULL,
          day                     DATE NOT NULL,
          surface                 TEXT NOT NULL,
          slice_version_id        UUID REFERENCES meta_authoritative_slice_versions(id) ON DELETE SET NULL,
          manifest_id             UUID REFERENCES meta_authoritative_source_manifests(id) ON DELETE SET NULL,
          event_kind              TEXT NOT NULL,
          severity                TEXT NOT NULL DEFAULT 'info',
          source_spend            DOUBLE PRECISION,
          warehouse_account_spend DOUBLE PRECISION,
          warehouse_campaign_spend DOUBLE PRECISION,
          tolerance_applied       DOUBLE PRECISION,
          result                  TEXT NOT NULL,
          details_json            JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_meta_authoritative_reconciliation_events_lookup
          ON meta_authoritative_reconciliation_events (business_id, provider_account_id, day DESC, surface, created_at DESC)`.catch(() => {}),
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
        sql`ALTER TABLE google_ads_sync_partitions ADD COLUMN IF NOT EXISTS lease_epoch BIGINT NOT NULL DEFAULT 0`.catch(() => {}),
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
        sql`ALTER TABLE google_ads_sync_checkpoints ADD COLUMN IF NOT EXISTS lease_epoch BIGINT`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_sync_checkpoints_partition_epoch
          ON google_ads_sync_checkpoints (partition_id, lease_epoch, updated_at DESC)`.catch(() => {}),
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
        sql`ALTER TABLE google_ads_search_term_daily ADD COLUMN IF NOT EXISTS query_hash TEXT`.catch(() => {}),
        sql`ALTER TABLE google_ads_search_term_daily ADD COLUMN IF NOT EXISTS normalized_query TEXT`.catch(() => {}),
        sql`ALTER TABLE google_ads_search_term_daily ADD COLUMN IF NOT EXISTS cluster_key TEXT`.catch(() => {}),
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
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_search_term_daily_query_hash
          ON google_ads_search_term_daily (business_id, date DESC, query_hash)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS google_ads_query_dictionary (
          query_hash       TEXT PRIMARY KEY,
          normalized_query TEXT NOT NULL,
          display_query    TEXT NOT NULL,
          token_count      INTEGER NOT NULL DEFAULT 0,
          first_seen_date  DATE NOT NULL,
          last_seen_date   DATE NOT NULL,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
        )`.catch(() => {}),
        sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_google_ads_query_dictionary_normalized
          ON google_ads_query_dictionary (normalized_query)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS google_ads_search_query_hot_daily (
          id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id        TEXT NOT NULL,
          provider_account_id TEXT NOT NULL,
          date               DATE NOT NULL,
          account_timezone   TEXT NOT NULL DEFAULT 'UTC',
          account_currency   TEXT NOT NULL DEFAULT 'USD',
          query_hash         TEXT NOT NULL REFERENCES google_ads_query_dictionary(query_hash) ON DELETE RESTRICT,
          campaign_id        TEXT,
          campaign_name      TEXT,
          ad_group_id        TEXT,
          ad_group_name      TEXT,
          cluster_key        TEXT NOT NULL,
          cluster_label      TEXT NOT NULL,
          theme_key          TEXT,
          intent_class       TEXT,
          ownership_class    TEXT,
          spend              NUMERIC(18, 4) NOT NULL DEFAULT 0,
          revenue            NUMERIC(18, 4) NOT NULL DEFAULT 0,
          conversions        NUMERIC(18, 4) NOT NULL DEFAULT 0,
          impressions        BIGINT NOT NULL DEFAULT 0,
          clicks             BIGINT NOT NULL DEFAULT 0,
          source_snapshot_id UUID REFERENCES google_ads_raw_snapshots(id) ON DELETE SET NULL,
          created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, date, query_hash, campaign_id, ad_group_id)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_search_query_hot_daily_business_date
          ON google_ads_search_query_hot_daily (business_id, provider_account_id, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_search_query_hot_daily_query
          ON google_ads_search_query_hot_daily (query_hash, date DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS google_ads_top_query_weekly (
          id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id        TEXT NOT NULL,
          provider_account_id TEXT NOT NULL,
          week_start         DATE NOT NULL,
          week_end           DATE NOT NULL,
          query_hash         TEXT NOT NULL REFERENCES google_ads_query_dictionary(query_hash) ON DELETE RESTRICT,
          query_count_days   INTEGER NOT NULL DEFAULT 0,
          spend              NUMERIC(18, 4) NOT NULL DEFAULT 0,
          revenue            NUMERIC(18, 4) NOT NULL DEFAULT 0,
          conversions        NUMERIC(18, 4) NOT NULL DEFAULT 0,
          impressions        BIGINT NOT NULL DEFAULT 0,
          clicks             BIGINT NOT NULL DEFAULT 0,
          created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, week_start, query_hash)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_top_query_weekly_business
          ON google_ads_top_query_weekly (business_id, provider_account_id, week_start DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS google_ads_search_cluster_daily (
          id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id             TEXT NOT NULL,
          provider_account_id     TEXT NOT NULL,
          date                    DATE NOT NULL,
          cluster_key             TEXT NOT NULL,
          cluster_label           TEXT NOT NULL,
          theme_key               TEXT,
          dominant_intent_class   TEXT,
          dominant_ownership_class TEXT,
          unique_query_count      INTEGER NOT NULL DEFAULT 0,
          spend                   NUMERIC(18, 4) NOT NULL DEFAULT 0,
          revenue                 NUMERIC(18, 4) NOT NULL DEFAULT 0,
          conversions             NUMERIC(18, 4) NOT NULL DEFAULT 0,
          impressions             BIGINT NOT NULL DEFAULT 0,
          clicks                  BIGINT NOT NULL DEFAULT 0,
          created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, date, cluster_key)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_search_cluster_daily_business
          ON google_ads_search_cluster_daily (business_id, provider_account_id, date DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS google_ads_decision_action_outcome_logs (
          id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id              TEXT NOT NULL,
          provider_account_id      TEXT,
          recommendation_fingerprint TEXT NOT NULL,
          decision_family          TEXT,
          action_type              TEXT NOT NULL,
          outcome_status           TEXT,
          summary                  TEXT NOT NULL,
          payload_json             JSONB NOT NULL DEFAULT '{}'::jsonb,
          occurred_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_decision_action_outcome_logs_business
          ON google_ads_decision_action_outcome_logs (business_id, occurred_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_decision_action_outcome_logs_recommendation
          ON google_ads_decision_action_outcome_logs (recommendation_fingerprint, occurred_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS google_ads_retention_runs (
          id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          execution_mode             TEXT NOT NULL
                                     CHECK (execution_mode IN ('dry_run', 'execute')),
          execution_enabled          BOOLEAN NOT NULL DEFAULT FALSE,
          skipped_due_to_active_lease BOOLEAN NOT NULL DEFAULT FALSE,
          total_deleted_rows         INTEGER NOT NULL DEFAULT 0,
          summary_json               JSONB NOT NULL DEFAULT '{}'::jsonb,
          error_message              TEXT,
          started_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
          finished_at                TIMESTAMPTZ,
          created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_google_ads_retention_runs_finished
          ON google_ads_retention_runs (finished_at DESC NULLS LAST, created_at DESC)`.catch(() => {}),
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
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_orders_business_account_created_local
          ON shopify_orders (business_id, provider_account_id, order_created_date_local DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_orders_business_account_created_fallback
          ON shopify_orders (business_id, provider_account_id, (order_created_at::date) DESC)
          WHERE order_created_date_local IS NULL`.catch(() => {}),
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
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_refunds_business_account_refunded_local
          ON shopify_refunds (business_id, provider_account_id, refunded_date_local DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_refunds_business_account_refunded_fallback
          ON shopify_refunds (business_id, provider_account_id, (refunded_at::date) DESC)
          WHERE refunded_date_local IS NULL`.catch(() => {}),
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
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_returns_business_account_created_local
          ON shopify_returns (business_id, provider_account_id, created_date_local DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_returns_business_account_created_fallback
          ON shopify_returns (business_id, provider_account_id, (created_at_provider::date) DESC)
          WHERE created_date_local IS NULL`.catch(() => {}),
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
        sql`CREATE TABLE IF NOT EXISTS shopify_sales_events (
          id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id          TEXT NOT NULL,
          provider_account_id  TEXT NOT NULL,
          shop_id              TEXT NOT NULL,
          event_id             TEXT NOT NULL,
          source_kind          TEXT NOT NULL,
          source_id            TEXT NOT NULL,
          order_id             TEXT,
          occurred_at          TIMESTAMPTZ NOT NULL,
          occurred_date_local  DATE,
          gross_sales          NUMERIC(18,2) NOT NULL DEFAULT 0,
          refunded_sales       NUMERIC(18,2) NOT NULL DEFAULT 0,
          refunded_shipping    NUMERIC(18,2) NOT NULL DEFAULT 0,
          refunded_taxes       NUMERIC(18,2) NOT NULL DEFAULT 0,
          net_revenue          NUMERIC(18,2) NOT NULL DEFAULT 0,
          currency_code        TEXT,
          payload_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
          source_snapshot_id   UUID REFERENCES shopify_raw_snapshots(id) ON DELETE SET NULL,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, shop_id, event_id)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_sales_events_business_date
          ON shopify_sales_events (business_id, occurred_date_local DESC, occurred_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_sales_events_order
          ON shopify_sales_events (business_id, order_id, occurred_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS shopify_serving_overrides (
          business_id          TEXT NOT NULL,
          provider_account_id  TEXT NOT NULL,
          override_key         TEXT NOT NULL,
          start_date           DATE,
          end_date             DATE,
          mode                 TEXT NOT NULL DEFAULT 'auto',
          reason               TEXT,
          updated_by           TEXT,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (business_id, provider_account_id, override_key)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_serving_overrides_business_range
          ON shopify_serving_overrides (business_id, start_date DESC, end_date DESC, updated_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS shopify_webhook_deliveries (
          id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id          TEXT,
          provider_account_id  TEXT,
          topic                TEXT NOT NULL,
          shop_domain          TEXT NOT NULL,
          webhook_id           TEXT,
          payload_hash         TEXT NOT NULL,
          payload_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
          received_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          processed_at         TIMESTAMPTZ,
          processing_state     TEXT NOT NULL DEFAULT 'received',
          result_summary       JSONB,
          error_message        TEXT,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (shop_domain, topic, payload_hash)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_webhook_deliveries_business
          ON shopify_webhook_deliveries (business_id, received_at DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS shopify_reconciliation_runs (
          id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id          TEXT NOT NULL,
          provider_account_id  TEXT NOT NULL,
          reconciliation_key   TEXT NOT NULL,
          start_date           DATE,
          end_date             DATE,
          preferred_source     TEXT,
          can_serve_warehouse  BOOLEAN NOT NULL DEFAULT FALSE,
          selected_revenue_truth_basis TEXT,
          basis_selection_reason TEXT,
          transaction_coverage_order_rate DOUBLE PRECISION,
          transaction_coverage_amount_rate DOUBLE PRECISION,
          order_revenue_truth_delta DOUBLE PRECISION,
          transaction_revenue_delta DOUBLE PRECISION,
          explained_adjustment_revenue DOUBLE PRECISION,
          unexplained_adjustment_revenue DOUBLE PRECISION,
          divergence           JSONB,
          warehouse_aggregate  JSONB,
          ledger_aggregate     JSONB,
          live_aggregate       JSONB,
          recorded_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_reconciliation_runs_business_recorded
          ON shopify_reconciliation_runs (business_id, recorded_at DESC)`.catch(() => {}),
        sql`ALTER TABLE shopify_reconciliation_runs
          ADD COLUMN IF NOT EXISTS selected_revenue_truth_basis TEXT`.catch(() => {}),
        sql`ALTER TABLE shopify_reconciliation_runs
          ADD COLUMN IF NOT EXISTS basis_selection_reason TEXT`.catch(() => {}),
        sql`ALTER TABLE shopify_reconciliation_runs
          ADD COLUMN IF NOT EXISTS transaction_coverage_order_rate DOUBLE PRECISION`.catch(() => {}),
        sql`ALTER TABLE shopify_reconciliation_runs
          ADD COLUMN IF NOT EXISTS transaction_coverage_amount_rate DOUBLE PRECISION`.catch(() => {}),
        sql`ALTER TABLE shopify_reconciliation_runs
          ADD COLUMN IF NOT EXISTS order_revenue_truth_delta DOUBLE PRECISION`.catch(() => {}),
        sql`ALTER TABLE shopify_reconciliation_runs
          ADD COLUMN IF NOT EXISTS transaction_revenue_delta DOUBLE PRECISION`.catch(() => {}),
        sql`ALTER TABLE shopify_reconciliation_runs
          ADD COLUMN IF NOT EXISTS explained_adjustment_revenue DOUBLE PRECISION`.catch(() => {}),
        sql`ALTER TABLE shopify_reconciliation_runs
          ADD COLUMN IF NOT EXISTS unexplained_adjustment_revenue DOUBLE PRECISION`.catch(() => {}),
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
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS orders_recent_synced_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS orders_recent_cursor_timestamp TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS orders_recent_cursor_value TEXT`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS returns_recent_synced_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS returns_recent_cursor_timestamp TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS returns_recent_cursor_value TEXT`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS orders_historical_synced_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS orders_historical_ready_through_date DATE`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS orders_historical_target_end DATE`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS returns_historical_synced_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS returns_historical_ready_through_date DATE`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS returns_historical_target_end DATE`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS production_mode TEXT`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS trust_state TEXT`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS fallback_reason TEXT`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS coverage_status TEXT`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS pending_repair BOOLEAN NOT NULL DEFAULT FALSE`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS pending_repair_started_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS pending_repair_last_topic TEXT`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS pending_repair_last_received_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state
          ADD COLUMN IF NOT EXISTS consecutive_clean_validations INTEGER NOT NULL DEFAULT 0`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_serving_state_business_updated
          ON shopify_serving_state (business_id, updated_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_serving_state_business_range
          ON shopify_serving_state (business_id, start_date DESC, end_date DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS shopify_serving_state_history (
          id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id          TEXT NOT NULL,
          provider_account_id  TEXT NOT NULL,
          canary_key           TEXT NOT NULL,
          start_date           DATE,
          end_date             DATE,
          time_zone_basis      TEXT,
          assessed_at          TIMESTAMPTZ,
          status_state         TEXT,
          preferred_source     TEXT,
          orders_recent_synced_at TIMESTAMPTZ,
          orders_recent_cursor_timestamp TIMESTAMPTZ,
          orders_recent_cursor_value TEXT,
          returns_recent_synced_at TIMESTAMPTZ,
          returns_recent_cursor_timestamp TIMESTAMPTZ,
          returns_recent_cursor_value TEXT,
          orders_historical_synced_at TIMESTAMPTZ,
          orders_historical_ready_through_date DATE,
          orders_historical_target_end DATE,
          returns_historical_synced_at TIMESTAMPTZ,
          returns_historical_ready_through_date DATE,
          returns_historical_target_end DATE,
          can_serve_warehouse  BOOLEAN NOT NULL DEFAULT FALSE,
          canary_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
          decision_reasons     JSONB NOT NULL DEFAULT '[]'::jsonb,
          divergence           JSONB,
          created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_serving_state_history_business_assessed
          ON shopify_serving_state_history (business_id, assessed_at DESC, created_at DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_serving_state_history_business_range
          ON shopify_serving_state_history (business_id, start_date DESC, end_date DESC, assessed_at DESC)`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS orders_recent_synced_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS orders_recent_cursor_timestamp TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS orders_recent_cursor_value TEXT`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS returns_recent_synced_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS returns_recent_cursor_timestamp TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS returns_recent_cursor_value TEXT`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS orders_historical_synced_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS orders_historical_ready_through_date DATE`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS orders_historical_target_end DATE`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS returns_historical_synced_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS returns_historical_ready_through_date DATE`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS returns_historical_target_end DATE`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS production_mode TEXT`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS trust_state TEXT`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS fallback_reason TEXT`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS coverage_status TEXT`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS pending_repair BOOLEAN NOT NULL DEFAULT FALSE`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS pending_repair_started_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS pending_repair_last_topic TEXT`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS pending_repair_last_received_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE shopify_serving_state_history
          ADD COLUMN IF NOT EXISTS consecutive_clean_validations INTEGER NOT NULL DEFAULT 0`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS shopify_repair_intents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id TEXT NOT NULL,
          provider_account_id TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          topic TEXT NOT NULL,
          payload_hash TEXT NOT NULL,
          event_timestamp TIMESTAMPTZ,
          event_age_days INTEGER,
          escalation_level INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'pending',
          attempt_count INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          last_sync_result JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider_account_id, entity_type, entity_id, topic, payload_hash)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_shopify_repair_intents_business_updated
          ON shopify_repair_intents (business_id, updated_at DESC)`.catch(() => {}),
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
        sql`CREATE TABLE IF NOT EXISTS platform_overview_daily_summary (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          provider_account_id TEXT NOT NULL,
          date DATE NOT NULL,
          spend NUMERIC(18, 4) NOT NULL DEFAULT 0,
          revenue NUMERIC(18, 4) NOT NULL DEFAULT 0,
          purchases NUMERIC(18, 4) NOT NULL DEFAULT 0,
          impressions BIGINT NOT NULL DEFAULT 0,
          clicks BIGINT NOT NULL DEFAULT 0,
          source_updated_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider, provider_account_id, date)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_platform_overview_daily_summary_business_provider_date
          ON platform_overview_daily_summary (business_id, provider, date DESC)`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_platform_overview_daily_summary_business_account_date
          ON platform_overview_daily_summary (business_id, provider_account_id, date DESC)`.catch(() => {}),
        sql`CREATE TABLE IF NOT EXISTS platform_overview_summary_ranges (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          business_id TEXT NOT NULL,
          provider TEXT NOT NULL,
          provider_account_ids_hash TEXT NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          row_count INTEGER NOT NULL DEFAULT 0,
          expected_row_count INTEGER,
          coverage_complete BOOLEAN NOT NULL DEFAULT FALSE,
          max_source_updated_at TIMESTAMPTZ,
          truth_state TEXT,
          projection_version INTEGER NOT NULL DEFAULT 1,
          invalidation_reason TEXT,
          hydrated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (business_id, provider, provider_account_ids_hash, start_date, end_date)
        )`.catch(() => {}),
        sql`CREATE INDEX IF NOT EXISTS idx_platform_overview_summary_ranges_business_provider
          ON platform_overview_summary_ranges (business_id, provider, hydrated_at DESC)`.catch(() => {}),
        sql`ALTER TABLE platform_overview_summary_ranges
          ADD COLUMN IF NOT EXISTS expected_row_count INTEGER`.catch(() => {}),
        sql`ALTER TABLE platform_overview_summary_ranges
          ADD COLUMN IF NOT EXISTS coverage_complete BOOLEAN NOT NULL DEFAULT FALSE`.catch(() => {}),
        sql`ALTER TABLE platform_overview_summary_ranges
          ADD COLUMN IF NOT EXISTS max_source_updated_at TIMESTAMPTZ`.catch(() => {}),
        sql`ALTER TABLE platform_overview_summary_ranges
          ADD COLUMN IF NOT EXISTS truth_state TEXT`.catch(() => {}),
        sql`ALTER TABLE platform_overview_summary_ranges
          ADD COLUMN IF NOT EXISTS projection_version INTEGER NOT NULL DEFAULT 1`.catch(() => {}),
        sql`ALTER TABLE platform_overview_summary_ranges
          ADD COLUMN IF NOT EXISTS invalidation_reason TEXT`.catch(() => {}),
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
