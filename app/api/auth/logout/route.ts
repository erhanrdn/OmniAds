import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, destroySessionByRequest } from "@/lib/auth";
import { logServerAuthEvent } from "@/lib/auth-diagnostics";

export async function POST(request: NextRequest) {
  logServerAuthEvent("logout_started", {
    hasCookie: Boolean(request.cookies.get("omniads_session")?.value),
  });
  await destroySessionByRequest(request);
  const response = NextResponse.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store, max-age=0", Vary: "Cookie" } }
  );
  clearSessionCookie(response);
  logServerAuthEvent("logout_completed", {});
  return response;
}
