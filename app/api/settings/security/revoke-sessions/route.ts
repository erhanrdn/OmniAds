import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, getSessionFromRequest } from "@/lib/auth";
import { revokeAllUserSessions } from "@/lib/account-store";

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "auth_error", message: "Authentication required." }, { status: 401 });
  }

  await revokeAllUserSessions(session.user.id);
  const response = NextResponse.json({ status: "ok" });
  clearSessionCookie(response);
  return response;
}
