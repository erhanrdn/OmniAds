import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { logServerAuthEvent } from "@/lib/auth-diagnostics";
import { resolveBusinessContext } from "@/lib/business-context";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    logServerAuthEvent("me_unauthenticated", {
      hasCookie: Boolean(request.cookies.get("omniads_session")?.value),
    });
    return NextResponse.json(
      { authenticated: false },
      { status: 401, headers: { "Cache-Control": "no-store, max-age=0", Vary: "Cookie" } }
    );
  }

  const { businesses, activeBusinessId } = await resolveBusinessContext(session);
  logServerAuthEvent("me_authenticated", {
    sessionId: session.sessionId,
    userId: session.user.id,
    email: session.user.email,
    membershipCount: businesses.length,
    activeBusinessId,
  });

  return NextResponse.json({
    authenticated: true,
    user: session.user,
    businesses,
    activeBusinessId,
  }, { headers: { "Cache-Control": "no-store, max-age=0", Vary: "Cookie" } });
}
