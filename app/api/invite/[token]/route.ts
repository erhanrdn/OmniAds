import { NextRequest, NextResponse } from "next/server";
import { acceptInvite, createUser, getInviteByToken, getUserByEmail } from "@/lib/account-store";
import { attachSessionCookie, createSession, getSessionFromRequest, hashPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { resolveRequestLanguage } from "@/lib/request-language";

interface AcceptInviteBody {
  name?: string;
  password?: string;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const language = await resolveRequestLanguage(_request);
  const tr = (english: string, turkish: string) => (language === "tr" ? turkish : english);
  const { token } = await context.params;
  const invite = await getInviteByToken(token);
  if (!invite) {
    return NextResponse.json(
      { error: "not_found", message: tr("Invite link is invalid.", "Davet linki geçersiz.") },
      { status: 404 }
    );
  }
  // Resolve workspace names
  const wsIds = invite.workspace_ids && invite.workspace_ids.length > 0
    ? invite.workspace_ids
    : [invite.business_id];
  const sql = getDb();
  const wsRows = (await sql`
    SELECT id, name FROM businesses WHERE id = ANY(${wsIds})
  `) as Array<{ id: string; name: string }>;

  return NextResponse.json({
    invite: {
      email: invite.email,
      businessId: invite.business_id,
      role: invite.role,
      status: invite.status,
      createdAt: invite.created_at,
      expiresAt: invite.expires_at,
      workspaces: wsRows,
    },
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const language = await resolveRequestLanguage(request);
  const tr = (english: string, turkish: string) => (language === "tr" ? turkish : english);
  const { token } = await context.params;
  const invite = await getInviteByToken(token);
  if (!invite) {
    return NextResponse.json(
      { error: "not_found", message: tr("Invite link is invalid.", "Davet linki geçersiz.") },
      { status: 404 }
    );
  }
  if (invite.status !== "pending") {
    return NextResponse.json(
      { error: "invite_closed", message: tr("Invite is no longer pending.", "Davet artik beklemede degil.") },
      { status: 409 }
    );
  }
  const expiresAtMs = new Date(invite.expires_at).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
    return NextResponse.json(
      { error: "invite_expired", message: tr("Invite link is invalid or expired.", "Davet linki geçersiz veya süresi dolmuş.") },
      { status: 410 }
    );
  }

  const activeSession = await getSessionFromRequest(request);
  let userId = activeSession?.user.id ?? null;
  if (activeSession && activeSession.user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return NextResponse.json(
      {
        error: "email_mismatch",
        message: tr("This invite was sent to a different email address.", "Bu davet farklı bir email adresine gönderildi."),
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
          message: tr("This invite is for an existing account. Please log in first.", "Bu davet mevcut bir hesap için. Lütfen önce giriş yapın."),
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
          message: tr("Name and password (min 8 chars) are required to accept invite.", "Daveti kabul etmek için ad ve şifre (en az 8 karakter) zorunludur."),
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
      { error: "accept_failed", message: tr("Could not accept invite.", "Davet kabul edilemedi.") },
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
