"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Mail, Shield, User, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type TeamRole = "guest" | "collaborator" | "admin";
type TeamTab = "invite" | "requests" | "members";

interface TeamAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AccessRequest {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  scope: string;
}

interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  scope: string;
  status: "active" | "pending";
}

const ROLE_META: Record<TeamRole, { title: string; description: string }> = {
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

const INITIAL_REQUESTS: AccessRequest[] = [
  {
    id: "req-1",
    name: "Mia Carter",
    email: "mia@acme.com",
    role: "collaborator",
    scope: "Facebook Ecommerce",
  },
];

const INITIAL_MEMBERS: MemberRow[] = [
  {
    id: "mem-1",
    name: "Admin",
    email: "admin@omniads.io",
    role: "admin",
    scope: "All businesses",
    status: "active",
  },
  {
    id: "mem-2",
    name: "Liam Brooks",
    email: "liam@acme.com",
    role: "collaborator",
    scope: "Facebook Ecommerce",
    status: "active",
  },
  {
    id: "mem-3",
    name: "Ava Wells",
    email: "ava@acme.com",
    role: "guest",
    scope: "Fashion Catalog",
    status: "pending",
  },
];

function parseEmails(raw: string): string[] {
  return raw
    .split(/[,\n;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function TeamAccessModal({ open, onOpenChange }: TeamAccessModalProps) {
  const [activeTab, setActiveTab] = useState<TeamTab>("invite");
  const [inviteInput, setInviteInput] = useState("");
  const [role, setRole] = useState<TeamRole>("collaborator");
  const [requests, setRequests] = useState<AccessRequest[]>(INITIAL_REQUESTS);
  const [members, setMembers] = useState<MemberRow[]>(INITIAL_MEMBERS);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const inviteEmails = useMemo(() => parseEmails(inviteInput), [inviteInput]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  if (!open) return null;

  async function handleInvite() {
    if (inviteEmails.length === 0) {
      setMessage({ type: "error", text: "Enter at least one valid email address." });
      return;
    }
    setLoading(true);
    setMessage(null);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setLoading(false);
    setInviteInput("");
    setMessage({
      type: "success",
      text: `Invitation sent to ${inviteEmails.length} ${inviteEmails.length === 1 ? "person" : "people"}.`,
    });
  }

  function handleApproveRequest(requestId: string) {
    setRequests((prev) => prev.filter((item) => item.id !== requestId));
    setMessage({ type: "success", text: "Access request approved." });
  }

  function handleRejectRequest(requestId: string) {
    setRequests((prev) => prev.filter((item) => item.id !== requestId));
    setMessage({ type: "success", text: "Access request rejected." });
  }

  function handleRoleChange(memberId: string, nextRole: TeamRole) {
    setMembers((prev) =>
      prev.map((member) => (member.id === memberId ? { ...member, role: nextRole } : member))
    );
    setMessage({ type: "success", text: "Member role updated." });
  }

  function handleRemoveAccess(memberId: string) {
    setMembers((prev) => prev.filter((member) => member.id !== memberId));
    setMessage({ type: "success", text: "Member access removed." });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Team access</h2>
            <p className="text-xs text-muted-foreground">
              Invite teammates and manage workspace/business permissions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close team access modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1 border-b px-5 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab("invite")}
            className={cn(
              "rounded-t-md px-3 py-2 text-sm",
              activeTab === "invite"
                ? "border-b-2 border-foreground font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Invite people
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
            Requested access
          </button>
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
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {activeTab === "invite" ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Email addresses</label>
                <textarea
                  value={inviteInput}
                  onChange={(event) => setInviteInput(event.target.value)}
                  rows={3}
                  placeholder="name@company.com, teammate@company.com"
                  className="w-full rounded-lg border bg-background p-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                />
                <p className="text-[11px] text-muted-foreground">
                  Add one or multiple emails separated by comma, space, or new line.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Role</p>
                <div className="grid gap-2">
                  {(["guest", "collaborator", "admin"] as TeamRole[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setRole(item)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left",
                        role === item ? "border-primary bg-primary/5" : "hover:border-muted-foreground/30"
                      )}
                    >
                      <p className="text-sm font-medium">{ROLE_META[item].title}</p>
                      <p className="text-xs text-muted-foreground">{ROLE_META[item].description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "requests" ? (
            <div className="space-y-3">
              {requests.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center">
                  <p className="text-sm font-medium">No pending requests</p>
                  <p className="text-xs text-muted-foreground">New access requests will appear here.</p>
                </div>
              ) : (
                requests.map((request) => (
                  <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{request.name}</p>
                      <p className="text-xs text-muted-foreground">{request.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Requested role: <span className="font-medium text-foreground">{ROLE_META[request.role].title}</span> • {request.scope}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleRejectRequest(request.id)}>
                        Reject
                      </Button>
                      <Button size="sm" onClick={() => handleApproveRequest(request.id)}>
                        Approve
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : null}

          {activeTab === "members" ? (
            <div className="space-y-2">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{member.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_META[member.role].title} • {member.scope}
                      {member.status === "pending" ? " • Pending invite" : ""}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        Manage
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => handleRoleChange(member.id, "guest")}>
                        <User className="h-4 w-4" />
                        Change role to Guest
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleRoleChange(member.id, "collaborator")}>
                        <Users className="h-4 w-4" />
                        Change role to Collaborator
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleRoleChange(member.id, "admin")}>
                        <Shield className="h-4 w-4" />
                        Change role to Admin
                      </DropdownMenuItem>
                      {member.status === "pending" ? (
                        <DropdownMenuItem onClick={() => setMessage({ type: "success", text: "Invitation resent." })}>
                          <Mail className="h-4 w-4" />
                          Resend invite
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem
                        onClick={() => handleRemoveAccess(member.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        Remove access
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          ) : null}

          {message ? (
            <p className={cn("mt-4 text-xs", message.type === "success" ? "text-emerald-600" : "text-destructive")}>
              {message.type === "success" ? <Check className="mr-1 inline h-3.5 w-3.5" /> : null}
              {message.text}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          {activeTab === "invite" ? (
            <Button onClick={handleInvite} disabled={loading}>
              {loading ? "Inviting..." : "Invite"}
            </Button>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          )}
        </div>
      </div>
    </div>
  );
}
