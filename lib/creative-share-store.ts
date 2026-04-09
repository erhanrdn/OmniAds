import { randomUUID } from "crypto";
import type { SharePayload } from "@/components/creatives/shareCreativeTypes";
import { getDb } from "@/lib/db";
import { assertDbSchemaReady, getDbSchemaReadiness } from "@/lib/db-schema-readiness";

async function ensureShareTable() {
  await assertDbSchemaReady({
    tables: ["creative_share_snapshots"],
    context: "creative_share_store",
  });
}

export async function createCreativeShareSnapshot(
  payload: Omit<SharePayload, "token" | "createdAt">
): Promise<{ token: string; payload: SharePayload }> {
  await ensureShareTable();
  const sql = getDb();
  const token = randomUUID().replace(/-/g, "");
  const snapshot: SharePayload = {
    ...payload,
    token,
    createdAt: new Date().toISOString(),
  };
  await sql`
    INSERT INTO creative_share_snapshots (token, payload, expires_at)
    VALUES (${token}, ${JSON.stringify(snapshot)}::jsonb, ${snapshot.expiresAt})
  `;

  return { token, payload: snapshot };
}

export async function getCreativeShareSnapshot(token: string): Promise<SharePayload | null> {
  const readiness = await getDbSchemaReadiness({
    tables: ["creative_share_snapshots"],
  });
  if (!readiness.ready) {
    return null;
  }
  const sql = getDb();
  const rows = (await sql`
    SELECT payload, expires_at
    FROM creative_share_snapshots
    WHERE token = ${token}
    LIMIT 1
  `) as Array<{ payload?: unknown; expires_at?: string }>;
  const row = rows[0];
  if (!row?.payload || !row.expires_at) return null;

  const expires = new Date(row.expires_at).getTime();
  if (Number.isFinite(expires) && expires < Date.now()) {
    return null;
  }

  if (typeof row.payload === "string") {
    try {
      return JSON.parse(row.payload) as SharePayload;
    } catch {
      return null;
    }
  }
  return row.payload as SharePayload;
}
