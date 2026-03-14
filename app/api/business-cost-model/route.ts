import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import {
  getBusinessCostModel,
  upsertBusinessCostModel,
} from "@/lib/business-cost-model";
import { isDemoBusinessId } from "@/lib/demo-business";

interface CostModelBody {
  businessId?: string;
  cogsPercent?: number;
  shippingPercent?: number;
  feePercent?: number;
  fixedCost?: number;
}

function toSafePercent(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return null;
  return parsed;
}

function toSafeMoney(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: "businessId query parameter is required." },
      { status: 400 }
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  const costModel = await getBusinessCostModel(businessId);
  return NextResponse.json({ costModel });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as CostModelBody | null;
  const businessId = body?.businessId ?? null;
  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: "businessId is required." },
      { status: 400 }
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "collaborator",
  });
  if ("error" in access) return access.error;
  if (isDemoBusinessId(businessId)) {
    return NextResponse.json(
      { error: "forbidden", message: "Demo business cost model cannot be changed." },
      { status: 403 }
    );
  }

  const cogsPercent = toSafePercent(body?.cogsPercent);
  const shippingPercent = toSafePercent(body?.shippingPercent);
  const feePercent = toSafePercent(body?.feePercent);
  const fixedCost = toSafeMoney(body?.fixedCost);

  if (
    cogsPercent === null ||
    shippingPercent === null ||
    feePercent === null ||
    fixedCost === null
  ) {
    return NextResponse.json(
      {
        error: "invalid_payload",
        message:
          "COGS, shipping, and fee percentages must be between 0 and 1. Fixed cost must be 0 or higher.",
      },
      { status: 400 }
    );
  }

  const costModel = await upsertBusinessCostModel({
    businessId,
    cogsPercent,
    shippingPercent,
    feePercent,
    fixedCost,
  });

  return NextResponse.json({ costModel });
}
