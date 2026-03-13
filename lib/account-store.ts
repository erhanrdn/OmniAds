import { randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import { runMigrations } from "@/lib/migrations";
import { MembershipRole } from "@/lib/auth";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  avatar: string | null;
  created_at: string;
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  await runMigrations();
  const sql = getDb();
  const rows = (await sql`
    SELECT id, name, email, password_hash, avatar, created_at
    FROM users
    WHERE lower(email) = lower(${email})
    LIMIT 1
  `) as UserRow[];
  return rows[0] ?? null;
}

export async function getUserById(userId: string): Promise<UserRow | null> {
  await runMigrations();
  const sql = getDb();
  const rows = (await sql`
    SELECT id, name, email, password_hash, avatar, created_at
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `) as UserRow[];
  return rows[0] ?? null;
}

export async function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
}): Promise<UserRow> {
  await runMigrations();
  const sql = getDb();
  const rows = (await sql`
    INSERT INTO users (name, email, password_hash)
    VALUES (${input.name.trim()}, ${input.email.trim().toLowerCase()}, ${input.passwordHash})
    RETURNING id, name, email, password_hash, avatar, created_at
  `) as UserRow[];
  return rows[0] as UserRow;
}

export async function createBusinessWithAdminMembership(input: {
  name: string;
  ownerId: string;
  timezone: string;
  currency: string;
}): Promise<{ id: string; name: string; timezone: string; currency: string }> {
  await runMigrations();
  const sql = getDb();
  const businessRows = (await sql`
    INSERT INTO businesses (name, owner_id, timezone, currency)
    VALUES (${input.name.trim()}, ${input.ownerId}, ${input.timezone}, ${input.currency})
    RETURNING id, name, timezone, currency
  `) as Array<{ id: string; name: string; timezone: string; currency: string }>;
  const business = businessRows[0] as { id: string; name: string; timezone: string; currency: string };
  await sql`
    INSERT INTO memberships (user_id, business_id, role, status)
    VALUES (${input.ownerId}, ${business.id}, 'admin', 'active')
    ON CONFLICT (user_id, business_id)
    DO UPDATE SET role = 'admin', status = 'active'
  `;
  return business;
}

export async function createInvite(input: {
  email: string;
  businessId: string;
  role: MembershipRole;
  invitedByUserId: string;
}): Promise<{ id: string; token: string; created_at: string; expires_at: string }> {
  await runMigrations();
  const sql = getDb();
  const token = randomBytes(32).toString("hex");
  const rows = (await sql`
    INSERT INTO invites (email, business_id, role, token, status, invited_by_user_id, expires_at)
    VALUES (
      ${input.email.trim().toLowerCase()},
      ${input.businessId},
      ${input.role},
      ${token},
      'pending',
      ${input.invitedByUserId},
      ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()}
    )
    RETURNING id, token, created_at, expires_at
  `) as Array<{ id: string; token: string; created_at: string; expires_at: string }>;
  return rows[0] as { id: string; token: string; created_at: string; expires_at: string };
}

export async function listInvitesByBusiness(businessId: string) {
  await runMigrations();
  const sql = getDb();
  await sql`
    UPDATE invites
    SET status = 'expired'
    WHERE business_id = ${businessId}
      AND status = 'pending'
      AND expires_at < now()
  `;
  return sql`
    SELECT
      i.id,
      i.email,
      i.business_id,
      i.role,
      i.token,
      i.status,
      i.created_at,
      i.expires_at,
      i.accepted_at,
      i.invited_by_user_id,
      u.name AS invited_by_name,
      u.email AS invited_by_email
    FROM invites i
    LEFT JOIN users u ON u.id = i.invited_by_user_id
    WHERE i.business_id = ${businessId}
    ORDER BY i.created_at DESC
  `;
}

export async function getInviteByToken(token: string) {
  await runMigrations();
  const sql = getDb();
  const rows = (await sql`
    SELECT
      id,
      email,
      business_id,
      role,
      token,
      status,
      created_at,
      expires_at,
      accepted_at,
      invited_by_user_id
    FROM invites
    WHERE token = ${token}
    LIMIT 1
  `) as Array<
    | {
        id: string;
        email: string;
        business_id: string;
        role: MembershipRole;
        token: string;
        status: "pending" | "accepted" | "revoked" | "expired";
        created_at: string;
        expires_at: string;
        accepted_at: string | null;
        invited_by_user_id: string | null;
      }
  >;
  return rows[0] ?? null;
}

export async function acceptInvite(token: string, userId: string): Promise<{ businessId: string } | null> {
  await runMigrations();
  const sql = getDb();
  const invite = await getInviteByToken(token);
  if (!invite || invite.status !== "pending") return null;
  const expiresAt = new Date(invite.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    await sql`UPDATE invites SET status = 'expired' WHERE id = ${invite.id}`;
    return null;
  }

  await sql`
    INSERT INTO memberships (user_id, business_id, role, status)
    VALUES (${userId}, ${invite.business_id}, ${invite.role}, 'active')
    ON CONFLICT (user_id, business_id)
    DO UPDATE SET role = EXCLUDED.role, status = 'active'
  `;
  await sql`
    UPDATE invites
    SET status = 'accepted', accepted_at = now()
    WHERE id = ${invite.id}
  `;
  return { businessId: invite.business_id };
}

export async function revokeInvite(input: { inviteId: string; businessId: string }) {
  await runMigrations();
  const sql = getDb();
  await sql`
    UPDATE invites
    SET status = 'revoked'
    WHERE id = ${input.inviteId}
      AND business_id = ${input.businessId}
      AND status = 'pending'
  `;
}

export async function listBusinessMembers(businessId: string) {
  await runMigrations();
  const sql = getDb();
  return sql`
    SELECT
      m.id AS membership_id,
      m.user_id,
      m.business_id,
      m.role,
      m.status,
      m.joined_at,
      u.name,
      u.email
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.business_id = ${businessId}
    ORDER BY m.joined_at ASC
  `;
}

export async function updateMemberRole(input: {
  membershipId: string;
  businessId: string;
  role: MembershipRole;
}) {
  await runMigrations();
  const sql = getDb();
  await sql`
    UPDATE memberships
    SET role = ${input.role}
    WHERE id = ${input.membershipId} AND business_id = ${input.businessId}
  `;
}

export async function removeMember(input: { membershipId: string; businessId: string }) {
  await runMigrations();
  const sql = getDb();
  await sql`
    DELETE FROM memberships
    WHERE id = ${input.membershipId} AND business_id = ${input.businessId}
  `;
}

export async function listAccessRequestsByBusiness(businessId: string) {
  await runMigrations();
  const sql = getDb();
  return sql`
    SELECT
      m.id AS membership_id,
      m.user_id,
      m.business_id,
      m.role,
      m.status,
      m.joined_at,
      u.name,
      u.email,
      b.name AS business_name
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    JOIN businesses b ON b.id = m.business_id
    WHERE m.business_id = ${businessId} AND m.status = 'pending'
    ORDER BY m.created_at DESC
  `;
}

export async function approveAccessRequest(input: { membershipId: string; businessId: string }) {
  await runMigrations();
  const sql = getDb();
  await sql`
    UPDATE memberships
    SET status = 'active'
    WHERE id = ${input.membershipId} AND business_id = ${input.businessId} AND status = 'pending'
  `;
}

export async function rejectAccessRequest(input: { membershipId: string; businessId: string }) {
  await runMigrations();
  const sql = getDb();
  await sql`
    DELETE FROM memberships
    WHERE id = ${input.membershipId} AND business_id = ${input.businessId} AND status = 'pending'
  `;
}
