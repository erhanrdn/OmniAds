"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface InvitePayload {
  invite: {
    email: string;
    role: "admin" | "collaborator" | "guest";
    status: "pending" | "accepted" | "revoked" | "expired";
  };
}

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token ?? "");
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InvitePayload["invite"] | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadInvite() {
      setLoading(true);
      const res = await fetch(`/api/invite/${token}`);
      const json = (await res.json().catch(() => null)) as InvitePayload | { message?: string } | null;
      if (!mounted) return;
      if (!res.ok || !json || !("invite" in json)) {
        setError((json as { message?: string } | null)?.message ?? "Invalid invite.");
      } else {
        setInvite(json.invite);
      }
      setLoading(false);
    }
    if (token) loadInvite();
    return () => {
      mounted = false;
    };
  }, [token]);

  async function acceptInvite() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/invite/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });
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
          <p className="mt-2 text-sm text-muted-foreground">{error ?? "Invite link is invalid."}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-5">
        <div>
          <h1 className="text-lg font-semibold">Accept team invite</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You are invited as <span className="font-medium text-foreground">{invite.role}</span> for{" "}
            <span className="font-medium text-foreground">{invite.email}</span>.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Name</label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            placeholder="Your full name"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Password</label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            placeholder="At least 8 characters"
          />
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <div className="flex justify-end">
          <Button onClick={acceptInvite} disabled={submitting}>
            {submitting ? "Accepting..." : "Accept invite"}
          </Button>
        </div>
      </div>
    </main>
  );
}

