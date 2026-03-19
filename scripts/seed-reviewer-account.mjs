import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";
import {
  ALLOWED_DEMO_USERS,
  DEMO_BUSINESS_ID,
  DEMO_OWNER_ID,
  ensureCoreTables,
  ensureDemoBusiness,
  getEnv,
} from "./seed-shared.mjs";
const REVIEWER_EMAIL = (process.env.SHOPIFY_REVIEWER_EMAIL ?? "shopify-review@adsecute.com")
  .trim()
  .toLowerCase();
const REVIEWER_NAME = process.env.SHOPIFY_REVIEWER_NAME ?? "Shopify App Reviewer";
const REVIEWER_PASSWORD = process.env.SHOPIFY_REVIEWER_PASSWORD ?? "AdsecuteReview!2026";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

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
