import { NextRequest, NextResponse } from "next/server";
import { approveAccessRequest, listAccessRequestsByBusiness, rejectAccessRequest } from "@/lib/account-store";
import { requireBusinessAccess } from "@/lib/access";

interface AccessActionBody {
  businessId?: string;
  membershipId?: string;
  action?: "approve" | "reject";
}

export async function GET(request: NextRequest) {
  const businessId = request.nextUrl.searchParams.get("businessId");
  const access = await requireBusinessAccess({ request, businessId, minRole: "admin" });
  if ("error" in access) return access.error;
  const requests = await listAccessRequestsByBusiness(businessId!);
  return NextResponse.json({ requests });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as AccessActionBody | null;
  const businessId = body?.businessId ?? null;
  const membershipId = body?.membershipId ?? "";
  const action = body?.action;
  if (!membershipId || !action) {
    return NextResponse.json(
      { error: "invalid_payload", message: "membershipId and action are required." },
      { status: 400 }
    );
  }
  const access = await requireBusinessAccess({ request, businessId, minRole: "admin" });
  if ("error" in access) return access.error;
  if (action === "approve") {
    await approveAccessRequest({ membershipId, businessId: businessId! });
  } else {
    await rejectAccessRequest({ membershipId, businessId: businessId! });
  }
  return NextResponse.json({ status: "ok" });
}

