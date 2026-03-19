export type TeamRole = "guest" | "collaborator" | "admin";

export interface ApiMember {
  id: string;
  name: string | null;
  email: string;
  role: TeamRole;
  status: string;
}

export interface ApiAccessRequest {
  id: string;
  name: string | null;
  email: string;
  role: TeamRole;
}

export interface CreatedInvite {
  id: string;
  email: string;
  role: TeamRole;
  inviteUrl: string;
}

export const TEAM_ROLE_META: Record<TeamRole, { title: string; description: string }> = {
  guest: {
    title: "Guest",
    description: "Access to selected workspaces/businesses. Cannot edit or invite.",
  },
  collaborator: {
    title: "Collaborator",
    description:
      "Can work in assigned workspaces/businesses. Can edit, but cannot invite others.",
  },
  admin: {
    title: "Admin",
    description: "Can manage all workspaces/businesses, settings, and invite others.",
  },
};

export function parseInviteEmails(raw: string): string[] {
  return raw
    .split(/[,\n;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function extractApiMessage(data: unknown): string | null {
  return data &&
    typeof data === "object" &&
    "message" in data &&
    typeof (data as { message: unknown }).message === "string"
    ? (data as { message: string }).message
    : null;
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export async function fetchTeamMembers(businessId: string): Promise<{
  members: ApiMember[];
  error: string | null;
}> {
  try {
    const res = await fetch(`/api/team/members?businessId=${businessId}`);
    const data = await parseJsonSafely(res);
    if (!res.ok) {
      return {
        members: [],
        error: extractApiMessage(data) ?? "Could not load members.",
      };
    }

    return {
      members: Array.isArray((data as { members?: unknown }).members)
        ? (data as { members: ApiMember[] }).members
        : [],
      error: null,
    };
  } catch {
    return {
      members: [],
      error: "Network error loading members.",
    };
  }
}

export async function fetchTeamAccessRequests(businessId: string): Promise<{
  requests: ApiAccessRequest[];
  error: string | null;
}> {
  try {
    const res = await fetch(`/api/team/access-requests?businessId=${businessId}`);
    const data = await parseJsonSafely(res);
    if (!res.ok) {
      if (res.status === 403) {
        return { requests: [], error: null };
      }
      return {
        requests: [],
        error: extractApiMessage(data) ?? "Could not load access requests.",
      };
    }

    return {
      requests: Array.isArray((data as { requests?: unknown }).requests)
        ? (data as { requests: ApiAccessRequest[] }).requests
        : [],
      error: null,
    };
  } catch {
    return {
      requests: [],
      error: "Network error loading access requests.",
    };
  }
}

export async function createTeamInvites(params: {
  businessId: string;
  emails: string[];
  role: TeamRole;
}): Promise<{ invites: CreatedInvite[]; error: string | null }> {
  try {
    const res = await fetch("/api/team/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await parseJsonSafely(res);
    if (!res.ok) {
      return {
        invites: [],
        error: extractApiMessage(data) ?? "Could not create invite links.",
      };
    }

    return {
      invites: Array.isArray((data as { invites?: unknown }).invites)
        ? (data as { invites: CreatedInvite[] }).invites
        : [],
      error: null,
    };
  } catch {
    return {
      invites: [],
      error: "Network error. Please try again.",
    };
  }
}

export async function updateTeamMemberRole(params: {
  businessId: string;
  membershipId: string;
  role: TeamRole;
}): Promise<{ error: string | null }> {
  try {
    const res = await fetch("/api/team/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await parseJsonSafely(res);
    return {
      error: res.ok ? null : extractApiMessage(data) ?? "Could not update role.",
    };
  } catch {
    return { error: "Network error." };
  }
}

export async function removeTeamMember(params: {
  businessId: string;
  membershipId: string;
}): Promise<{ error: string | null }> {
  try {
    const res = await fetch("/api/team/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await parseJsonSafely(res);
    return {
      error: res.ok ? null : extractApiMessage(data) ?? "Could not remove member.",
    };
  } catch {
    return { error: "Network error." };
  }
}

export async function resolveTeamAccessRequest(params: {
  businessId: string;
  membershipId: string;
  action: "approve" | "reject";
}): Promise<{ error: string | null }> {
  try {
    const res = await fetch("/api/team/access-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await parseJsonSafely(res);
    return {
      error: res.ok ? null : extractApiMessage(data) ?? "Could not process request.",
    };
  } catch {
    return { error: "Network error." };
  }
}
