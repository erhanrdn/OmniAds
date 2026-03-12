import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, createSession, verifyPassword } from "@/lib/auth";
import { getUserByEmail } from "@/lib/account-store";
import { listUserBusinesses } from "@/lib/access";
import { isReviewerEmail, scopeBusinessesForUser } from "@/lib/reviewer-access";

interface LoginBody {
  email?: string;
  password?: string;
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as LoginBody | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "invalid_payload", message: "Email and password are required." },
      { status: 400 }
    );
  }

  const user = await getUserByEmail(email);
  if (!user) {
    return NextResponse.json(
      { error: "invalid_credentials", message: "Invalid email or password." },
      { status: 401 }
    );
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return NextResponse.json(
      { error: "invalid_credentials", message: "Invalid email or password." },
      { status: 401 }
    );
  }

  const businesses = scopeBusinessesForUser(user.email, await listUserBusinesses(user.id));
  if (isReviewerEmail(user.email) && businesses.length === 0) {
    return NextResponse.json(
      {
        error: "reviewer_account_not_ready",
        message: "Reviewer account is not assigned to the demo workspace.",
      },
      { status: 403 }
    );
  }
  const firstActiveBusiness =
    businesses.find((b) => b.membershipStatus === "active")?.id ?? null;
  const { token, expiresAt } = await createSession({
    userId: user.id,
    activeBusinessId: firstActiveBusiness,
  });

  const response = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
    businesses,
    activeBusinessId: firstActiveBusiness,
  });
  attachSessionCookie(response, token, expiresAt);
  return response;
}
