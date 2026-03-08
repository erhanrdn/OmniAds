"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

function SignupPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite") ?? "";
  const inviteEmail = searchParams.get("email") ?? "";
  const [name, setName] = useState("");
  const [email, setEmail] = useState(inviteEmail);
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignup() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, businessName, inviteToken: inviteToken || undefined }),
      });
      const payload = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(payload?.message ?? "Could not create account.");
      router.push("/overview");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not create account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
          <p className="text-sm text-muted-foreground">
            {inviteToken
              ? "Create your account to accept this team invite."
              : "Sign up and create your first business workspace."}
          </p>
        </div>

        <div className="space-y-3">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            placeholder="Full name"
          />
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            placeholder="Email"
            disabled={Boolean(inviteEmail)}
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            placeholder="Password (min 8 chars)"
          />
          <input
            value={businessName}
            onChange={(event) => setBusinessName(event.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            placeholder="Business name"
            disabled={Boolean(inviteToken)}
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <Button onClick={handleSignup} disabled={loading} className="w-full">
            {loading ? "Creating account..." : "Sign up"}
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-foreground underline underline-offset-2">
            Sign in
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function SignupPageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold">Loading sign up…</h1>
        <p className="mt-2 text-sm text-muted-foreground">Preparing invite and auth context.</p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupPageFallback />}>
      <SignupPageClient />
    </Suspense>
  );
}
