import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { resolveBusinessContext } from "@/lib/business-context";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const { businesses, activeBusinessId } = await resolveBusinessContext(session);

  return NextResponse.json({
    authenticated: true,
    user: session.user,
    businesses,
    activeBusinessId,
  });
}
