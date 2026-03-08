"use client";

import { useEffect, useMemo, useState } from "react";
import { MailPlus, MoreHorizontal, Shield, User, Users } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type TeamRole = "guest" | "collaborator" | "admin";
type TeamTab = "members" | "invites" | "requests";

interface TeamMember {
  membership_id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: "active" | "invited" | "pending";
  joined_at: string;
}

interface InviteRow {
  id: string;
  email: string;
  role: TeamRole;
  status: string;
  created_at: string;
}

interface AccessRequest {
  membership_id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: "pending";
  business_name: string;
}

const ROLE_META: Record<TeamRole, { label: string; description: string }> = {
  guest: {
    label: "Guest",
    description: "Access to selected workspaces. Cannot edit or invite.",
  },
  collaborator: {
    label: "Collaborator",
    description: "Can work in assigned workspaces. Can edit but cannot invite.",
  },
  admin: {
    label: "Admin",
    description: "Full access. Can edit settings and invite others.",
  },
};

function parseEmails(input: string): string[] {
  return input
    .split(/[,\n;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export default function TeamPage() {
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const [activeTab, setActiveTab] = useState<TeamTab>("members");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteInput, setInviteInput] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("collaborator");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const parsedEmails = useMemo(() => parseEmails(inviteInput), [inviteInput]);

  async function loadTeamData() {
    if (!selectedBusinessId) return;
    setLoading(true);
    setFlash(null);
    try {
      const [membersRes, invitesRes, requestsRes] = await Promise.all([
        fetch(`/api/team/members?businessId=${encodeURIComponent(selectedBusinessId)}`, {
          cache: "no-store",
        }),
        fetch(`/api/team/invites?businessId=${encodeURIComponent(selectedBusinessId)}`, {
          cache: "no-store",
        }),
        fetch(`/api/team/access-requests?businessId=${encodeURIComponent(selectedBusinessId)}`, {
          cache: "no-store",
        }),
      ]);

      const membersJson = (await membersRes.json().catch(() => null)) as { members?: TeamMember[] } | null;
      const invitesJson = (await invitesRes.json().catch(() => null)) as { invites?: InviteRow[] } | null;
      const requestsJson = (await requestsRes.json().catch(() => null)) as { requests?: AccessRequest[] } | null;

      setMembers(membersJson?.members ?? []);
      setInvites(invitesJson?.invites ?? []);
      setRequests(requestsJson?.requests ?? []);
    } catch {
      setFlash({ type: "error", text: "Could not load team data." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTeamData();
  }, [selectedBusinessId]);

  const changeRole = async (membershipId: string, role: TeamRole) => {
    if (!selectedBusinessId) return;
    const res = await fetch("/api/team/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId: selectedBusinessId, membershipId, role }),
    });
    if (!res.ok) {
      setFlash({ type: "error", text: "Could not update role." });
      return;
    }
    await loadTeamData();
    setFlash({ type: "success", text: "Role updated." });
  };

  const removeUser = async (membershipId: string) => {
    if (!selectedBusinessId) return;
    const res = await fetch("/api/team/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId: selectedBusinessId, membershipId }),
    });
    if (!res.ok) {
      setFlash({ type: "error", text: "Could not remove member." });
      return;
    }
    await loadTeamData();
    setFlash({ type: "success", text: "User removed." });
  };

  const resendInvite = (email: string) => {
    setFlash({ type: "success", text: `Invite resent to ${email}.` });
  };

  const actOnRequest = async (membershipId: string, action: "approve" | "reject") => {
    if (!selectedBusinessId) return;
    const res = await fetch("/api/team/access-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessId: selectedBusinessId, membershipId, action }),
    });
    if (!res.ok) {
      setFlash({ type: "error", text: `Could not ${action} request.` });
      return;
    }
    await loadTeamData();
    setFlash({ type: "success", text: action === "approve" ? "Access request approved." : "Access request rejected." });
  };

  const submitInvite = async () => {
    if (!selectedBusinessId) return;
    if (parsedEmails.length === 0) {
      setFlash({ type: "error", text: "Enter at least one email address." });
      return;
    }
    setInviteLoading(true);
    setFlash(null);
    const res = await fetch("/api/team/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId: selectedBusinessId,
        emails: parsedEmails,
        role: inviteRole,
      }),
    });
    setInviteLoading(false);
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { message?: string } | null;
      setFlash({ type: "error", text: payload?.message ?? "Could not send invites." });
      return;
    }
    setInviteOpen(false);
    setInviteInput("");
    await loadTeamData();
    setFlash({
      type: "success",
      text: `Invitation sent to ${parsedEmails.length} ${parsedEmails.length === 1 ? "person" : "people"}.`,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">
            Manage members, invites, and access requests across your workspaces.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gap-2" disabled={!selectedBusinessId}>
          <MailPlus className="h-4 w-4" />
          Invite people
        </Button>
      </div>

      <div className="flex gap-1 border-b">
        <button
          type="button"
          onClick={() => setActiveTab("members")}
          className={cn(
            "rounded-t-md px-3 py-2 text-sm",
            activeTab === "members"
              ? "border-b-2 border-foreground font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Members
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("invites")}
          className={cn(
            "rounded-t-md px-3 py-2 text-sm",
            activeTab === "invites"
              ? "border-b-2 border-foreground font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Invites
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("requests")}
          className={cn(
            "rounded-t-md px-3 py-2 text-sm",
            activeTab === "requests"
              ? "border-b-2 border-foreground font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Access requests
        </button>
      </div>

      {flash ? (
        <p className={cn("text-xs", flash.type === "success" ? "text-emerald-600" : "text-destructive")}>
          {flash.text}
        </p>
      ) : null}

      {loading ? <p className="text-sm text-muted-foreground">Loading team data...</p> : null}

      {activeTab === "members" ? (
        <div className="overflow-x-auto rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Access</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.membership_id} className="border-t">
                  <td className="px-4 py-3">
                    <p className="font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border px-2 py-0.5 text-xs">
                      {ROLE_META[member.role].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{selectedBusinessId ? "Assigned business" : "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onClick={() => changeRole(member.membership_id, "guest")}>
                          <User className="h-4 w-4" />
                          Change role to Guest
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => changeRole(member.membership_id, "collaborator")}>
                          <Users className="h-4 w-4" />
                          Change role to Collaborator
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => changeRole(member.membership_id, "admin")}>
                          <Shield className="h-4 w-4" />
                          Change role to Admin
                        </DropdownMenuItem>
                        {member.status === "pending" ? (
                          <DropdownMenuItem onClick={() => resendInvite(member.email)}>
                            Resend invite
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          onClick={() => removeUser(member.membership_id)}
                          className="text-destructive focus:text-destructive"
                        >
                          Remove user
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {activeTab === "invites" ? (
        <div className="overflow-x-auto rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Access</th>
                <th className="px-4 py-3 text-left">Sent</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.id} className="border-t">
                  <td className="px-4 py-3">{invite.email}</td>
                  <td className="px-4 py-3">{ROLE_META[invite.role].label}</td>
                  <td className="px-4 py-3 text-muted-foreground">Assigned business</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(invite.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="outline" size="sm" onClick={() => resendInvite(invite.email)}>
                      Resend invite
                    </Button>
                  </td>
                </tr>
              ))}
              {invites.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No pending invites.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {activeTab === "requests" ? (
        <div className="overflow-x-auto rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Requested role</th>
                <th className="px-4 py-3 text-left">Workspace</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.length > 0 ? (
                requests.map((request) => (
                  <tr key={request.membership_id} className="border-t">
                    <td className="px-4 py-3">
                      <p className="font-medium">{request.name}</p>
                      <p className="text-xs text-muted-foreground">{request.email}</p>
                    </td>
                    <td className="px-4 py-3">{ROLE_META[request.role].label}</td>
                    <td className="px-4 py-3 text-muted-foreground">{request.business_name}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => actOnRequest(request.membership_id, "reject")}>
                          Reject
                        </Button>
                        <Button size="sm" onClick={() => actOnRequest(request.membership_id, "approve")}>
                          Approve
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No access requests.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {inviteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setInviteOpen(false);
          }}
        >
          <div className="w-full max-w-xl rounded-2xl border bg-background p-5 shadow-2xl">
            <h2 className="text-base font-semibold">Invite people</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add one or more teammates by email and choose their role.
            </p>

            <div className="mt-4 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Email addresses</label>
              <textarea
                value={inviteInput}
                onChange={(event) => setInviteInput(event.target.value)}
                rows={3}
                placeholder="name@company.com, teammate@company.com"
                className="w-full rounded-lg border bg-background p-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Role</p>
              <div className="grid gap-2">
                {(["guest", "collaborator", "admin"] as TeamRole[]).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setInviteRole(role)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left",
                      inviteRole === role ? "border-primary bg-primary/5" : "hover:border-muted-foreground/30"
                    )}
                  >
                    <p className="text-sm font-medium">{ROLE_META[role].label}</p>
                    <p className="text-xs text-muted-foreground">{ROLE_META[role].description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviteLoading}>
                Cancel
              </Button>
              <Button onClick={submitInvite} disabled={inviteLoading}>
                {inviteLoading ? "Inviting..." : "Invite"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
