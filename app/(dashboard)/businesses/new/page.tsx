"use client";

import { useState } from "react";
import { BusinessForm } from "@/components/business/BusinessForm";
import { useAppStore } from "@/store/app-store";
import { useRouter } from "next/navigation";

export default function NewBusinessPage() {
  const router = useRouter();
  const setBusinessesFromServer = useAppStore((state) => state.setBusinessesFromServer);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create business</h1>
        <p className="text-sm text-muted-foreground">
          Add a business workspace before connecting integrations and linked accounts.
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <BusinessForm
          onSubmit={async ({ name, timezone, currency }) => {
            setError(null);
            const res = await fetch("/api/businesses", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, timezone, currency }),
            });
            const payload = (await res.json().catch(() => null)) as
              | {
                  message?: string;
                  business?: { id: string; name: string; timezone: string; currency: string };
                }
              | null;
            if (!res.ok || !payload?.business) {
              setError(payload?.message ?? "Could not create business.");
              return;
            }
            const allRes = await fetch("/api/businesses", { cache: "no-store" });
            const allPayload = (await allRes.json().catch(() => null)) as
              | {
                  businesses?: Array<{
                    id: string;
                    name: string;
                    timezone: string;
                    currency: string;
                  }>;
                  activeBusinessId?: string | null;
                }
              | null;
            if (allRes.ok && allPayload?.businesses) {
              setBusinessesFromServer(allPayload.businesses, allPayload.activeBusinessId ?? payload.business.id);
            }
            router.push("/integrations");
          }}
        />
        {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}
