import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, createSession, hashPassword } from "@/lib/auth";
import { acceptInvite, createBusinessWithAdminMembership, createUser, getInviteByToken, getUserByEmail } from "@/lib/account-store";
import { listUserBusinesses } from "@/lib/access";
import { logServerAuthEvent } from "@/lib/auth-diagnostics";
import { scopeBusinessesForUser } from "@/lib/reviewer-access";
import { getLanguageFromCookieValue, LANGUAGE_COOKIE_NAME } from "@/lib/i18n";

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
    logServerAuthEvent("signup_rejected_invalid_payload", { email });
    return NextResponse.json(
      { error: "invalid_payload", message: "Name, email, and password are required." },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    logServerAuthEvent("signup_rejected_weak_password", { email });
    return NextResponse.json(
      { error: "weak_password", message: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    logServerAuthEvent("signup_rejected_email_exists", { email });
    return NextResponse.json(
      { error: "email_exists", message: "An account with this email already exists." },
      { status: 409 }
    );
  }

  if (inviteToken) {
    const validatedInvite = await getInviteByToken(inviteToken);
    if (!validatedInvite || validatedInvite.status !== "pending") {
      logServerAuthEvent("signup_rejected_invite_invalid", { email, inviteTokenPresent: true });
      return NextResponse.json(
        { error: "invite_invalid", message: "Invite link is invalid or expired." },
        { status: 400 }
      );
    }
    if (validatedInvite.email.toLowerCase() !== email) {
      logServerAuthEvent("signup_rejected_invite_email_mismatch", { email });
      return NextResponse.json(
        { error: "invite_email_mismatch", message: "Signup email must match invite email." },
        { status: 403 }
      );
    }
  }

  const passwordHash = await hashPassword(password);
  const initialLanguage = getLanguageFromCookieValue(request.cookies.get(LANGUAGE_COOKIE_NAME)?.value);
  const user = await createUser({ name, email, passwordHash, language: initialLanguage });
  let business: { id: string; name: string; timezone: string; currency: string } | null = null;
  if (inviteToken) {
    const accepted = await acceptInvite(inviteToken, user.id);
    if (!accepted) {
      logServerAuthEvent("signup_rejected_invite_accept_failed", { email, userId: user.id });
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
  const businesses = scopeBusinessesForUser(user.email, await listUserBusinesses(user.id));
  logServerAuthEvent("signup_succeeded", {
    userId: user.id,
    email: user.email,
    membershipCount: businesses.length,
    activeBusinessId: business?.id ?? null,
  });

  const response = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, language: user.language },
    businesses,
    activeBusinessId: business?.id ?? null,
  }, { headers: { "Cache-Control": "no-store, max-age=0", Vary: "Cookie" } });
  attachSessionCookie(response, token, expiresAt);
  return response;
}
