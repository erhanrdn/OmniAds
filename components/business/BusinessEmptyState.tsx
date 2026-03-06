"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function BusinessEmptyState() {
  const router = useRouter();

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-xl rounded-2xl border bg-card p-8 text-center shadow-sm">
        <h2 className="text-2xl font-semibold tracking-tight">Create your first business</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Set up a business to connect ad accounts, stores, and analytics properties.
        </p>
        <Button className="mt-6" onClick={() => router.push("/businesses/new")}>
          Create business
        </Button>
      </div>
    </div>
  );
}
