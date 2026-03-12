import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, setSessionActiveBusiness } from "@/lib/auth";
import { createBusinessWithAdminMembership } from "@/lib/account-store";
import { listUserBusinesses } from "@/lib/access";
import { isReviewerEmail, scopeBusinessesForUser } from "@/lib/reviewer-access";

interface CreateBusinessBody {
  name?: string;
  timezone?: string;
  currency?: string;
}

export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "auth_error", message: "Authentication required." }, { status: 401 });
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
    businesses,
    activeBusinessId,
  });
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "auth_error", message: "Authentication required." }, { status: 401 });
  }
  if (isReviewerEmail(session.user.email)) {
    return NextResponse.json(
      { error: "forbidden", message: "Reviewer accounts cannot create businesses." },
      { status: 403 }
    );
  }
  const body = (await request.json().catch(() => null)) as CreateBusinessBody | null;
  const name = body?.name?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ error: "invalid_payload", message: "Business name is required." }, { status: 400 });
  }
  const business = await createBusinessWithAdminMembership({
    name,
    ownerId: session.user.id,
    timezone: body?.timezone?.trim() || "UTC",
    currency: body?.currency?.trim().toUpperCase() || "USD",
  });
  await setSessionActiveBusiness(session.sessionId, business.id);
  return NextResponse.json({ business }, { status: 201 });
}
