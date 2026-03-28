"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthBootstrap } from "@/components/layout/auth-bootstrap";
import { BusinessForm } from "@/components/business/BusinessForm";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app-store";
import { applyAuthenticatedWorkspace } from "@/lib/client-auth-state";
import { sanitizeNextPath } from "@/lib/auth-routing";

const SHOPIFY_APP_STORE_URL = "https://apps.shopify.com/adsecute";

interface ContextPayload {
  context?: {
    token: string;
    shopDomain: string;
    shopName: string | null;
    returnTo: string;
    preferredBusinessId: string | null;
    createdAt: string;
    expiresAt: string;
    currency: string | null;
  };
  message?: string;
}

interface AuthPayload {
  authenticated: boolean;
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
}

function AuthPrompt({ nextPath }: { nextPath: string }) {
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Sign in to continue</h2>
      <p className="text-sm text-muted-foreground">
        Shopify installed Adsecute successfully. Sign in to choose which workspace should receive this store connection.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>
          <Button>Sign in</Button>
        </Link>
        <Link href={`/signup?next=${encodeURIComponent(nextPath)}`}>
          <Button variant="outline">Create account</Button>
        </Link>
      </div>
    </div>
  );
}

export default function ShopifyConnectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const businesses = useAppStore((state) => state.businesses);

  const [auth, setAuth] = useState<AuthPayload | null>(null);
  const [contextPayload, setContextPayload] = useState<ContextPayload | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [contextLoading, setContextLoading] = useState(false);
  const [pendingBusinessId, setPendingBusinessId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contextToken = searchParams.get("context") ?? "";
  const queryReturnTo = sanitizeNextPath(searchParams.get("returnTo")) ?? "/integrations";
  const nextPath = useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `/shopify/connect?${qs}` : "/shopify/connect";
  }, [searchParams]);

  useEffect(() => {
    if (!hasHydrated) return;
    let cancelled = false;
    setAuthLoading(true);
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json().catch(() => null).then((payload) => ({ ok: res.ok, payload })))
      .then(({ ok, payload }) => {
        if (cancelled) return;
        if (!ok || !payload?.authenticated) {
          setAuth({ authenticated: false });
          return;
        }
        setAuth(payload as AuthPayload);
        if (payload?.user?.id) {
          applyAuthenticatedWorkspace({
            userId: payload.user.id,
            businesses: payload.businesses ?? [],
            activeBusinessId: payload.activeBusinessId ?? null,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuth({ authenticated: false });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAuthLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hasHydrated]);

  useEffect(() => {
    if (!contextToken) {
      setContextPayload(null);
      return;
    }
    let cancelled = false;
    setContextLoading(true);
    fetch(`/api/oauth/shopify/context?token=${encodeURIComponent(contextToken)}`, {
      cache: "no-store",
    })
      .then((res) => res.json().catch(() => null).then((payload) => ({ ok: res.ok, payload })))
      .then(({ ok, payload }) => {
        if (cancelled) return;
        if (!ok) {
          setContextPayload(payload as ContextPayload);
          setError((payload as { message?: string } | null)?.message ?? "Shopify install context expired.");
          return;
        }
        setContextPayload(payload as ContextPayload);
        const preferred = (payload as ContextPayload).context?.preferredBusinessId ?? null;
        if (preferred) {
          setPendingBusinessId(preferred);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load Shopify install context.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setContextLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [contextToken]);

  async function refreshWorkspaceState() {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as AuthPayload | null;
    if (!response.ok || !payload?.authenticated || !payload.user?.id) {
      return null;
    }
    applyAuthenticatedWorkspace({
      userId: payload.user.id,
      businesses: payload.businesses ?? [],
      activeBusinessId: payload.activeBusinessId ?? null,
    });
    setAuth(payload);
    return payload;
  }

  async function finalizeConnection(targetBusinessId: string) {
    if (!contextToken) return;
    setBusy(true);
    setError(null);
    const response = await fetch("/api/oauth/shopify/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: contextToken,
        businessId: targetBusinessId,
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          status?: string;
          businessId?: string;
          returnTo?: string;
          integration?: { id: string };
          message?: string;
        }
      | null;
    setBusy(false);

    if (!response.ok || payload?.status !== "success" || !payload.businessId) {
      setError(payload?.message ?? "Could not finalize Shopify connection.");
      return;
    }

    await refreshWorkspaceState();
    const callbackUrl = new URL("/integrations/callback/shopify", window.location.origin);
    callbackUrl.searchParams.set("status", "success");
    callbackUrl.searchParams.set("businessId", payload.businessId);
    if (payload.integration?.id) {
      callbackUrl.searchParams.set("integrationId", payload.integration.id);
    }
    callbackUrl.searchParams.set("returnTo", payload.returnTo ?? queryReturnTo);
    router.replace(`${callbackUrl.pathname}?${callbackUrl.searchParams.toString()}`);
  }

  async function createBusinessAndFinalize(input: {
    name: string;
    timezone: string;
    currency: string;
  }) {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/businesses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          business?: { id: string };
          message?: string;
        }
      | null;
    if (!response.ok || !payload?.business?.id) {
      setBusy(false);
      setError(payload?.message ?? "Could not create workspace.");
      return;
    }
    await refreshWorkspaceState();
    await finalizeConnection(payload.business.id);
  }

  const context = contextPayload?.context;

  return (
    <>
      <AuthBootstrap />
      <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-10">
        <div className="w-full space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Shopify Connect
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {context ? "Choose a workspace for this Shopify store" : "Connect a Shopify store"}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {context
                ? "Your Shopify install reached Adsecute successfully. Pick the workspace that should own this store connection."
                : "Shopify installation must start from Shopify App Store or Shopify Admin. Come back here only after Shopify redirects you back with an install context."}
            </p>
          </div>

          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {contextLoading || authLoading || !hasHydrated ? (
            <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">
              Preparing Shopify connection context...
            </div>
          ) : context ? (
            auth?.authenticated ? (
              <div className="space-y-4">
                <div className="rounded-2xl border bg-card p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{context.shopName ?? context.shopDomain}</h2>
                      <p className="text-sm text-muted-foreground">{context.shopDomain}</p>
                    </div>
                    <div className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                      {context.currency ? `Currency: ${context.currency}` : "Awaiting workspace selection"}
                    </div>
                  </div>
                </div>

                {businesses.length === 0 ? (
                  <div className="rounded-2xl border bg-card p-5 shadow-sm">
                    <h2 className="text-lg font-semibold">Create a workspace first</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      We need one workspace to attach this Shopify install.
                    </p>
                    <div className="mt-4">
                      <BusinessForm onSubmit={createBusinessAndFinalize} />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border bg-card p-5 shadow-sm">
                    <h2 className="text-lg font-semibold">Available workspaces</h2>
                    <div className="mt-4 grid gap-3">
                      {businesses.map((business) => {
                        const recommended =
                          context.preferredBusinessId &&
                          context.preferredBusinessId === business.id;
                        return (
                          <button
                            key={business.id}
                            type="button"
                            onClick={() => {
                              setPendingBusinessId(business.id);
                              void finalizeConnection(business.id);
                            }}
                            disabled={busy}
                            className="flex items-center justify-between rounded-xl border px-4 py-3 text-left transition hover:border-foreground/30 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <div>
                              <p className="font-medium">{business.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {business.timezone} · {business.currency}
                              </p>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {busy && pendingBusinessId === business.id
                                ? "Connecting..."
                                : recommended
                                  ? "Recommended"
                                  : "Use workspace"}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <AuthPrompt nextPath={nextPath} />
            )
          ) : (
            <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">Start from Shopify</h2>
                <p className="text-sm text-muted-foreground">
                  Install Adsecute from a Shopify-owned surface first. After Shopify redirects back, this page will let the merchant log in and choose the workspace that should receive the store connection.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <a
                  href={SHOPIFY_APP_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium"
                >
                  Open App Store listing
                </a>
              </div>
              <p className="text-sm text-muted-foreground">
                If the install already finished but this page does not show a pending store, the install context may have expired and should be restarted from Shopify.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
