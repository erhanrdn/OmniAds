import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { listOwnedWorkspaces } from "@/lib/account-store";

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "auth_error", message: "Authentication required." }, { status: 401 });
  }
  const workspaces = await listOwnedWorkspaces(session.user.id);
  return NextResponse.json({ workspaces });
}
