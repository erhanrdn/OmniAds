import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";

const DEMO_BUSINESS_ID = "11111111-1111-4111-8111-111111111111";
const DEMO_OWNER_ID = "22222222-2222-4222-8222-222222222222";

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

async function main() {
  const databaseUrl = getEnv("DATABASE_URL");
  const sql = neon(databaseUrl);

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

  const users = await sql`SELECT id FROM users`;
  for (const user of users) {
    await sql`
      INSERT INTO memberships (user_id, business_id, role, status)
      VALUES (${user.id}, ${DEMO_BUSINESS_ID}, 'admin', 'active')
      ON CONFLICT (user_id, business_id)
      DO UPDATE SET role = 'admin', status = 'active'
    `;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        demoBusinessId: DEMO_BUSINESS_ID,
        businessName: "Adsecute Demo",
        usersAssigned: users.length,
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
