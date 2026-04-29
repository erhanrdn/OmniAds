BEGIN;

CREATE TABLE IF NOT EXISTS calibration_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       TEXT,
  ad_account_id     TEXT NOT NULL DEFAULT 'account_default',
  objective_family  TEXT NOT NULL DEFAULT 'objective_default',
  format_family     TEXT NOT NULL DEFAULT 'format_default',
  calibration_version TEXT NOT NULL DEFAULT 'global-default-v0.5',
  segment_key       TEXT,
  algorithm         TEXT NOT NULL,
  thresholds_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  training_set_ref  TEXT,
  holdout_set_ref   TEXT,
  metrics_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  promoted_at       TIMESTAMPTZ,
  retired_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_calibration_versions_business_created
  ON calibration_versions (business_id, ad_account_id, objective_family, format_family, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_calibration_versions_segment_created
  ON calibration_versions (segment_key, created_at DESC);

CREATE TABLE IF NOT EXISTS calibration_thresholds_by_business (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id             TEXT NOT NULL,
  ad_account_id           TEXT NOT NULL DEFAULT 'account_default',
  objective_family        TEXT NOT NULL DEFAULT 'objective_default',
  format_family           TEXT NOT NULL DEFAULT 'format_default',
  calibration_version_id  UUID NOT NULL REFERENCES calibration_versions(id) ON DELETE RESTRICT,
  persona                 TEXT NOT NULL DEFAULT 'balanced',
  thresholds_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
  source                  TEXT NOT NULL,
  sample_size             INTEGER NOT NULL DEFAULT 0,
  weighted_agreement      DOUBLE PRECISION,
  weighted_kappa          DOUBLE PRECISION,
  severe_error_rate       DOUBLE PRECISION,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at            TIMESTAMPTZ,
  retired_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_calibration_thresholds_business_active
  ON calibration_thresholds_by_business (business_id, ad_account_id, objective_family, format_family, retired_at, activated_at DESC);

CREATE TABLE IF NOT EXISTS decision_override_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id             TEXT NOT NULL,
  ad_account_id           TEXT NOT NULL DEFAULT 'account_default',
  objective_family        TEXT NOT NULL DEFAULT 'objective_default',
  format_family           TEXT NOT NULL DEFAULT 'format_default',
  creative_id             TEXT NOT NULL,
  snapshot_id             TEXT,
  model_action            TEXT NOT NULL,
  model_readiness         TEXT NOT NULL,
  model_confidence        DOUBLE PRECISION NOT NULL,
  user_action             TEXT NOT NULL,
  user_strength           TEXT NOT NULL,
  reason_chip             TEXT,
  action_distance         INTEGER NOT NULL,
  severity                TEXT NOT NULL,
  surface                 TEXT,
  metrics_hash            TEXT,
  calibration_version_id  UUID REFERENCES calibration_versions(id) ON DELETE SET NULL,
  created_by              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  queued_at               TIMESTAMPTZ,
  handled_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_decision_override_events_business_created
  ON decision_override_events (business_id, ad_account_id, objective_family, format_family, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_decision_override_events_severity_queue
  ON decision_override_events (severity, queued_at DESC)
  WHERE queued_at IS NOT NULL AND handled_at IS NULL;

CREATE TABLE IF NOT EXISTS creative_canonical_resolver_flags (
  business_id       TEXT PRIMARY KEY,
  assignment        TEXT NOT NULL DEFAULT 'legacy',
  source            TEXT NOT NULL DEFAULT 'sticky_cohort',
  assigned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS creative_canonical_cohort_assignments (
  business_id             TEXT PRIMARY KEY,
  cohort                  TEXT NOT NULL DEFAULT 'legacy',
  source                  TEXT NOT NULL DEFAULT 'default_legacy',
  assigned_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  kill_switch_active_at   TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_feature_flag_kill_switches (
  key             TEXT PRIMARY KEY,
  active          BOOLEAN NOT NULL DEFAULT false,
  activated_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS creative_canonical_resolver_admin_controls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  control_type      TEXT NOT NULL,
  business_id       TEXT,
  enabled           BOOLEAN NOT NULL DEFAULT true,
  reason            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creative_canonical_resolver_admin_controls_type
  ON creative_canonical_resolver_admin_controls (control_type, business_id, enabled);

CREATE TABLE IF NOT EXISTS creative_canonical_decision_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           TEXT NOT NULL,
  creative_id           TEXT,
  snapshot_id           TEXT,
  cohort                TEXT NOT NULL DEFAULT 'legacy',
  canonical_action      TEXT,
  legacy_action         TEXT,
  action_readiness      TEXT,
  confidence_value      DOUBLE PRECISION,
  reviewed              BOOLEAN NOT NULL DEFAULT true,
  fallback_rerun_badge  BOOLEAN NOT NULL DEFAULT false,
  llm_call_count        INTEGER NOT NULL DEFAULT 0,
  llm_cost_usd          DOUBLE PRECISION NOT NULL DEFAULT 0,
  llm_error_count       INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creative_canonical_decision_events_business_created
  ON creative_canonical_decision_events (business_id, cohort, created_at DESC);

COMMIT;
