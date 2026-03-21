"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface InvitePayload {
  invite: {
    email: string;
    role: "admin" | "collaborator" | "guest";
    status: "pending" | "accepted" | "revoked" | "expired";
    expiresAt?: string;
    workspaces?: Array<{ id: string; name: string }>;
  };
}

interface MePayload {
  authenticated: boolean;
  user?: { email: string };
}

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token ?? "");
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InvitePayload["invite"] | null>(null);
  const [me, setMe] = useState<MePayload | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      const [inviteRes, meRes] = await Promise.all([
        fetch(`/api/invite/${token}`, { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);
      const inviteJson = (await inviteRes.json().catch(() => null)) as
        | InvitePayload
        | { message?: string }
        | null;
      const meJson = (await meRes.json().catch(() => null)) as MePayload | null;
      if (!mounted) return;
      if (!inviteRes.ok || !inviteJson || !("invite" in inviteJson)) {
        setError((inviteJson as { message?: string } | null)?.message ?? "Invite link is invalid or expired.");
      } else {
        setInvite(inviteJson.invite);
      }
      setMe(meJson);
      setLoading(false);
    }
    if (token) load();
    return () => {
      mounted = false;
    };
  }, [token]);

  async function acceptInvite() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/invite/${token}`, { method: "POST" });
    const json = (await res.json().catch(() => null)) as { message?: string } | null;
    if (!res.ok) {
      setError(json?.message ?? "Could not accept invite.");
      setSubmitting(false);
      return;
    }
    router.push("/overview");
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center text-sm">Loading invite…</main>;
  }

  if (!invite) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl border bg-card p-5 text-center">
          <h1 className="text-lg font-semibold">Invite unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error ?? "Invite link is invalid or expired."}</p>
        </div>
      </main>
    );
  }

  const isAuthed = Boolean(me?.authenticated);
  const emailMatch = !isAuthed || me?.user?.email?.toLowerCase() === invite.email.toLowerCase();

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-5">
        <div>
          <h1 className="text-lg font-semibold">Accept team invite</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You are invited as <span className="font-medium text-foreground capitalize">{invite.role}</span> to the following workspace{invite.workspaces && invite.workspaces.length > 1 ? "s" : ""}:
          </p>
        </div>

        {invite.workspaces && invite.workspaces.length > 0 ? (
          <ul className="rounded-lg border bg-muted/30 px-4 py-2 space-y-1">
            {invite.workspaces.map((ws) => (
              <li key={ws.id} className="text-sm font-medium">{ws.name}</li>
            ))}
          </ul>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Invite for: <span className="font-medium text-foreground">{invite.email}</span>
          {invite.expiresAt ? ` · Expires ${new Date(invite.expiresAt).toLocaleDateString()}` : ""}
        </p>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        {!isAuthed ? (
          <div className="space-y-2">
            <Button asChild className="w-full">
              <Link href={`/login?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(invite.email)}`}>
                Sign in to accept
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/signup?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(invite.email)}`}>
                Create account and accept
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {!emailMatch ? (
              <p className="text-xs text-destructive">
                This invite is for {invite.email}. Please sign in with that email.
              </p>
            ) : null}
            <Button onClick={acceptInvite} disabled={submitting || !emailMatch} className="w-full">
              {submitting ? "Accepting..." : "Accept invite"}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
