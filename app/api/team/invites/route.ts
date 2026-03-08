import { NextRequest, NextResponse } from "next/server";
import { MembershipRole } from "@/lib/auth";
import { createInvite, listInvitesByBusiness } from "@/lib/account-store";
import { requireBusinessAccess } from "@/lib/access";

interface InviteBody {
  businessId?: string;
  emails?: string[];
  role?: MembershipRole;
}

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  const access = await requireBusinessAccess({ request, businessId, minRole: "guest" });
  if ("error" in access) return access.error;
  const invites = await listInvitesByBusiness(businessId!);
  return NextResponse.json({ invites });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as InviteBody | null;
  const businessId = body?.businessId ?? null;
  const role = body?.role ?? "collaborator";
  const emails = Array.isArray(body?.emails)
    ? body!.emails
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    : [];
  if (emails.length === 0) {
    return NextResponse.json({ error: "invalid_payload", message: "At least one email is required." }, { status: 400 });
  }
  const access = await requireBusinessAccess({ request, businessId, minRole: "admin" });
  if ("error" in access) return access.error;

  const created = [];
  for (const email of emails) {
    const invite = await createInvite({ email, businessId: businessId!, role });
    created.push({
      ...invite,
      email,
      role,
      inviteUrl: `/invite/${invite.token}`,
    });
  }
  return NextResponse.json({ invites: created }, { status: 201 });
}

