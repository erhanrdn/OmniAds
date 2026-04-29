import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { resolvePersistedCanonicalCohortAssignment } from "@/lib/creative-decision-feature-flag-store";

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId")?.trim() ?? "";
  if (!businessId) {
    return NextResponse.json(
      { error: "missing_business_id", message: "businessId is required." },
      { status: 400 },
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  const assignment = await resolvePersistedCanonicalCohortAssignment({
    businessId,
    rolloutPercent: 0,
  });

  return NextResponse.json(
    {
      businessId: assignment.businessId,
      cohort: assignment.cohort,
      source: assignment.source,
      assignedAt: assignment.assignedAt ?? null,
      killSwitchActiveAt: assignment.killSwitchActiveAt ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
