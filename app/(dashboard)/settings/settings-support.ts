export type WorkspaceRole = "admin" | "collaborator" | "guest";

export type MemberRow = {
  membership_id: string;
  user_id: string;
  role: WorkspaceRole;
  status: string;
  joined_at: string;
  name: string;
  email: string;
};

export type InviteRow = {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: string;
  created_at: string;
  expires_at: string;
  inviteUrl?: string;
};

export const CURRENCY_OPTIONS = ["USD", "EUR", "GBP", "TRY"];

export async function fetchSettingsAccount() {
  const response = await fetch("/api/settings/account", { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as
    | {
        user?: {
          name?: string;
          email?: string;
          language?: "en" | "tr";
          createdAt?: string;
        };
        message?: string;
      }
    | null;
  if (!response.ok || !payload?.user) {
    throw new Error(payload?.message ?? "Could not load account settings.");
  }
  return payload.user;
}

export async function fetchWorkspaceRoleByBusiness(selectedBusinessId: string | null) {
  const response = await fetch("/api/businesses", { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as
    | {
        businesses?: Array<{ id: string; role?: WorkspaceRole }>;
      }
    | null;
  return payload?.businesses?.find((business) => business.id === selectedBusinessId)?.role ?? "guest";
}

export async function fetchWorkspaceTeam(selectedBusinessId: string) {
  const [membersResponse, invitesResponse] = await Promise.all([
    fetch(`/api/team/members?businessId=${encodeURIComponent(selectedBusinessId)}`, { cache: "no-store" }),
    fetch(`/api/team/invites?businessId=${encodeURIComponent(selectedBusinessId)}`, { cache: "no-store" }),
  ]);
  const membersPayload = (await membersResponse.json().catch(() => null)) as
    | { members?: MemberRow[]; message?: string }
    | null;
  const invitesPayload = (await invitesResponse.json().catch(() => null)) as
    | { invites?: InviteRow[]; message?: string }
    | null;

  if (!membersResponse.ok) {
    throw new Error(membersPayload?.message ?? "Could not load workspace members.");
  }
  if (!invitesResponse.ok) {
    throw new Error(invitesPayload?.message ?? "Could not load workspace invites.");
  }

  return {
    members: membersPayload?.members ?? [],
    invites: invitesPayload?.invites ?? [],
  };
}
