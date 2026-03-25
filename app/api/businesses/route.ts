import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, setSessionActiveBusiness } from "@/lib/auth";
import { createBusinessWithAdminMembership } from "@/lib/account-store";
import { resolveBusinessContext } from "@/lib/business-context";
import { isReviewerEmail } from "@/lib/reviewer-access";
import { resolveRequestLanguage } from "@/lib/request-language";

interface CreateBusinessBody {
  name?: string;
  timezone?: string;
  currency?: string;
}

export async function GET(request: NextRequest) {
  const language = await resolveRequestLanguage(request);
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "auth_error", message: language === "tr" ? "Kimlik doğrulamasi gerekli." : "Authentication required." }, { status: 401 });
  }
  const { businesses, activeBusinessId } = await resolveBusinessContext(session);
  return NextResponse.json({
    businesses,
    activeBusinessId,
  });
}

export async function POST(request: NextRequest) {
  const language = await resolveRequestLanguage(request);
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "auth_error", message: language === "tr" ? "Kimlik doğrulamasi gerekli." : "Authentication required." }, { status: 401 });
  }
  if (isReviewerEmail(session.user.email)) {
    return NextResponse.json(
      { error: "forbidden", message: language === "tr" ? "Reviewer hesaplari business oluşturamaz." : "Reviewer accounts cannot create businesses." },
      { status: 403 }
    );
  }
  const body = (await request.json().catch(() => null)) as CreateBusinessBody | null;
  const name = body?.name?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ error: "invalid_payload", message: language === "tr" ? "Business adi zorunludur." : "Business name is required." }, { status: 400 });
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
