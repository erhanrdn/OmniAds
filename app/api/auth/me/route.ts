import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { listUserBusinesses } from "@/lib/access";
import { scopeBusinessesForUser } from "@/lib/reviewer-access";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const businesses = scopeBusinessesForUser(
    session.user.email,
    await listUserBusinesses(session.user.id)
  );
  const activeBusinessId =
    session.activeBusinessId && businesses.some((b) => b.id === session.activeBusinessId)
      ? session.activeBusinessId
      : businesses.find((b) => b.membershipStatus === "active")?.id ?? null;

  return NextResponse.json({
    authenticated: true,
    user: session.user,
    businesses,
    activeBusinessId,
  });
}
