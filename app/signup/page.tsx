"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { logClientAuthEvent } from "@/lib/auth-diagnostics";
import { resolvePostLoginDestination } from "@/lib/auth-routing";
import { replaceAuthenticatedWorkspace } from "@/lib/client-auth-state";

interface SignupResponse {
  authenticated?: boolean;
  user?: {
    id: string;
  };
  businesses?: Array<{
    id: string;
    name: string;
    timezone: string;
    currency: string;
    isDemoBusiness?: boolean;
    industry?: string;
    platform?: string;
  }>;
  activeBusinessId?: string | null;
  message?: string;
}

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

  useEffect(() => {
    const controller = new AbortController();
    async function restoreExistingSession() {
      const response = await fetch("/api/auth/me", {
        cache: "no-store",
        signal: controller.signal,
      }).catch(() => null);
      if (!response?.ok) return;
      const payload = (await response.json().catch(() => null)) as SignupResponse | null;
      if (!payload?.authenticated || !payload.user?.id) return;

      replaceAuthenticatedWorkspace({
        userId: payload.user.id,
        businesses: (payload.businesses ?? []).map((business) => ({
          id: business.id,
          name: business.name,
          timezone: business.timezone,
          currency: business.currency,
          isDemoBusiness: business.isDemoBusiness,
          industry: business.industry,
          platform: business.platform,
        })),
        activeBusinessId: payload.activeBusinessId ?? null,
      });

      router.replace(
        resolvePostLoginDestination({
          businesses: payload.businesses ?? [],
          activeBusinessId: payload.activeBusinessId ?? null,
          nextPath: searchParams.get("next"),
        })
      );
      router.refresh();
    }

    void restoreExistingSession();
    return () => controller.abort();
  }, [router, searchParams]);

  async function handleSignup() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, businessName, inviteToken: inviteToken || undefined }),
      });
      const payload = (await res.json().catch(() => null)) as SignupResponse | null;
      if (!res.ok) throw new Error(payload?.message ?? "Could not create account.");
      if (payload?.user?.id) {
        replaceAuthenticatedWorkspace({
          userId: payload.user.id,
          businesses: (payload.businesses ?? []).map((business) => ({
            id: business.id,
            name: business.name,
            timezone: business.timezone,
            currency: business.currency,
            isDemoBusiness: business.isDemoBusiness,
            industry: business.industry,
            platform: business.platform,
          })),
          activeBusinessId: payload.activeBusinessId ?? null,
        });
      }
      const destination = resolvePostLoginDestination({
        businesses: payload?.businesses ?? [],
        activeBusinessId: payload?.activeBusinessId ?? null,
        nextPath: searchParams.get("next"),
      });
      logClientAuthEvent("signup_succeeded", {
        destination,
        userId: payload?.user?.id ?? null,
        membershipCount: payload?.businesses?.length ?? 0,
      });
      router.push(destination);
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not create account.";
      setError(message);
      logClientAuthEvent("signup_failed", { email, message });
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
