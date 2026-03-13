import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, setSessionActiveBusiness } from "@/lib/auth";
import { findMembership } from "@/lib/access";
import { logServerAuthEvent } from "@/lib/auth-diagnostics";
import { canReviewerAccessBusiness } from "@/lib/reviewer-access";

interface SwitchBusinessBody {
  businessId?: string;
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    logServerAuthEvent("switch_business_rejected_unauthenticated", {});
    return NextResponse.json(
      { error: "auth_error", message: "Authentication required." },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => null)) as SwitchBusinessBody | null;
  const businessId = body?.businessId ?? "";
  if (!businessId) {
    logServerAuthEvent("switch_business_rejected_invalid_payload", {
      userId: session.user.id,
    });
    return NextResponse.json(
      { error: "invalid_payload", message: "businessId is required." },
      { status: 400 }
    );
  }

  if (!canReviewerAccessBusiness(session.user.email, businessId)) {
    logServerAuthEvent("switch_business_rejected_reviewer_scope", {
      userId: session.user.id,
      email: session.user.email,
      businessId,
    });
    return NextResponse.json(
      { error: "forbidden", message: "No access to this business." },
      { status: 403 }
    );
  }

  const membership = await findMembership({ userId: session.user.id, businessId });
  if (!membership || membership.status !== "active") {
    logServerAuthEvent("switch_business_rejected_membership", {
      userId: session.user.id,
      email: session.user.email,
      businessId,
    });
    return NextResponse.json(
      { error: "forbidden", message: "No access to this business." },
      { status: 403 }
    );
  }

  await setSessionActiveBusiness(session.sessionId, businessId);
  logServerAuthEvent("switch_business_succeeded", {
    sessionId: session.sessionId,
    userId: session.user.id,
    email: session.user.email,
    activeBusinessId: businessId,
  });
  return NextResponse.json(
    { status: "ok", activeBusinessId: businessId },
    { headers: { "Cache-Control": "no-store, max-age=0", Vary: "Cookie" } }
  );
}
