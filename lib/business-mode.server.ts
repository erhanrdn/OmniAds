import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

const DEMO_BUSINESS_FALLBACK_ID = "11111111-1111-4111-8111-111111111111";
const CACHE_TTL_MS = 60_000;
const demoBusinessCache = new Map<string, { value: boolean; expiresAt: number }>();

export interface BusinessDataMode {
  isDemoBusiness: boolean;
  mode: "demo" | "live";
}

export async function isDemoBusiness(
  businessId: string | null | undefined
): Promise<boolean> {
  if (!businessId) return false;
  if (businessId === DEMO_BUSINESS_FALLBACK_ID) return true;

  const cached = demoBusinessCache.get(businessId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let value = false;
  try {
    await runMigrations();
    const sql = getDb();
    const rows = await sql`
      SELECT is_demo_business
      FROM businesses
      WHERE id = ${businessId}
      LIMIT 1
    `;
    const row = rows[0] as { is_demo_business?: unknown } | undefined;
    value = Boolean(row?.is_demo_business);
  } catch {
    value = businessId === DEMO_BUSINESS_FALLBACK_ID;
  }

  demoBusinessCache.set(businessId, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return value;
}

export async function resolveBusinessDataMode(
  businessId: string | null | undefined
): Promise<BusinessDataMode> {
  const demo = await isDemoBusiness(businessId);
  return {
    isDemoBusiness: demo,
    mode: demo ? "demo" : "live",
  };
}

