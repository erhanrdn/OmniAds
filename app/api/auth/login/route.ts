import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, createSession, verifyPassword } from "@/lib/auth";
import { getUserByEmail } from "@/lib/account-store";
import { listUserBusinesses } from "@/lib/access";
import { logServerAuthEvent } from "@/lib/auth-diagnostics";
import { isReviewerEmail, scopeBusinessesForUser } from "@/lib/reviewer-access";
import { getDb } from "@/lib/db";

interface LoginBody {
  email?: string;
  password?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as LoginBody | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";

  if (!email || !password) {
    logServerAuthEvent("login_rejected_invalid_payload", { email });
    return NextResponse.json(
      { error: "invalid_payload", message: "Email and password are required." },
      { status: 400 },
    );
  }

  const user = await getUserByEmail(email);
  if (!user) {
    logServerAuthEvent("login_rejected_unknown_user", { email });
    return NextResponse.json(
      { error: "invalid_credentials", message: "Invalid email or password." },
      { status: 401 },
    );
  }

  // Social-only accounts have no password — tell user to use social sign-in
  if (!user.password_hash) {
    logServerAuthEvent("login_rejected_social_only_user", {
      email,
      userId: user.id,
    });
    return NextResponse.json(
      {
        error: "social_only",
        message:
          'This account uses social sign-in. Please use the "Sign in with Google" or "Sign in with Facebook" button.',
      },
      { status: 401 },
    );
  }

  // Check if account is suspended
  if ((user as any).suspended_at) {
    logServerAuthEvent("login_rejected_suspended", { email, userId: user.id });
    return NextResponse.json(
      { error: "account_suspended", message: "This account has been suspended. Please contact support." },
      { status: 403 },
    );
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    logServerAuthEvent("login_rejected_bad_password", {
      email,
      userId: user.id,
    });
    return NextResponse.json(
      { error: "invalid_credentials", message: "Invalid email or password." },
      { status: 401 },
    );
  }

  const businesses = scopeBusinessesForUser(
    user.email,
    await listUserBusinesses(user.id),
  );
  if (isReviewerEmail(user.email) && businesses.length === 0) {
    logServerAuthEvent("login_rejected_reviewer_not_ready", {
      email: user.email,
      userId: user.id,
    });
    return NextResponse.json(
      {
        error: "reviewer_account_not_ready",
        message: "Reviewer account is not assigned to the demo workspace.",
      },
      { status: 403 },
    );
  }
  const firstActiveBusiness =
    businesses.find((b) => b.membershipStatus === "active")?.id ?? null;
  const { token, expiresAt } = await createSession({
    userId: user.id,
    activeBusinessId: firstActiveBusiness,
  });
  // Record last login time (fire-and-forget)
  { const sql = getDb(); sql`UPDATE users SET last_login_at = now() WHERE id = ${user.id}`.catch(() => {}); }


  logServerAuthEvent("login_succeeded", {
    userId: user.id,
    email: user.email,
    membershipCount: businesses.length,
    activeBusinessId: firstActiveBusiness,
  });

  const response = NextResponse.json(
    {
      user: { id: user.id, name: user.name, email: user.email, language: user.language },
      businesses,
      activeBusinessId: firstActiveBusiness,
    },
    { headers: { "Cache-Control": "no-store, max-age=0", Vary: "Cookie" } },
  );
  attachSessionCookie(response, token, expiresAt);
  return response;
}
