import { NextRequest, NextResponse } from "next/server";
import { MembershipRole } from "@/lib/auth";
import { listBusinessMembers, removeMember, updateMemberRole } from "@/lib/account-store";
import { requireBusinessAccess } from "@/lib/access";

interface UpdateMemberBody {
  businessId?: string;
  membershipId?: string;
  role?: MembershipRole;
}

interface RemoveMemberBody {
  businessId?: string;
  membershipId?: string;
}

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  const access = await requireBusinessAccess({ request, businessId, minRole: "guest" });
  if ("error" in access) return access.error;
  const members = await listBusinessMembers(businessId!);
  return NextResponse.json({ members });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as UpdateMemberBody | null;
  const businessId = body?.businessId ?? null;
  const membershipId = body?.membershipId ?? "";
  const role = body?.role;
  if (!membershipId || !role) {
    return NextResponse.json({ error: "invalid_payload", message: "membershipId and role are required." }, { status: 400 });
  }
  const access = await requireBusinessAccess({ request, businessId, minRole: "admin" });
  if ("error" in access) return access.error;
  await updateMemberRole({ membershipId, businessId: businessId!, role });
  return NextResponse.json({ status: "ok" });
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as RemoveMemberBody | null;
  const businessId = body?.businessId ?? null;
  const membershipId = body?.membershipId ?? "";
  if (!membershipId) {
    return NextResponse.json({ error: "invalid_payload", message: "membershipId is required." }, { status: 400 });
  }
  const access = await requireBusinessAccess({ request, businessId, minRole: "admin" });
  if ("error" in access) return access.error;
  await removeMember({ membershipId, businessId: businessId! });
  return NextResponse.json({ status: "ok" });
}

