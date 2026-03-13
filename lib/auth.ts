import { createHash, randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";

export type MembershipRole = "admin" | "collaborator" | "guest";
export type MembershipStatus = "active" | "invited" | "pending";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

export interface SessionContext {
  sessionId: string;
  user: SessionUser;
  activeBusinessId: string | null;
  expiresAt: string;
}

const AUTH_COOKIE_NAME = "omniads_session";
const SESSION_TTL_DAYS = 14;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sessionExpiryDate() {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

async function findSessionByToken(rawToken: string): Promise<SessionContext | null> {
  await runMigrations();
  const sql = getDb();
  const tokenHash = hashToken(rawToken);
  const rows = (await sql`
    SELECT
      s.id AS session_id,
      s.active_business_id,
      s.expires_at,
      u.id AS user_id,
      u.name AS user_name,
      u.email AS user_email,
      u.avatar AS user_avatar
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash}
    LIMIT 1
  `) as Array<
    | {
        session_id: string;
        active_business_id: string | null;
        expires_at: string;
        user_id: string;
        user_name: string;
        user_email: string;
        user_avatar: string | null;
      }
  >;
  const row = rows[0];
  if (!row) return null;

  const expiresAtMs = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) {
    await sql`DELETE FROM sessions WHERE id = ${row.session_id}`;
    return null;
  }

  return {
    sessionId: row.session_id,
    activeBusinessId: row.active_business_id,
    expiresAt: row.expires_at,
    user: {
      id: row.user_id,
      name: row.user_name,
      email: row.user_email,
      avatar: row.user_avatar,
    },
  };
}

export async function getSessionFromRequest(request: NextRequest): Promise<SessionContext | null> {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return findSessionByToken(token);
}

export async function getSessionFromCookies(): Promise<SessionContext | null> {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return findSessionByToken(token);
}

export async function createSession(input: {
  userId: string;
  activeBusinessId?: string | null;
}): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  await runMigrations();
  const sql = getDb();
  const token = randomUUID().replace(/-/g, "");
  const tokenHash = hashToken(token);
  const expiresAt = sessionExpiryDate();
  const rows = (await sql`
    INSERT INTO sessions (user_id, token_hash, active_business_id, expires_at)
    VALUES (${input.userId}, ${tokenHash}, ${input.activeBusinessId ?? null}, ${expiresAt.toISOString()})
    RETURNING id
  `) as Array<{ id: string }>;
  const sessionId = rows[0]?.id ?? "";
  return { token, sessionId, expiresAt };
}

export function attachSessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySessionByRequest(request: NextRequest): Promise<void> {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return;
  await runMigrations();
  const sql = getDb();
  await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export async function setSessionActiveBusiness(sessionId: string, businessId: string | null): Promise<void> {
  await runMigrations();
  const sql = getDb();
  await sql`UPDATE sessions SET active_business_id = ${businessId} WHERE id = ${sessionId}`;
}

export function canManageTeam(role: MembershipRole): boolean {
  return role === "admin";
}

export function canEdit(role: MembershipRole): boolean {
  return role === "admin" || role === "collaborator";
}
