import { getDb } from "@/lib/db";
import { resolveBusinessReferenceIds } from "@/lib/provider-account-reference-store";
import type { PlanId } from "@/lib/pricing/plans";

export interface DiscountCodeRow {
  id: string;
  code: string;
  description: string | null;
  type: "percent" | "fixed";
  value: number;
  max_uses: number | null;
  uses: number;
  applies_to: PlanId[];
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

export interface RedemptionRow {
  id: string;
  code_id: string;
  code: string;
  user_id: string;
  user_name: string;
  user_email: string;
  business_id: string | null;
  plan_id: string;
  amount_off: number;
  redeemed_at: string;
}

export type DiscountValidation =
  | { valid: true; code: DiscountCodeRow; discountedPrice: number; amountOff: number }
  | { valid: false; reason: string };

export async function listDiscountCodes(): Promise<DiscountCodeRow[]> {
  const sql = getDb();
  return (await sql`
    SELECT id, code, description, type, value, max_uses, uses,
           applies_to, valid_from, valid_until, is_active, created_at, created_by
    FROM discount_codes
    ORDER BY created_at DESC
  `) as DiscountCodeRow[];
}

export async function getDiscountCode(id: string): Promise<DiscountCodeRow | null> {
  const sql = getDb();
  const rows = (await sql`
    SELECT id, code, description, type, value, max_uses, uses,
           applies_to, valid_from, valid_until, is_active, created_at, created_by
    FROM discount_codes WHERE id = ${id} LIMIT 1
  `) as DiscountCodeRow[];
  return rows[0] ?? null;
}

export async function createDiscountCode(input: {
  code: string;
  description?: string;
  type: "percent" | "fixed";
  value: number;
  maxUses?: number;
  appliesTo: PlanId[];
  validFrom?: string;
  validUntil?: string;
  createdBy: string;
}): Promise<DiscountCodeRow> {
  const sql = getDb();
  const rows = (await sql`
    INSERT INTO discount_codes
      (code, description, type, value, max_uses, applies_to, valid_from, valid_until, created_by)
    VALUES (
      ${input.code.trim().toUpperCase()},
      ${input.description ?? null},
      ${input.type},
      ${input.value},
      ${input.maxUses ?? null},
      ${input.appliesTo},
      ${input.validFrom ?? null},
      ${input.validUntil ?? null},
      ${input.createdBy}
    )
    RETURNING id, code, description, type, value, max_uses, uses,
              applies_to, valid_from, valid_until, is_active, created_at, created_by
  `) as DiscountCodeRow[];
  return rows[0] as DiscountCodeRow;
}

export async function updateDiscountCode(
  id: string,
  patch: Partial<{
    description: string;
    maxUses: number | null;
    appliesTo: PlanId[];
    validFrom: string | null;
    validUntil: string | null;
    isActive: boolean;
  }>
): Promise<DiscountCodeRow | null> {
  const sql = getDb();
  const rows = (await sql`
    UPDATE discount_codes SET
      description = COALESCE(${patch.description ?? null}, description),
      max_uses    = ${patch.maxUses !== undefined ? patch.maxUses : null}::int,
      applies_to  = COALESCE(${patch.appliesTo ?? null}, applies_to),
      valid_from  = ${patch.validFrom !== undefined ? patch.validFrom : null},
      valid_until = ${patch.validUntil !== undefined ? patch.validUntil : null},
      is_active   = COALESCE(${patch.isActive ?? null}, is_active)
    WHERE id = ${id}
    RETURNING id, code, description, type, value, max_uses, uses,
              applies_to, valid_from, valid_until, is_active, created_at, created_by
  `) as DiscountCodeRow[];
  return rows[0] ?? null;
}

export async function deleteDiscountCode(id: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM discount_codes WHERE id = ${id}`;
}

export async function validateDiscountCode(
  code: string,
  planId: PlanId,
  originalPrice: number
): Promise<DiscountValidation> {
  const sql = getDb();
  const rows = (await sql`
    SELECT id, code, description, type, value, max_uses, uses,
           applies_to, valid_from, valid_until, is_active, created_at, created_by
    FROM discount_codes
    WHERE lower(code) = lower(${code})
    LIMIT 1
  `) as DiscountCodeRow[];

  const dc = rows[0];
  if (!dc) return { valid: false, reason: "Geçersiz indirim kodu." };
  if (!dc.is_active) return { valid: false, reason: "Bu indirim kodu aktif değil." };

  const now = new Date();
  if (dc.valid_from && new Date(dc.valid_from) > now)
    return { valid: false, reason: "Bu indirim kodu henüz geçerli değil." };
  if (dc.valid_until && new Date(dc.valid_until) < now)
    return { valid: false, reason: "Bu indirim kodunun süresi dolmuş." };
  if (dc.max_uses !== null && dc.uses >= dc.max_uses)
    return { valid: false, reason: "Bu indirim kodunun kullanım limiti dolmuş." };
  if (dc.applies_to.length > 0 && !dc.applies_to.includes(planId))
    return { valid: false, reason: `Bu indirim kodu ${planId} planı için geçerli değil.` };

  const amountOff =
    dc.type === "percent"
      ? Math.round((originalPrice * Number(dc.value)) / 100 * 100) / 100
      : Math.min(Number(dc.value), originalPrice);

  return {
    valid: true,
    code: dc,
    amountOff,
    discountedPrice: Math.max(0, originalPrice - amountOff),
  };
}

export async function redeemDiscountCode(input: {
  codeId: string;
  userId: string;
  businessId: string | null;
  planId: string;
  amountOff: number;
}): Promise<void> {
  const sql = getDb();
  const businessRefId = input.businessId
    ? (await resolveBusinessReferenceIds([input.businessId])).get(input.businessId) ??
      null
    : null;
  await sql`
    INSERT INTO discount_redemptions (
      code_id,
      user_id,
      business_id,
      business_ref_id,
      plan_id,
      amount_off
    )
    VALUES (
      ${input.codeId},
      ${input.userId},
      ${input.businessId},
      ${businessRefId},
      ${input.planId},
      ${input.amountOff}
    )
  `;
  await sql`UPDATE discount_codes SET uses = uses + 1 WHERE id = ${input.codeId}`;
}

export async function getRedemptionsForCode(codeId: string): Promise<RedemptionRow[]> {
  const sql = getDb();
  return (await sql`
    SELECT dr.id, dr.code_id, dc.code, dr.user_id, u.name AS user_name, u.email AS user_email,
           dr.business_id, dr.plan_id, dr.amount_off, dr.redeemed_at
    FROM discount_redemptions dr
    JOIN discount_codes dc ON dc.id = dr.code_id
    JOIN users u ON u.id = dr.user_id
    WHERE dr.code_id = ${codeId}
    ORDER BY dr.redeemed_at DESC
  `) as RedemptionRow[];
}
