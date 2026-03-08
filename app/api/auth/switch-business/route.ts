import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, setSessionActiveBusiness } from "@/lib/auth";
import { findMembership } from "@/lib/access";

interface SwitchBusinessBody {
  businessId?: string;
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { error: "auth_error", message: "Authentication required." },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => null)) as SwitchBusinessBody | null;
  const businessId = body?.businessId ?? "";
  if (!businessId) {
    return NextResponse.json(
      { error: "invalid_payload", message: "businessId is required." },
      { status: 400 }
    );
  }

  const membership = await findMembership({ userId: session.user.id, businessId });
  if (!membership || membership.status !== "active") {
    return NextResponse.json(
      { error: "forbidden", message: "No access to this business." },
      { status: 403 }
    );
  }

  await setSessionActiveBusiness(session.sessionId, businessId);
  return NextResponse.json({ status: "ok", activeBusinessId: businessId });
}

