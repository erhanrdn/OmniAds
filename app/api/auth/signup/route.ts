import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, createSession, hashPassword } from "@/lib/auth";
import { acceptInvite, createBusinessWithAdminMembership, createUser, getInviteByToken, getUserByEmail } from "@/lib/account-store";

interface SignupBody {
  name?: string;
  email?: string;
  password?: string;
  businessName?: string;
  timezone?: string;
  currency?: string;
  inviteToken?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as SignupBody | null;
  const name = body?.name?.trim() ?? "";
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";
  const businessName = body?.businessName?.trim() ?? "My Business";
  const timezone = body?.timezone?.trim() || "UTC";
  const currency = body?.currency?.trim().toUpperCase() || "USD";
  const inviteToken = body?.inviteToken?.trim() ?? "";

  if (!name || !email || !password) {
    return NextResponse.json(
      { error: "invalid_payload", message: "Name, email, and password are required." },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "weak_password", message: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return NextResponse.json(
      { error: "email_exists", message: "An account with this email already exists." },
      { status: 409 }
    );
  }

  if (inviteToken) {
    const validatedInvite = await getInviteByToken(inviteToken);
    if (!validatedInvite || validatedInvite.status !== "pending") {
      return NextResponse.json(
        { error: "invite_invalid", message: "Invite link is invalid or expired." },
        { status: 400 }
      );
    }
    if (validatedInvite.email.toLowerCase() !== email) {
      return NextResponse.json(
        { error: "invite_email_mismatch", message: "Signup email must match invite email." },
        { status: 403 }
      );
    }
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser({ name, email, passwordHash });
  let business: { id: string; name: string; timezone: string; currency: string } | null = null;
  if (inviteToken) {
    const accepted = await acceptInvite(inviteToken, user.id);
    if (!accepted) {
      return NextResponse.json(
        { error: "invite_accept_failed", message: "Could not accept invite." },
        { status: 400 }
      );
    }
    business = { id: accepted.businessId, name: "Invited workspace", timezone, currency };
  } else {
    business = await createBusinessWithAdminMembership({
      name: businessName,
      ownerId: user.id,
      timezone,
      currency,
    });
  }
  const { token, expiresAt } = await createSession({
    userId: user.id,
    activeBusinessId: business?.id ?? null,
  });

  const response = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
    businessId: business?.id ?? null,
  });
  attachSessionCookie(response, token, expiresAt);
  return response;
}
