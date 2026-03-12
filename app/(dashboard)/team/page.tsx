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
type TeamTab = "members" | "invites";

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
  expires_at: string;
  token: string;
  invited_by_name?: string | null;
  invited_by_email?: string | null;
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteInput, setInviteInput] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("collaborator");
  const [inviteStep, setInviteStep] = useState<"form" | "result">("form");
  const [generatedLinks, setGeneratedLinks] = useState<Array<{ email: string; inviteUrl: string }>>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const parsedEmails = useMemo(() => parseEmails(inviteInput), [inviteInput]);

  async function loadTeamData() {
    if (!selectedBusinessId) {
      setMembers([]);
      setInvites([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setFlash(null);
    try {
      const [membersRes, invitesRes] = await Promise.all([
        fetch(`/api/team/members?businessId=${encodeURIComponent(selectedBusinessId)}`, {
          cache: "no-store",
        }),
        fetch(`/api/team/invites?businessId=${encodeURIComponent(selectedBusinessId)}`, {
          cache: "no-store",
        }),
      ]);

      const membersJson = (await membersRes.json().catch(() => null)) as { members?: TeamMember[] } | null;
      const invitesJson = (await invitesRes.json().catch(() => null)) as { invites?: InviteRow[] } | null;

      if (!membersRes.ok || !invitesRes.ok) {
        setMembers([]);
        setInvites([]);
        setFlash({ type: "error", text: "Could not load team data." });
        return;
      }

      setMembers(membersJson?.members ?? []);
      setInvites(invitesJson?.invites ?? []);
    } catch {
      setMembers([]);
      setInvites([]);
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

  const copyInviteLink = async (link: string) => {
    await navigator.clipboard.writeText(link);
    setFlash({ type: "success", text: "Invite link copied." });
  };

  const revokeInviteAction = async (inviteId: string) => {
    if (!selectedBusinessId) return;
    const res = await fetch("/api/team/invites", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId: selectedBusinessId,
        inviteId,
        action: "revoke",
      }),
    });
    if (!res.ok) {
      setFlash({ type: "error", text: "Could not revoke invite." });
      return;
    }
    await loadTeamData();
    setFlash({ type: "success", text: "Invite revoked." });
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
    const payload = (await res.json().catch(() => null)) as
      | { invites?: Array<{ email: string; inviteUrl: string }> }
      | null;
    setGeneratedLinks(payload?.invites ?? []);
    setInviteStep("result");
    await loadTeamData();
    setFlash({ type: "success", text: "Invitation link created." });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">
            Manage members and invite links across your workspaces.
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
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Invited by</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Expires</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.id} className="border-t">
                  <td className="px-4 py-3">{invite.email}</td>
                  <td className="px-4 py-3">{ROLE_META[invite.role].label}</td>
                  <td className="px-4 py-3 text-muted-foreground">{invite.invited_by_name ?? invite.invited_by_email ?? "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(invite.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(invite.expires_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-muted-foreground">{invite.status}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          copyInviteLink(
                            `${window.location.origin}/invite/${invite.token}`
                          )
                        }
                      >
                        Copy link
                      </Button>
                      {invite.status === "pending" ? (
                        <Button variant="outline" size="sm" onClick={() => revokeInviteAction(invite.id)}>
                          Revoke
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {invites.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No pending invites.
                  </td>
                </tr>
              ) : null}
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
            {inviteStep === "form" ? (
              <>
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
              </>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-sm font-medium">Invitation link created</p>
                <p className="text-xs text-muted-foreground">
                  Share this link manually with the invited user.
                </p>
                <div className="space-y-2">
                  {generatedLinks.map((row) => (
                    <div key={row.email} className="rounded-lg border p-2.5">
                      <p className="text-xs text-muted-foreground">{row.email}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          readOnly
                          value={row.inviteUrl}
                          className="h-8 flex-1 rounded-md border bg-muted/30 px-2 text-xs"
                        />
                        <Button size="sm" variant="outline" onClick={() => copyInviteLink(row.inviteUrl)}>
                          Copy link
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setInviteOpen(false);
                  setInviteStep("form");
                  setInviteInput("");
                  setGeneratedLinks([]);
                }}
                disabled={inviteLoading}
              >
                Cancel
              </Button>
              {inviteStep === "form" ? (
                <Button onClick={submitInvite} disabled={inviteLoading}>
                  {inviteLoading ? "Creating..." : "Create invite"}
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setInviteOpen(false);
                    setInviteStep("form");
                    setInviteInput("");
                    setGeneratedLinks([]);
                  }}
                >
                  Close
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
