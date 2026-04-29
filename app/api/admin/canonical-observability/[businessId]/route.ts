import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { computeCanonicalObservabilitySummary } from "@/lib/creative-canonical-observability";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ businessId: string }> },
) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { businessId } = await context.params;
    if (!businessId) {
      return NextResponse.json(
        { error: "missing_business_id", message: "businessId is required." },
        { status: 400 },
      );
    }

    const summary = await computeCanonicalObservabilitySummary(businessId);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[admin/canonical-observability GET]", error);
    return NextResponse.json(
      { error: "internal_error", message: String(error) },
      { status: 500 },
    );
  }
}
