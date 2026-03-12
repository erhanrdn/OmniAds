import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";

const DEMO_BUSINESS_ID = "11111111-1111-4111-8111-111111111111";
const DEMO_OWNER_ID = "22222222-2222-4222-8222-222222222222";
const ALLOWED_DEMO_USERS = [
  "demo-owner@adsecute.local",
  "shopify-review@adsecute.com",
  "emrahbilaloglu@gmail.com",
];
const REVIEWER_EMAIL = (process.env.SHOPIFY_REVIEWER_EMAIL ?? "shopify-review@adsecute.com")
  .trim()
  .toLowerCase();
const REVIEWER_NAME = process.env.SHOPIFY_REVIEWER_NAME ?? "Shopify App Reviewer";
const REVIEWER_PASSWORD = process.env.SHOPIFY_REVIEWER_PASSWORD ?? "AdsecuteReview!2026";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function getEnv(name) {
  const value = process.env[name];
  if (value) {
    return value.replace(/^"|"$/g, "");
  }

  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    const match = content.match(new RegExp(`^${name}=(.*)$`, "m"));
    if (match?.[1]) {
      return match[1].trim().replace(/^"|"$/g, "");
    }
  }
  throw new Error(`${name} is required`);
}

async function ensureCoreTables(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      avatar TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS businesses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      timezone TEXT NOT NULL DEFAULT 'UTC',
      currency TEXT NOT NULL DEFAULT 'USD',
      is_demo_business BOOLEAN NOT NULL DEFAULT FALSE,
      industry TEXT,
      platform TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS is_demo_business BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS industry TEXT`;
  await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS platform TEXT`;
  await sql`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb`;

  await sql`
    CREATE TABLE IF NOT EXISTS memberships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('admin', 'collaborator', 'guest')),
      status TEXT NOT NULL CHECK (status IN ('active', 'invited', 'pending')),
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, business_id)
    )
  `;

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
}

async function ensureDemoBusiness(sql) {
  await sql`
    INSERT INTO users (id, name, email, password_hash)
    VALUES (${DEMO_OWNER_ID}, 'Adsecute Demo Owner', 'demo-owner@adsecute.local', 'demo-seeded-no-login')
    ON CONFLICT (id)
    DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email
  `;

  await sql`
    INSERT INTO businesses (
      id,
      name,
      owner_id,
      timezone,
      currency,
      is_demo_business,
      industry,
      platform,
      metadata
    ) VALUES (
      ${DEMO_BUSINESS_ID},
      'Adsecute Demo',
      ${DEMO_OWNER_ID},
      'America/Los_Angeles',
      'USD',
      TRUE,
      'ecommerce',
      'shopify',
      ${JSON.stringify({
        storeName: "UrbanTrail",
        category: "Outdoor & Travel Gear",
        seededAt: new Date().toISOString(),
      })}::jsonb
    )
    ON CONFLICT (id)
    DO UPDATE SET
      name = EXCLUDED.name,
      timezone = EXCLUDED.timezone,
      currency = EXCLUDED.currency,
      is_demo_business = TRUE,
      industry = EXCLUDED.industry,
      platform = EXCLUDED.platform,
      metadata = businesses.metadata || EXCLUDED.metadata
  `;

  await sql`
    INSERT INTO memberships (user_id, business_id, role, status)
    VALUES (${DEMO_OWNER_ID}, ${DEMO_BUSINESS_ID}, 'admin', 'active')
    ON CONFLICT (user_id, business_id)
    DO UPDATE SET role = 'admin', status = 'active'
  `;

  const allowedRows = await sql`
    SELECT id, email
    FROM users
    WHERE lower(email) = ANY(${ALLOWED_DEMO_USERS.map((email) => email.toLowerCase())})
  `;

  for (const row of allowedRows) {
    const email = String(row.email).toLowerCase();
    const role = email === "shopify-review@adsecute.com" ? "collaborator" : "admin";
    await sql`
      INSERT INTO memberships (user_id, business_id, role, status)
      VALUES (${row.id}, ${DEMO_BUSINESS_ID}, ${role}, 'active')
      ON CONFLICT (user_id, business_id)
      DO UPDATE SET role = EXCLUDED.role, status = 'active'
    `;
  }

  await sql`
    DELETE FROM invites
    WHERE business_id = ${DEMO_BUSINESS_ID}
  `;
}

async function main() {
  const databaseUrl = getEnv("DATABASE_URL");
  const sql = neon(databaseUrl);

  await ensureCoreTables(sql);
  await ensureDemoBusiness(sql);

  const passwordHash = await bcrypt.hash(REVIEWER_PASSWORD, 12);
  const reviewerRows = await sql`
    INSERT INTO users (name, email, password_hash)
    VALUES (${REVIEWER_NAME}, ${REVIEWER_EMAIL}, ${passwordHash})
    ON CONFLICT (email)
    DO UPDATE SET
      name = EXCLUDED.name,
      password_hash = EXCLUDED.password_hash
    RETURNING id, email
  `;
  const reviewer = reviewerRows[0];

  await sql`
    DELETE FROM memberships
    WHERE user_id = ${reviewer.id}
      AND business_id <> ${DEMO_BUSINESS_ID}
  `;

  await sql`
    INSERT INTO memberships (user_id, business_id, role, status)
    VALUES (${reviewer.id}, ${DEMO_BUSINESS_ID}, 'collaborator', 'active')
    ON CONFLICT (user_id, business_id)
    DO UPDATE SET role = 'collaborator', status = 'active'
  `;

  await sql`
    DELETE FROM memberships
    WHERE business_id = ${DEMO_BUSINESS_ID}
      AND user_id NOT IN (
        SELECT id
        FROM users
        WHERE lower(email) = ANY(${ALLOWED_DEMO_USERS.map((email) => email.toLowerCase())})
      )
  `;

  await sql`
    UPDATE sessions
    SET active_business_id = ${DEMO_BUSINESS_ID}
    WHERE user_id = ${reviewer.id}
  `;

  const accessRows = await sql`
    SELECT b.id, b.name
    FROM memberships m
    JOIN businesses b ON b.id = m.business_id
    WHERE m.user_id = ${reviewer.id}
      AND m.status = 'active'
    ORDER BY b.created_at ASC
  `;

  console.log(
    JSON.stringify(
      {
        ok: true,
        reviewer: {
          email: REVIEWER_EMAIL,
          password: REVIEWER_PASSWORD,
          role: "collaborator",
          emailVerified: true,
        },
        loginUrl: `${APP_URL.replace(/\/$/, "")}/login`,
        accessibleBusinesses: accessRows,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[seed-reviewer-account] failed", error);
  process.exit(1);
});
