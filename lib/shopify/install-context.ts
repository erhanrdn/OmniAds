import crypto from "crypto";
import { getDb } from "@/lib/db";
import { assertDbSchemaReady, getDbSchemaReadiness } from "@/lib/db-schema-readiness";
import { sanitizeNextPath } from "@/lib/auth-routing";

export interface ShopifyInstallContextRow {
  id: string;
  token: string;
  shop_domain: string;
  shop_name: string | null;
  access_token: string;
  scopes: string | null;
  metadata: Record<string, unknown>;
  return_to: string | null;
  session_id: string | null;
  user_id: string | null;
  preferred_business_id: string | null;
  created_at: string;
  expires_at: string;
}

function buildExpiryDate() {
  return new Date(Date.now() + 30 * 60 * 1000);
}

function sanitizeUuid(value: string | null | undefined) {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export async function createShopifyInstallContext(input: {
  shopDomain: string;
  shopName?: string | null;
  accessToken: string;
  scopes?: string | null;
  metadata?: Record<string, unknown>;
  returnTo?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  preferredBusinessId?: string | null;
}): Promise<ShopifyInstallContextRow> {
  await assertDbSchemaReady({
    tables: ["shopify_install_contexts"],
    context: "shopify_install_context_create",
  });
  const sql = getDb();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = buildExpiryDate().toISOString();
  const metadataJson = JSON.stringify(input.metadata ?? {});

  const rows = (await sql`
    INSERT INTO shopify_install_contexts (
      token,
      shop_domain,
      shop_name,
      access_token,
      scopes,
      metadata,
      return_to,
      session_id,
      user_id,
      preferred_business_id,
      expires_at
    )
    VALUES (
      ${token},
      ${input.shopDomain},
      ${input.shopName ?? null},
      ${input.accessToken},
      ${input.scopes ?? null},
      ${metadataJson}::jsonb,
      ${sanitizeNextPath(input.returnTo) ?? null},
      ${input.sessionId ?? null},
      ${input.userId ?? null},
      ${sanitizeUuid(input.preferredBusinessId) ?? null},
      ${expiresAt}
    )
    RETURNING *
  `) as ShopifyInstallContextRow[];

  return rows[0] as ShopifyInstallContextRow;
}

export async function getShopifyInstallContext(
  token: string,
): Promise<ShopifyInstallContextRow | null> {
  const readiness = await getDbSchemaReadiness({
    tables: ["shopify_install_contexts"],
  });
  if (!readiness.ready) {
    return null;
  }
  const sql = getDb();
  await sql`DELETE FROM shopify_install_contexts WHERE expires_at <= now()`;
  const rows = (await sql`
    SELECT *
    FROM shopify_install_contexts
    WHERE token = ${token}
      AND expires_at > now()
    LIMIT 1
  `) as ShopifyInstallContextRow[];
  return rows[0] ?? null;
}

export async function consumeShopifyInstallContext(
  token: string,
): Promise<ShopifyInstallContextRow | null> {
  const context = await getShopifyInstallContext(token);
  if (!context) return null;

  const sql = getDb();
  await sql`DELETE FROM shopify_install_contexts WHERE token = ${token}`;
  return context;
}

export async function getLatestShopifyInstallContextForActor(input: {
  sessionId?: string | null;
  userId?: string | null;
}): Promise<ShopifyInstallContextRow | null> {
  const sessionId = sanitizeUuid(input.sessionId);
  const userId = sanitizeUuid(input.userId);
  if (!sessionId && !userId) return null;

  const readiness = await getDbSchemaReadiness({
    tables: ["shopify_install_contexts"],
  });
  if (!readiness.ready) {
    return null;
  }
  const sql = getDb();
  await sql`DELETE FROM shopify_install_contexts WHERE expires_at <= now()`;

  const rows = (await sql`
    SELECT *
    FROM shopify_install_contexts
    WHERE expires_at > now()
      AND (
        (${sessionId}::uuid IS NOT NULL AND session_id = ${sessionId}::uuid)
        OR (${userId}::uuid IS NOT NULL AND user_id = ${userId}::uuid)
      )
    ORDER BY created_at DESC
    LIMIT 1
  `) as ShopifyInstallContextRow[];

  return rows[0] ?? null;
}
