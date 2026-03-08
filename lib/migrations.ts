import { getDb } from "@/lib/db";

/**
 * Run all migrations in order.
 * Each migration is idempotent (IF NOT EXISTS).
 */
export async function runMigrations() {
  const sql = getDb();

  // ── auth core tables ───────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name           TEXT NOT NULL,
      email          TEXT NOT NULL UNIQUE,
      password_hash  TEXT NOT NULL,
      avatar         TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS businesses (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT NOT NULL,
      owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      timezone    TEXT NOT NULL DEFAULT 'UTC',
      currency    TEXT NOT NULL DEFAULT 'USD',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS memberships (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      role         TEXT NOT NULL CHECK (role IN ('admin', 'collaborator', 'guest')),
      status       TEXT NOT NULL CHECK (status IN ('active', 'invited', 'pending')),
      joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, business_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS invites (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email        TEXT NOT NULL,
      business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      role         TEXT NOT NULL CHECK (role IN ('admin', 'collaborator', 'guest')),
      token        TEXT NOT NULL UNIQUE,
      status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_invites_business_id
    ON invites (business_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_invites_email
    ON invites (email)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash          TEXT NOT NULL UNIQUE,
      active_business_id  UUID REFERENCES businesses(id) ON DELETE SET NULL,
      expires_at          TIMESTAMPTZ NOT NULL,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id
    ON sessions (user_id)
  `;

  // ── integrations table ────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS integrations (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      business_id     TEXT        NOT NULL,
      provider        TEXT        NOT NULL,
      status          TEXT        NOT NULL DEFAULT 'disconnected',

      -- provider identity
      provider_account_id   TEXT,
      provider_account_name TEXT,

      -- tokens (encrypted at rest by Neon)
      access_token    TEXT,
      refresh_token   TEXT,
      token_expires_at TIMESTAMPTZ,
      scopes          TEXT,

      -- error tracking
      error_message   TEXT,

      -- timestamps
      connected_at    TIMESTAMPTZ,
      disconnected_at TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  // unique: one integration per provider per business
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_biz_provider
    ON integrations (business_id, provider)
  `;

  // fast lookup by business
  await sql`
    CREATE INDEX IF NOT EXISTS idx_integrations_business_id
    ON integrations (business_id)
  `;

  // ── provider account assignments table ───────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS provider_account_assignments (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      business_id  TEXT NOT NULL,
      provider     TEXT NOT NULL,
      account_ids  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_account_assignments_biz_provider
    ON provider_account_assignments (business_id, provider)
  `;

  // ── creative share snapshots table ──────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS creative_share_snapshots (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token       TEXT NOT NULL UNIQUE,
      payload     JSONB NOT NULL,
      expires_at  TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_creative_share_snapshots_token
    ON creative_share_snapshots (token)
  `;
}
