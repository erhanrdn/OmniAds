"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Shield, User, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

type TeamRole = "guest" | "collaborator" | "admin";
type TeamTab = "invite" | "requests" | "members";

interface TeamAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ApiMember {
  id: string;
  name: string | null;
  email: string;
  role: TeamRole;
  status: string;
}

interface ApiAccessRequest {
  id: string;
  name: string | null;
  email: string;
  role: TeamRole;
}

interface CreatedInvite {
  id: string;
  email: string;
  role: TeamRole;
  inviteUrl: string;
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

function parseEmails(raw: string): string[] {
  return raw
    .split(/[,\n;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function TeamAccessModal({ open, onOpenChange }: TeamAccessModalProps) {
  const businessId = useAppStore((s) => s.selectedBusinessId);

  const [activeTab, setActiveTab] = useState<TeamTab>("invite");

  // Invite tab
  const [inviteInput, setInviteInput] = useState("");
  const [role, setRole] = useState<TeamRole>("collaborator");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [createdInvites, setCreatedInvites] = useState<CreatedInvite[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Members tab
  const [members, setMembers] = useState<ApiMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [memberMessage, setMemberMessage] = useState<string | null>(null);

  // Requests tab
  const [requests, setRequests] = useState<ApiAccessRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);

  const inviteEmails = parseEmails(inviteInput);

  const fetchMembers = useCallback(async () => {
    if (!businessId) {
      setMembers([]);
      setMembersError(null);
      return;
    }
    setMembersLoading(true);
    setMembersError(null);
    try {
      const res = await fetch(`/api/team/members?businessId=${businessId}`);
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setMembersError(
          (data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string"
            ? (data as { message: string }).message
            : null) ?? "Could not load members."
        );
        return;
      }
      setMembers(
        Array.isArray((data as { members?: unknown }).members)
          ? ((data as { members: ApiMember[] }).members)
          : []
      );
    } catch {
      setMembersError("Network error loading members.");
    } finally {
      setMembersLoading(false);
    }
  }, [businessId]);

  const fetchRequests = useCallback(async () => {
    if (!businessId) {
      setRequests([]);
      setRequestsError(null);
      return;
    }
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const res = await fetch(`/api/team/access-requests?businessId=${businessId}`);
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 403) {
          setRequests([]);
          return;
        }
        setRequestsError(
          (data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string"
            ? (data as { message: string }).message
            : null) ?? "Could not load access requests."
        );
        return;
      }
      setRequests(
        Array.isArray((data as { requests?: unknown }).requests)
          ? ((data as { requests: ApiAccessRequest[] }).requests)
          : []
      );
    } catch {
      setRequestsError("Network error loading access requests.");
    } finally {
      setRequestsLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    if (!open) return;
    fetchMembers();
    fetchRequests();
  }, [open, fetchMembers, fetchRequests]);

  useEffect(() => {
    if (!open) {
      setInviteInput("");
      setCreatedInvites([]);
      setInviteError(null);
      setCopiedId(null);
    }
  }, [open]);

  useEffect(() => {
    setMemberMessage(null);
    setRequestMessage(null);
    if (!businessId) {
      setMembers([]);
      setRequests([]);
      setCreatedInvites([]);
    }
  }, [businessId]);

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
      setInviteError("Enter at least one valid email address.");
      return;
    }
    if (!businessId) {
      setInviteError("No business selected.");
      return;
    }
    setInviteLoading(true);
    setInviteError(null);
    try {
      const res = await fetch("/api/team/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, emails: inviteEmails, role }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setInviteError(
          (data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string"
            ? (data as { message: string }).message
            : null) ?? "Could not create invite links."
        );
        return;
      }
      setCreatedInvites(
        Array.isArray((data as { invites?: unknown }).invites)
          ? ((data as { invites: CreatedInvite[] }).invites)
          : []
      );
      setInviteInput("");
    } catch {
      setInviteError("Network error. Please try again.");
    } finally {
      setInviteLoading(false);
    }
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    } catch {
      // clipboard API unavailable — user can copy manually from the displayed URL
    }
  }

  async function handleRoleChange(membershipId: string, nextRole: TeamRole) {
    setMemberMessage(null);
    try {
      const res = await fetch("/api/team/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, membershipId, role: nextRole }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setMemberMessage(
          (data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string"
            ? (data as { message: string }).message
            : null) ?? "Could not update role."
        );
        return;
      }
      setMemberMessage("Member role updated.");
      await fetchMembers();
    } catch {
      setMemberMessage("Network error.");
    }
  }

  async function handleRemoveMember(membershipId: string) {
    setMemberMessage(null);
    try {
      const res = await fetch("/api/team/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, membershipId }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setMemberMessage(
          (data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string"
            ? (data as { message: string }).message
            : null) ?? "Could not remove member."
        );
        return;
      }
      setMemberMessage("Member removed.");
      await fetchMembers();
    } catch {
      setMemberMessage("Network error.");
    }
  }

  async function handleRequestAction(membershipId: string, action: "approve" | "reject") {
    setRequestMessage(null);
    try {
      const res = await fetch("/api/team/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, membershipId, action }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setRequestMessage(
          (data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string"
            ? (data as { message: string }).message
            : null) ?? "Could not process request."
        );
        return;
      }
      setRequestMessage(action === "approve" ? "Access request approved." : "Access request rejected.");
      await fetchRequests();
    } catch {
      setRequestMessage("Network error.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl border bg-background shadow-2xl">
        {/* Header */}
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

        {/* Tabs */}
        <div className="flex gap-1 border-b px-5 pt-2">
          {(["invite", "requests", "members"] as TeamTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                "rounded-t-md px-3 py-2 text-sm",
                activeTab === tab
                  ? "border-b-2 border-foreground font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "invite" ? "Invite people" : tab === "requests" ? "Requested access" : "Members"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-y-auto p-5">

          {/* INVITE TAB */}
          {activeTab === "invite" && (
            <div className="space-y-4">
              {createdInvites.length > 0 ? (
                /* Results: show generated invite links */
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
                    <Check className="h-4 w-4" />
                    {createdInvites.length === 1
                      ? "Invite link created."
                      : `${createdInvites.length} invite links created.`}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Copy each link and share it directly with your teammate. Links expire in 7 days.
                  </p>
                  <div className="space-y-2">
                    {createdInvites.map((invite) => (
                      <div
                        key={invite.id}
                        className="flex items-center justify-between gap-3 rounded-lg border p-3"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <p className="truncate text-sm font-medium">{invite.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {ROLE_META[invite.role]?.title ?? invite.role}
                          </p>
                          <p className="truncate font-mono text-[11px] text-muted-foreground">
                            {invite.inviteUrl}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(invite.inviteUrl, invite.id)}
                          className="flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs hover:bg-accent"
                        >
                          {copiedId === invite.id ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          {copiedId === invite.id ? "Copied" : "Copy link"}
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setCreatedInvites([])}>
                    Create more invites
                  </Button>
                </div>
              ) : (
                /* Invite form */
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Email addresses
                    </label>
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
                            role === item
                              ? "border-primary bg-primary/5"
                              : "hover:border-muted-foreground/30"
                          )}
                        >
                          <p className="text-sm font-medium">{ROLE_META[item].title}</p>
                          <p className="text-xs text-muted-foreground">
                            {ROLE_META[item].description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {inviteError && (
                    <p className="text-xs text-destructive">{inviteError}</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* REQUESTS TAB */}
          {activeTab === "requests" && (
            <div className="space-y-3">
              {requestsLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : requestsError ? (
                <p className="text-sm text-destructive">{requestsError}</p>
              ) : requests.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center">
                  <p className="text-sm font-medium">No pending access requests.</p>
                  <p className="text-xs text-muted-foreground">
                    New access requests will appear here.
                  </p>
                </div>
              ) : (
                requests.map((request) => (
                  <div
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                  >
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{request.name ?? request.email}</p>
                      <p className="text-xs text-muted-foreground">{request.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Requested role:{" "}
                        <span className="font-medium text-foreground">
                          {ROLE_META[request.role]?.title ?? request.role}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRequestAction(request.id, "reject")}
                      >
                        Reject
                      </Button>
                      <Button size="sm" onClick={() => handleRequestAction(request.id, "approve")}>
                        Approve
                      </Button>
                    </div>
                  </div>
                ))
              )}
              {requestMessage && (
                <p className="mt-2 text-xs text-emerald-600">
                  <Check className="mr-1 inline h-3.5 w-3.5" />
                  {requestMessage}
                </p>
              )}
            </div>
          )}

          {/* MEMBERS TAB */}
          {activeTab === "members" && (
            <div className="space-y-2">
              {membersLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : membersError ? (
                <p className="text-sm text-destructive">{membersError}</p>
              ) : members.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center">
                  <p className="text-sm font-medium">No team members yet.</p>
                  <p className="text-xs text-muted-foreground">
                    Invite teammates to see them here.
                  </p>
                </div>
              ) : (
                members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 rounded-xl border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{member.name ?? member.email}</p>
                      <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {ROLE_META[member.role]?.title ?? member.role}
                        {member.status === "pending" ? " • Pending" : ""}
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
                        <DropdownMenuItem
                          onClick={() => handleRoleChange(member.id, "collaborator")}
                        >
                          <Users className="h-4 w-4" />
                          Change role to Collaborator
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRoleChange(member.id, "admin")}>
                          <Shield className="h-4 w-4" />
                          Change role to Admin
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleRemoveMember(member.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          Remove access
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))
              )}
              {memberMessage && (
                <p className="mt-2 text-xs text-emerald-600">
                  <Check className="mr-1 inline h-3.5 w-3.5" />
                  {memberMessage}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t px-5 py-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={inviteLoading}
          >
            {activeTab === "invite" && createdInvites.length === 0 ? "Cancel" : "Close"}
          </Button>
          {activeTab === "invite" && createdInvites.length === 0 && (
            <Button
              onClick={handleInvite}
              disabled={inviteLoading || inviteEmails.length === 0}
            >
              {inviteLoading ? "Creating..." : "Create invite links"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
