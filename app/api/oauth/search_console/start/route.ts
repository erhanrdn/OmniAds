import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const businessId = searchParams.get("businessId");

  if (!businessId) {
    return NextResponse.json(
      { error: "businessId query parameter is required." },
      { status: 400 },
    );
  }

  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "collaborator",
  });
  if ("error" in access) return access.error;
  const target = new URL("/api/oauth/google/start", request.nextUrl.origin);
  target.searchParams.set("businessId", businessId);
  target.searchParams.set("provider", "search_console");
  return NextResponse.redirect(target.toString());
}
