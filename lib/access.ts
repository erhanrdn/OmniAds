import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { MembershipRole, SessionContext, getSessionFromRequest } from "@/lib/auth";
import { runMigrations } from "@/lib/migrations";
import { canReviewerAccessBusiness } from "@/lib/reviewer-access";
import type { BusinessTimezoneSource } from "@/lib/business-timezone-types";

export interface MembershipRecord {
  id: string;
  userId: string;
  businessId: string;
  role: MembershipRole;
  status: "active" | "invited" | "pending";
  joinedAt: string;
}

const ROLE_WEIGHT: Record<MembershipRole, number> = {
  guest: 1,
  collaborator: 2,
  admin: 3,
};

export async function findMembership(input: {
  userId: string;
  businessId: string;
}): Promise<MembershipRecord | null> {
  await runMigrations();
  const sql = getDb();
  const rows = (await sql`
    SELECT id, user_id, business_id, role, status, joined_at
    FROM memberships
    WHERE user_id = ${input.userId} AND business_id = ${input.businessId}
    LIMIT 1
  `) as Array<
    | {
        id: string;
        user_id: string;
        business_id: string;
        role: MembershipRole;
        status: "active" | "invited" | "pending";
        joined_at: string;
      }
  >;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    businessId: row.business_id,
    role: row.role,
    status: row.status,
    joinedAt: row.joined_at,
  };
}

export async function listUserBusinesses(userId: string): Promise<
  Array<{
    id: string;
    name: string;
    timezone: string | null;
    timezoneSource: BusinessTimezoneSource;
    currency: string;
    role: MembershipRole;
    membershipStatus: "active" | "invited" | "pending";
    isDemoBusiness?: boolean;
    industry?: string;
    platform?: string;
  }>
> {
  await runMigrations();
  const sql = getDb();
  const rows = (await sql`
    SELECT
      b.id,
      b.name,
      b.timezone,
      b.timezone_source,
      b.currency,
      b.is_demo_business,
      b.industry,
      b.platform,
      m.role,
      m.status
    FROM memberships m
    JOIN businesses b ON b.id = m.business_id
    WHERE m.user_id = ${userId}
    ORDER BY b.created_at ASC
  `) as Array<{
    id: string;
    name: string;
    timezone: string | null;
    timezone_source: BusinessTimezoneSource;
    currency: string;
    is_demo_business?: boolean;
    industry?: string | null;
    platform?: string | null;
    role: MembershipRole;
    status: "active" | "invited" | "pending";
  }>;
  const businesses = rows.map((row) => ({
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    timezoneSource: row.timezone_source,
    currency: row.currency,
    role: row.role,
    membershipStatus: row.status,
    isDemoBusiness: Boolean(row.is_demo_business),
    industry: typeof row.industry === "string"
      ? row.industry
      : undefined,
    platform: typeof row.platform === "string"
      ? row.platform
      : undefined,
  }));

  return businesses;
}

export function hasRole(required: MembershipRole, actual: MembershipRole): boolean {
  return ROLE_WEIGHT[actual] >= ROLE_WEIGHT[required];
}

export function authError(message: string, status = 401) {
  return NextResponse.json({ error: "auth_error", message }, { status });
}

export async function requireAuthedRequest(
  request: NextRequest
): Promise<{ session: SessionContext } | { error: NextResponse }> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return { error: authError("Authentication required.", 401) };
  }
  return { session };
}

export async function requireBusinessAccess(input: {
  request: NextRequest;
  businessId: string | null;
  minRole?: MembershipRole;
}): Promise<
  | { session: SessionContext; membership: MembershipRecord }
  | { error: NextResponse }
> {
  const { request, businessId, minRole = "guest" } = input;
  if (!businessId) {
    return { error: NextResponse.json({ error: "missing_business_id", message: "businessId is required." }, { status: 400 }) };
  }
  const auth = await requireAuthedRequest(request);
  if ("error" in auth) return { error: auth.error };
  if (!canReviewerAccessBusiness(auth.session.user.email, businessId)) {
    return { error: authError("You do not have access to this business.", 403) };
  }

  const membership = await findMembership({
    userId: auth.session.user.id,
    businessId,
  });
  if (!membership || membership.status !== "active") {
    return { error: authError("You do not have access to this business.", 403) };
  }
  if (!hasRole(minRole, membership.role)) {
    return { error: authError("Insufficient role permissions for this action.", 403) };
  }

  return {
    session: auth.session,
    membership,
  };
}
