"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { logClientAuthEvent } from "@/lib/auth-diagnostics";
import { resolvePostLoginDestination } from "@/lib/auth-routing";
import { replaceAuthenticatedWorkspace } from "@/lib/client-auth-state";
import { BrandLogo } from "@/components/brand/BrandLogo";
import {
  getLanguageFromCookieValue,
  getPreferredLanguage,
  getTranslations,
  LANGUAGE_COOKIE_NAME,
} from "@/lib/i18n";
import { usePreferencesStore } from "@/store/preferences-store";

const REMEMBER_EMAIL_KEY = "omniads.remember_email";

function getLanguageCookie() {
  return document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${LANGUAGE_COOKIE_NAME}=`))
    ?.split("=")[1];
}

interface LoginResponse {
  user?: {
    id: string;
    language?: "en" | "tr";
  };
  businesses?: Array<{
    id: string;
    name: string;
    timezone: string | null;
    timezoneSource?: "shopify" | "ga4" | null;
    currency: string;
    isDemoBusiness?: boolean;
    industry?: string;
    platform?: string;
  }>;
  activeBusinessId?: string | null;
  authenticated?: boolean;
  message?: string;
}

function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const language = usePreferencesStore((state) => state.language);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);
  const t = getTranslations(language).login;

  useEffect(() => {
    setLanguage(getLanguageFromCookieValue(getLanguageCookie()));
  }, [setLanguage]);

  useEffect(() => {
    const inviteEmail = searchParams.get("email");
    if (inviteEmail) {
      setEmail(inviteEmail);
      return;
    }
    const googleError = searchParams.get("error");
    if (googleError) {
      setError(googleError);
    }
    try {
      const rememberedEmail = window.localStorage.getItem(REMEMBER_EMAIL_KEY);
      if (rememberedEmail) {
        setEmail(rememberedEmail);
        setRememberMe(true);
      }
    } catch {
      // no-op
    }
  }, [searchParams]);

  useEffect(() => {
    const controller = new AbortController();
    async function restoreExistingSession() {
      let response: Response | null = null;
      try {
        response = await fetch("/api/auth/me", {
          cache: "no-store",
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        return;
      }
      if (!response?.ok) return;
      const payload = (await response.json().catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return null;
        return null;
      })) as LoginResponse | null;
      if (!payload?.authenticated || !payload.user?.id) return;
      setLanguage(
        getPreferredLanguage({
          userLanguage: payload.user.language,
          cookieLanguage: getLanguageCookie(),
        })
      );

      replaceAuthenticatedWorkspace({
        userId: payload.user.id,
        businesses: (payload.businesses ?? []).map((business) => ({
          id: business.id,
          name: business.name,
          timezone: business.timezone,
          timezoneSource: business.timezoneSource ?? null,
          currency: business.currency,
          isDemoBusiness: business.isDemoBusiness,
          industry: business.industry,
          platform: business.platform,
        })),
        activeBusinessId: payload.activeBusinessId ?? null,
      });

      const destination = resolvePostLoginDestination({
        businesses: payload.businesses ?? [],
        activeBusinessId: payload.activeBusinessId ?? null,
        nextPath: searchParams.get("next"),
      });
      logClientAuthEvent("login_page_redirect_existing_session", {
        destination,
        userId: payload.user.id,
      });
      router.replace(destination);
      router.refresh();
    }

    void restoreExistingSession();
    return () => controller.abort();
  }, [router, searchParams]);

  async function handleLogin() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await res
        .json()
        .catch(() => null)) as LoginResponse | null;
      if (!res.ok) {
        throw new Error(payload?.message ?? "Could not sign in.");
      }
      const inviteToken = searchParams.get("invite");
      if (inviteToken) {
        const acceptRes = await fetch(`/api/invite/${inviteToken}`, {
          method: "POST",
        });
        const acceptPayload = (await acceptRes.json().catch(() => null)) as {
          message?: string;
        } | null;
        if (!acceptRes.ok) {
          throw new Error(
            acceptPayload?.message ??
              "Signed in, but invite could not be accepted.",
          );
        }
      }
      try {
        if (rememberMe && email.trim()) {
          window.localStorage.setItem(REMEMBER_EMAIL_KEY, email.trim());
        } else {
          window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
        }
      } catch {
        // no-op
      }
      if (payload?.user?.id) {
        setLanguage(
          getPreferredLanguage({
            userLanguage: payload.user.language,
            cookieLanguage: getLanguageCookie(),
          })
        );
        replaceAuthenticatedWorkspace({
          userId: payload.user.id,
          businesses: (payload.businesses ?? []).map((business) => ({
            id: business.id,
            name: business.name,
            timezone: business.timezone,
            timezoneSource: business.timezoneSource ?? null,
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
      logClientAuthEvent("login_succeeded", {
        destination,
        userId: payload?.user?.id ?? null,
        membershipCount: payload?.businesses?.length ?? 0,
        activeBusinessId: payload?.activeBusinessId ?? null,
      });
      router.push(destination);
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not sign in.";
      setError(message);
      logClientAuthEvent("login_failed", { email, message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <BrandLogo
            className="justify-center"
            markClassName="h-16 w-16"
            textClassName="text-2xl"
            size={64}
          />
          <p className="text-muted-foreground text-sm">
            {t.subtitle}
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="email">
              {t.email}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="password">
              {t.password}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              className="h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span>{t.rememberMe}</span>
          </label>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <Button className="w-full" onClick={handleLogin} disabled={loading}>
            {loading ? t.signingIn : t.signIn}
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
              const url = nextParam
                ? `/api/oauth/sign-with-google/start?next=${encodeURIComponent(nextParam)}`
                : "/api/oauth/sign-with-google/start";
              window.location.href = url;
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
            {t.signInWithGoogle}
          </Button>

        </div>

        <p className="text-center text-xs text-muted-foreground">
          {t.noAccount}{" "}
          <Link
            href={nextParam ? `/signup?next=${encodeURIComponent(nextParam)}` : "/signup"}
            className="text-foreground underline underline-offset-2"
          >
            {t.createOne}
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function LoginPageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold">Loading sign in…</h1>
        <p className="text-sm text-muted-foreground">
          Preparing authentication flow.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageClient />
    </Suspense>
  );
}
