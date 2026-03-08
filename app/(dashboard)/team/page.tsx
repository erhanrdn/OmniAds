"use client";

import { useMemo, useState } from "react";
import { MailPlus, MoreHorizontal, Shield, User, Users } from "lucide-react";
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
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  access: string;
  status: "active" | "pending";
}

interface InviteRow {
  id: string;
  email: string;
  role: TeamRole;
  access: string;
  sentAt: string;
}

interface AccessRequest {
  id: string;
  user: string;
  email: string;
  requestedRole: TeamRole;
  workspace: string;
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

const DEFAULT_MEMBERS: TeamMember[] = [
  {
    id: "m1",
    name: "Admin User",
    email: "admin@omniads.io",
    role: "admin",
    access: "All workspaces",
    status: "active",
  },
  {
    id: "m2",
    name: "Lena Foster",
    email: "lena@brand.com",
    role: "collaborator",
    access: "Meta Ecommerce",
    status: "active",
  },
  {
    id: "m3",
    name: "Cem Kaya",
    email: "cem@brand.com",
    role: "guest",
    access: "Top Creatives",
    status: "pending",
  },
];

const DEFAULT_INVITES: InviteRow[] = [
  {
    id: "i1",
    email: "ava@brand.com",
    role: "guest",
    access: "Meta Ecommerce",
    sentAt: "2026-03-08",
  },
];

const DEFAULT_REQUESTS: AccessRequest[] = [
  {
    id: "r1",
    user: "Mia Carter",
    email: "mia@brand.com",
    requestedRole: "collaborator",
    workspace: "Meta Ecommerce",
  },
];

function parseEmails(input: string): string[] {
  return input
    .split(/[,\n;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export default function TeamPage() {
  const [activeTab, setActiveTab] = useState<TeamTab>("members");
  const [members, setMembers] = useState<TeamMember[]>(DEFAULT_MEMBERS);
  const [invites, setInvites] = useState<InviteRow[]>(DEFAULT_INVITES);
  const [requests, setRequests] = useState<AccessRequest[]>(DEFAULT_REQUESTS);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteInput, setInviteInput] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("collaborator");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [flash, setFlash] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const parsedEmails = useMemo(() => parseEmails(inviteInput), [inviteInput]);

  const changeRole = (memberId: string, role: TeamRole) => {
    setMembers((prev) => prev.map((member) => (member.id === memberId ? { ...member, role } : member)));
    setFlash({ type: "success", text: "Role updated." });
  };

  const removeUser = (memberId: string) => {
    setMembers((prev) => prev.filter((member) => member.id !== memberId));
    setFlash({ type: "success", text: "User removed." });
  };

  const resendInvite = (email: string) => {
    setFlash({ type: "success", text: `Invite resent to ${email}.` });
  };

  const approveRequest = (requestId: string) => {
    const request = requests.find((row) => row.id === requestId);
    setRequests((prev) => prev.filter((row) => row.id !== requestId));
    if (request) {
      setMembers((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          name: request.user,
          email: request.email,
          role: request.requestedRole,
          access: request.workspace,
          status: "active",
        },
      ]);
    }
    setFlash({ type: "success", text: "Access request approved." });
  };

  const rejectRequest = (requestId: string) => {
    setRequests((prev) => prev.filter((row) => row.id !== requestId));
    setFlash({ type: "success", text: "Access request rejected." });
  };

  const submitInvite = async () => {
    if (parsedEmails.length === 0) {
      setFlash({ type: "error", text: "Enter at least one email address." });
      return;
    }
    setInviteLoading(true);
    setFlash(null);
    await new Promise((resolve) => setTimeout(resolve, 450));
    const now = new Date().toISOString().slice(0, 10);
    setInvites((prev) => [
      ...prev,
      ...parsedEmails.map((email) => ({
        id: `${email}-${Date.now()}`,
        email,
        role: inviteRole,
        access: "Workspace assignment pending",
        sentAt: now,
      })),
    ]);
    setInviteLoading(false);
    setInviteOpen(false);
    setInviteInput("");
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
        <Button onClick={() => setInviteOpen(true)} className="gap-2">
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
                <tr key={member.id} className="border-t">
                  <td className="px-4 py-3">
                    <p className="font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border px-2 py-0.5 text-xs">
                      {ROLE_META[member.role].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{member.access}</td>
                  <td className="px-4 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onClick={() => changeRole(member.id, "guest")}>
                          <User className="h-4 w-4" />
                          Change role to Guest
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => changeRole(member.id, "collaborator")}>
                          <Users className="h-4 w-4" />
                          Change role to Collaborator
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => changeRole(member.id, "admin")}>
                          <Shield className="h-4 w-4" />
                          Change role to Admin
                        </DropdownMenuItem>
                        {member.status === "pending" ? (
                          <DropdownMenuItem onClick={() => resendInvite(member.email)}>
                            Resend invite
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          onClick={() => removeUser(member.id)}
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
                  <td className="px-4 py-3 text-muted-foreground">{invite.access}</td>
                  <td className="px-4 py-3 text-muted-foreground">{invite.sentAt}</td>
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
                  <tr key={request.id} className="border-t">
                    <td className="px-4 py-3">
                      <p className="font-medium">{request.user}</p>
                      <p className="text-xs text-muted-foreground">{request.email}</p>
                    </td>
                    <td className="px-4 py-3">{ROLE_META[request.requestedRole].label}</td>
                    <td className="px-4 py-3 text-muted-foreground">{request.workspace}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => rejectRequest(request.id)}>
                          Reject
                        </Button>
                        <Button size="sm" onClick={() => approveRequest(request.id)}>
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
