import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { runDailyInsightForBusiness } from "@/lib/ai/run-daily-insights";

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as
    | { businessId?: string }
    | null;
  const businessId = payload?.businessId ?? null;

  const access = await requireBusinessAccess({ request, businessId });
  if ("error" in access) return access.error;
  const resolvedBusinessId = access.membership.businessId;

  const result = await runDailyInsightForBusiness({ businessId: resolvedBusinessId });

  if (result.status === "failed") {
    return NextResponse.json(
      {
        ok: false,
        error: "ai_generation_failed",
        message: result.error ?? "AI generation failed. Please try again.",
      },
      { status: 500 }
    );
  }

  if (result.status === "skipped") {
    return NextResponse.json(
      {
        ok: false,
        error: "ai_generation_skipped",
        message: result.error ?? "No data available to generate AI brief.",
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, result });
}
