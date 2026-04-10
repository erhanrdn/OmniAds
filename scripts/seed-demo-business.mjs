import { neon } from "@neondatabase/serverless";
import {
  ALLOWED_DEMO_USERS,
  DEMO_BUSINESS_ID,
  DEMO_OWNER_ID,
  ensureCoreTables,
  getEnv,
} from "./seed-shared.mjs";

async function main() {
  const databaseUrl = getEnv("DATABASE_URL");
  const sql = neon(databaseUrl);

  await ensureCoreTables(sql);

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
    const role =
      email === "shopify-review@adsecute.com" ||
      email === "commercial-smoke@adsecute.com"
        ? "collaborator"
        : "admin";
    await sql`
      INSERT INTO memberships (user_id, business_id, role, status)
      VALUES (${row.id}, ${DEMO_BUSINESS_ID}, ${role}, 'active')
      ON CONFLICT (user_id, business_id)
      DO UPDATE SET role = EXCLUDED.role, status = 'active'
    `;
  }

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
    DELETE FROM invites
    WHERE business_id = ${DEMO_BUSINESS_ID}
  `;

  console.log(
    JSON.stringify(
      {
        ok: true,
        demoBusinessId: DEMO_BUSINESS_ID,
        businessName: "Adsecute Demo",
        ownerAssigned: DEMO_OWNER_ID,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[seed-demo-business] failed", error);
  process.exit(1);
});
