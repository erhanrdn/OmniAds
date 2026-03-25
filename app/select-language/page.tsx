"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { getTranslations, LANGUAGE_OPTIONS } from "@/lib/i18n";
import { usePreferencesStore } from "@/store/preferences-store";

export default function SelectLanguagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const language = usePreferencesStore((state) => state.language);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);
  const t = getTranslations(language).language;
  const nextPath = searchParams.get("next") || "/overview";
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  async function persistLanguage() {
    setSaving(true);
    try {
      await fetch("/api/settings/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      }).catch(() => null);
    } finally {
      setSaving(false);
    }
  }

  async function handleContinue() {
    await persistLanguage();
    router.push(nextPath);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-2xl space-y-8">
        <div className="space-y-3 text-center">
          <BrandLogo
            className="justify-center"
            markClassName="h-16 w-16"
            textClassName="text-2xl"
            size={64}
          />
          <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {LANGUAGE_OPTIONS.map((option) => {
            const isActive = option.value === language;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setLanguage(option.value)}
                className={`rounded-2xl border p-6 text-left transition ${
                  isActive ? "border-foreground bg-muted/40" : "border-border hover:border-foreground/40"
                }`}
              >
                <p className="text-lg font-semibold">{option.nativeLabel}</p>
                <p className="mt-1 text-sm text-muted-foreground">{option.label}</p>
                <p className="mt-4 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {t.current}: {option.value.toUpperCase()}
                </p>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={() => void handleContinue()} className="min-w-40" disabled={saving}>
            {saving ? getTranslations(language).common.loading : t.continue}
          </Button>
          <Button variant="outline" onClick={() => void handleContinue()} className="min-w-40" disabled={saving}>
            {t.skip}
          </Button>
        </div>
      </div>
    </div>
  );
}
