import { getDb } from "@/lib/db";

/**
 * Run all migrations in order.
 * Each migration is idempotent (IF NOT EXISTS).
 */
export async function runMigrations() {
  const sql = getDb();

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
}
