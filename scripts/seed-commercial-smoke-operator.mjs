import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";
import {
  DEMO_BUSINESS_ID,
  ensureCoreTables,
  ensureDemoBusiness,
  getEnv,
} from "./seed-shared.mjs";
import { resolveCommercialSmokeOperatorConfig } from "./seed-commercial-smoke-operator-support.mjs";

const OPERATOR = resolveCommercialSmokeOperatorConfig(process.env);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

async function ensureCommercialTruthTables(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS business_target_packs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      target_cpa DOUBLE PRECISION,
      target_roas DOUBLE PRECISION,
      break_even_cpa DOUBLE PRECISION,
      break_even_roas DOUBLE PRECISION,
      contribution_margin_assumption DOUBLE PRECISION,
      aov_assumption DOUBLE PRECISION,
      new_customer_weight DOUBLE PRECISION,
      default_risk_posture TEXT NOT NULL DEFAULT 'balanced',
      source_label TEXT,
      updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (business_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS business_country_economics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      country_code TEXT NOT NULL,
      economics_multiplier DOUBLE PRECISION,
      margin_modifier DOUBLE PRECISION,
      serviceability TEXT NOT NULL DEFAULT 'full',
      priority_tier TEXT NOT NULL DEFAULT 'tier_2',
      scale_override TEXT NOT NULL DEFAULT 'default',
      notes TEXT,
      source_label TEXT,
      updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (business_id, country_code)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS business_promo_calendar_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL,
      title TEXT NOT NULL,
      promo_type TEXT NOT NULL DEFAULT 'sale',
      severity TEXT NOT NULL DEFAULT 'medium',
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      affected_scope TEXT,
      notes TEXT,
      source_label TEXT,
      updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (business_id, event_id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS business_operating_constraints (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      site_issue_status TEXT NOT NULL DEFAULT 'none',
      checkout_issue_status TEXT NOT NULL DEFAULT 'none',
      conversion_tracking_issue_status TEXT NOT NULL DEFAULT 'none',
      feed_issue_status TEXT NOT NULL DEFAULT 'none',
      stock_pressure_status TEXT NOT NULL DEFAULT 'healthy',
      landing_page_concern TEXT,
      merchandising_concern TEXT,
      manual_do_not_scale_reason TEXT,
      source_label TEXT,
      updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (business_id)
    )
  `;
}

async function resetCommercialTruth(sql, userId) {
  await sql`DELETE FROM business_promo_calendar_events WHERE business_id = ${DEMO_BUSINESS_ID}`;
  await sql`DELETE FROM business_country_economics WHERE business_id = ${DEMO_BUSINESS_ID}`;
  await sql`DELETE FROM business_target_packs WHERE business_id = ${DEMO_BUSINESS_ID}`;
  await sql`DELETE FROM business_operating_constraints WHERE business_id = ${DEMO_BUSINESS_ID}`;

  await sql`
    INSERT INTO business_target_packs (
      business_id,
      target_cpa,
      target_roas,
      break_even_cpa,
      break_even_roas,
      contribution_margin_assumption,
      aov_assumption,
      new_customer_weight,
      default_risk_posture,
      source_label,
      updated_by_user_id,
      updated_at
    )
    VALUES (
      ${DEMO_BUSINESS_ID},
      42,
      2.6,
      58,
      1.7,
      38,
      82,
      1,
      'balanced',
      'smoke_seed_reset',
      ${userId},
      now()
    )
  `;

  await sql`
    INSERT INTO business_country_economics (
      business_id,
      country_code,
      economics_multiplier,
      margin_modifier,
      serviceability,
      priority_tier,
      scale_override,
      notes,
      source_label,
      updated_by_user_id,
      updated_at
    )
    VALUES (
      ${DEMO_BUSINESS_ID},
      'US',
      1,
      0,
      'full',
      'tier_1',
      'default',
      'Baseline smoke GEO row',
      'smoke_seed_reset',
      ${userId},
      now()
    )
  `;

  await sql`
    INSERT INTO business_operating_constraints (
      business_id,
      site_issue_status,
      checkout_issue_status,
      conversion_tracking_issue_status,
      feed_issue_status,
      stock_pressure_status,
      source_label,
      updated_by_user_id,
      updated_at
    )
    VALUES (
      ${DEMO_BUSINESS_ID},
      'none',
      'none',
      'none',
      'none',
      'healthy',
      'smoke_seed_reset',
      ${userId},
      now()
    )
  `;
}

async function main() {
  const databaseUrl = getEnv("DATABASE_URL");
  const sql = neon(databaseUrl);

  await ensureCoreTables(sql);
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      active_business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await ensureDemoBusiness(sql);
  await ensureCommercialTruthTables(sql);

  const passwordHash = await bcrypt.hash(OPERATOR.password, 12);
  const operatorRows = await sql`
    INSERT INTO users (name, email, password_hash)
    VALUES (${OPERATOR.name}, ${OPERATOR.email}, ${passwordHash})
    ON CONFLICT (email)
    DO UPDATE SET
      name = EXCLUDED.name,
      password_hash = EXCLUDED.password_hash
    RETURNING id, email
  `;
  const operator = operatorRows[0];

  await sql`
    INSERT INTO memberships (user_id, business_id, role, status)
    VALUES (${operator.id}, ${DEMO_BUSINESS_ID}, 'collaborator', 'active')
    ON CONFLICT (user_id, business_id)
    DO UPDATE SET role = 'collaborator', status = 'active'
  `;

  await sql`
    UPDATE sessions
    SET active_business_id = ${DEMO_BUSINESS_ID}
    WHERE user_id = ${operator.id}
  `;

  await resetCommercialTruth(sql, operator.id);

  console.log(
    JSON.stringify(
      {
        ok: true,
        operator: {
          email: OPERATOR.email,
          password: OPERATOR.password,
          passwordSource: OPERATOR.passwordSource,
          role: "collaborator",
        },
        loginUrl: `${APP_URL.replace(/\/$/, "")}/login`,
        businessId: DEMO_BUSINESS_ID,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[seed-commercial-smoke-operator] failed", error);
  process.exit(1);
});
