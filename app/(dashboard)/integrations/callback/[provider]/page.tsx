"use client";

import { Suspense, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAppStore } from "@/store/app-store";
import {
  INTEGRATION_PROVIDERS,
  IntegrationProvider,
  useIntegrationsStore,
} from "@/store/integrations-store";
import { getProviderLabel } from "@/components/integrations/oauth";
import { logClientAuthEvent } from "@/lib/auth-diagnostics";

function IntegrationCallbackPageClient() {
  const router = useRouter();
  const params = useParams<{ provider: string }>();
  const searchParams = useSearchParams();

  const businesses = useAppStore((state) => state.businesses);
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const selectBusiness = useAppStore((state) => state.selectBusiness);
  const businessId = searchParams.get("businessId") ?? selectedBusinessId;

  const ensureBusiness = useIntegrationsStore((state) => state.ensureBusiness);
  const setConnected = useIntegrationsStore((state) => state.setConnected);
  const setError = useIntegrationsStore((state) => state.setError);
  const setToast = useIntegrationsStore((state) => state.setToast);

  const providerParam = params.provider;
  const provider = (
    INTEGRATION_PROVIDERS.includes(providerParam as IntegrationProvider)
      ? providerParam
      : "meta"
  ) as IntegrationProvider;
  const providerLabel = getProviderLabel(provider);
  const statusParam = searchParams.get("status");
  const errorParam = searchParams.get("error");

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function applyCallbackState() {
      if (!businessId) {
        router.replace(businesses.length > 0 ? "/select-business" : "/businesses/new");
        return;
      }

      selectBusiness(businessId);
      ensureBusiness(businessId);
      const switchResponse = await fetch("/api/auth/switch-business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId }),
      }).catch(() => null);

      if (!switchResponse?.ok) {
        logClientAuthEvent("oauth_callback_business_sync_failed", {
          businessId,
          provider,
        });
      }

      if (cancelled) return;

      const integrationId = searchParams.get("integrationId") ?? undefined;

      if (statusParam === "success") {
        setConnected(businessId, provider, integrationId);
        setToast({
          type: "success",
          message: `${providerLabel} connected successfully.`,
        });
        logClientAuthEvent("oauth_callback_succeeded", {
          businessId,
          provider,
          integrationId,
        });
        timeoutId = setTimeout(() => router.replace("/integrations"), 800);
        return;
      }

      const message = errorParam ?? "OAuth connection failed. Please try again.";
      setError(businessId, provider, message);
      setToast({
        type: "error",
        message: `${providerLabel} connection failed: ${message}`,
      });
      logClientAuthEvent("oauth_callback_failed", {
        businessId,
        provider,
        message,
      });
      timeoutId = setTimeout(() => router.replace("/integrations"), 1200);
    }

    void applyCallbackState();
    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    businessId,
    businesses.length,
    ensureBusiness,
    provider,
    providerLabel,
    router,
    selectBusiness,
    statusParam,
    errorParam,
    searchParams,
    setConnected,
    setError,
    setToast,
  ]);

  return (
    <div className="relative flex min-h-[60vh] items-center justify-center">
      <div
        className={`absolute right-4 top-4 rounded-md border px-3 py-2 text-sm ${
          statusParam === "success"
            ? "border-green-500/30 bg-green-500/10 text-green-700"
            : "border-destructive/30 bg-destructive/10 text-destructive"
        }`}
      >
        {statusParam === "success"
          ? `${providerLabel} connected successfully.`
          : `${providerLabel} connection failed${errorParam ? `: ${errorParam}` : "."}`}
      </div>
      <div className="w-full max-w-md rounded-xl border bg-card p-5 text-center shadow-sm">
        <h1 className="text-lg font-semibold">OAuth Callback</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Processing {providerLabel} authorization result...
        </p>
      </div>
    </div>
  );
}

function IntegrationCallbackFallback() {
  return (
    <div className="relative flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md rounded-xl border bg-card p-5 text-center shadow-sm">
        <h1 className="text-lg font-semibold">OAuth Callback</h1>
        <p className="mt-2 text-sm text-muted-foreground">Preparing authorization context...</p>
      </div>
    </div>
  );
}

export default function IntegrationCallbackPage() {
  return (
    <Suspense fallback={<IntegrationCallbackFallback />}>
      <IntegrationCallbackPageClient />
    </Suspense>
  );
}
