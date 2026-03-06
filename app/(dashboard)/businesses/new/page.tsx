"use client";

import { BusinessForm } from "@/components/business/BusinessForm";
import { useAppStore } from "@/store/app-store";
import { useRouter } from "next/navigation";

export default function NewBusinessPage() {
  const router = useRouter();
  const createBusiness = useAppStore((state) => state.createBusiness);

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
          onSubmit={({ name, timezone, currency }) => {
            createBusiness(name, timezone, currency);
            router.push("/integrations");
          }}
        />
      </div>
    </div>
  );
}
