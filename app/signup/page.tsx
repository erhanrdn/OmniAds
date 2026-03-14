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
      const payload = (await response
        .json()
        .catch(() => null)) as SignupResponse | null;
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
        }),
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
        body: JSON.stringify({
          name,
          email,
          password,
          businessName,
          inviteToken: inviteToken || undefined,
        }),
      });
      const payload = (await res
        .json()
        .catch(() => null)) as SignupResponse | null;
      if (!res.ok)
        throw new Error(payload?.message ?? "Could not create account.");
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
      const message =
        err instanceof Error ? err.message : "Could not create account.";
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
          <h1 className="text-2xl font-semibold tracking-tight">
            Create account
          </h1>
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

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                or
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => {
              window.location.href = "/api/oauth/sign-with-google/start";
            }}
            disabled={loading}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Sign up with Google
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-foreground underline underline-offset-2"
          >
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
        <p className="mt-2 text-sm text-muted-foreground">
          Preparing invite and auth context.
        </p>
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
