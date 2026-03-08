import { NextRequest, NextResponse } from "next/server";
import { acceptInvite, createUser, getInviteByToken, getUserByEmail } from "@/lib/account-store";
import { attachSessionCookie, createSession, getSessionFromRequest, hashPassword } from "@/lib/auth";

interface AcceptInviteBody {
  name?: string;
  password?: string;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const invite = await getInviteByToken(token);
  if (!invite) {
    return NextResponse.json(
      { error: "not_found", message: "Invite link is invalid." },
      { status: 404 }
    );
  }
  return NextResponse.json({
    invite: {
      email: invite.email,
      businessId: invite.business_id,
      role: invite.role,
      status: invite.status,
      createdAt: invite.created_at,
      expiresAt: invite.expires_at,
    },
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const invite = await getInviteByToken(token);
  if (!invite) {
    return NextResponse.json(
      { error: "not_found", message: "Invite link is invalid." },
      { status: 404 }
    );
  }
  if (invite.status !== "pending") {
    return NextResponse.json(
      { error: "invite_closed", message: "Invite is no longer pending." },
      { status: 409 }
    );
  }
  const expiresAtMs = new Date(invite.expires_at).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
    return NextResponse.json(
      { error: "invite_expired", message: "Invite link is invalid or expired." },
      { status: 410 }
    );
  }

  const activeSession = await getSessionFromRequest(request);
  let userId = activeSession?.user.id ?? null;
  if (activeSession && activeSession.user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return NextResponse.json(
      {
        error: "email_mismatch",
        message: "This invite was sent to a different email address.",
      },
      { status: 403 }
    );
  }

  if (!userId) {
    const existingUser = await getUserByEmail(invite.email);
    if (existingUser) {
      return NextResponse.json(
        {
          error: "login_required",
          message: "This invite is for an existing account. Please log in first.",
        },
        { status: 401 }
      );
    }

    const body = (await request.json().catch(() => null)) as AcceptInviteBody | null;
    const name = body?.name?.trim() ?? "";
    const password = body?.password ?? "";
    if (!name || password.length < 8) {
      return NextResponse.json(
        {
          error: "invalid_payload",
          message: "Name and password (min 8 chars) are required to accept invite.",
        },
        { status: 400 }
      );
    }
    const passwordHash = await hashPassword(password);
    const user = await createUser({
      name,
      email: invite.email,
      passwordHash,
    });
    userId = user.id;
  }

  const accepted = await acceptInvite(token, userId);
  if (!accepted) {
    return NextResponse.json(
      { error: "accept_failed", message: "Could not accept invite." },
      { status: 400 }
    );
  }

  if (!activeSession) {
    const { token: sessionToken, expiresAt } = await createSession({
      userId,
      activeBusinessId: accepted.businessId,
    });
    const response = NextResponse.json({ status: "accepted", businessId: accepted.businessId });
    attachSessionCookie(response, sessionToken, expiresAt);
    return response;
  }

  return NextResponse.json({ status: "accepted", businessId: accepted.businessId });
}
