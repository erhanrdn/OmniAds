"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { BUSINESSES, useAppStore } from "@/store/app-store";
import {
  INTEGRATION_PROVIDERS,
  IntegrationProvider,
  useIntegrationsStore,
} from "@/store/integrations-store";
import { getProviderLabel } from "@/components/integrations/oauth";

export default function IntegrationCallbackPage() {
  const router = useRouter();
  const params = useParams<{ provider: string }>();
  const searchParams = useSearchParams();

  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const fallbackBusinessId = selectedBusinessId ?? BUSINESSES[0].id;
  const businessId = searchParams.get("businessId") ?? fallbackBusinessId;

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
    ensureBusiness(businessId);

    const integrationId = searchParams.get("integrationId") ?? undefined;

    if (statusParam === "success") {
      setConnected(businessId, provider, integrationId);
      setToast({
        type: "success",
        message: `${providerLabel} connected successfully.`,
      });
      const successTimeout = setTimeout(() => router.replace("/integrations"), 800);
      return () => clearTimeout(successTimeout);
    }

    const message = errorParam ?? "OAuth connection failed. Please try again.";
    setError(businessId, provider, message);
    setToast({
      type: "error",
      message: `${providerLabel} connection failed: ${message}`,
    });
    const errorTimeout = setTimeout(() => router.replace("/integrations"), 1200);
    return () => clearTimeout(errorTimeout);
  }, [
    businessId,
    ensureBusiness,
    provider,
    providerLabel,
    router,
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
