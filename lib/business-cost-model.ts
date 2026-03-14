import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

export interface BusinessCostModel {
  businessId: string;
  cogsPercent: number;
  shippingPercent: number;
  feePercent: number;
  fixedCost: number;
  updatedAt: string | null;
}

export async function getBusinessCostModel(
  businessId: string
): Promise<BusinessCostModel | null> {
  try {
    await runMigrations({ reason: "business_cost_model_read" });
    const sql = getDb();
    const rows = (await sql`
      SELECT
        business_id,
        cogs_percent,
        shipping_percent,
        fee_percent,
        COALESCE(fixed_monthly_cost, fixed_cost, 0) AS fixed_monthly_cost,
        updated_at
      FROM business_cost_models
      WHERE business_id = ${businessId}
      LIMIT 1
    `) as Array<{
      business_id: string;
      cogs_percent: number;
      shipping_percent: number;
      fee_percent: number;
      fixed_monthly_cost: number;
      updated_at: string | null;
    }>;

    const row = rows[0];
    if (!row) return null;
    return {
      businessId: row.business_id,
      cogsPercent: Number(row.cogs_percent ?? 0),
      shippingPercent: Number(row.shipping_percent ?? 0),
      feePercent: Number(row.fee_percent ?? 0),
      fixedCost: Number(row.fixed_monthly_cost ?? 0),
      updatedAt: row.updated_at,
    };
  } catch (error) {
    if (isMissingRelationError(error)) {
      return null;
    }
    throw error;
  }
}

export async function upsertBusinessCostModel(input: {
  businessId: string;
  cogsPercent: number;
  shippingPercent: number;
  feePercent: number;
  fixedCost: number;
}): Promise<BusinessCostModel> {
  await runMigrations({ reason: "business_cost_model_upsert" });
  const sql = getDb();
  const rows = (await sql`
    INSERT INTO business_cost_models (
      business_id,
      cogs_percent,
      shipping_percent,
      fee_percent,
      fixed_monthly_cost,
      fixed_cost,
      updated_at
    )
    VALUES (
      ${input.businessId},
      ${input.cogsPercent},
      ${input.shippingPercent},
      ${input.feePercent},
      ${input.fixedCost},
      ${input.fixedCost},
      now()
    )
    ON CONFLICT (business_id)
    DO UPDATE SET
      cogs_percent = EXCLUDED.cogs_percent,
      shipping_percent = EXCLUDED.shipping_percent,
      fee_percent = EXCLUDED.fee_percent,
      fixed_monthly_cost = EXCLUDED.fixed_monthly_cost,
      fixed_cost = EXCLUDED.fixed_cost,
      updated_at = now()
    RETURNING
      business_id,
      cogs_percent,
      shipping_percent,
      fee_percent,
      COALESCE(fixed_monthly_cost, fixed_cost, 0) AS fixed_monthly_cost,
      updated_at
  `) as Array<{
    business_id: string;
    cogs_percent: number;
    shipping_percent: number;
    fee_percent: number;
    fixed_monthly_cost: number;
    updated_at: string | null;
  }>;

  const row = rows[0];
  return {
    businessId: row.business_id,
    cogsPercent: Number(row.cogs_percent ?? 0),
    shippingPercent: Number(row.shipping_percent ?? 0),
    feePercent: Number(row.fee_percent ?? 0),
    fixedCost: Number(row.fixed_monthly_cost ?? 0),
    updatedAt: row.updated_at,
  };
}

function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  return (
    candidate.code === "42P01" ||
    candidate.message?.toLowerCase().includes('relation "business_cost_models" does not exist') ===
      true
  );
}
