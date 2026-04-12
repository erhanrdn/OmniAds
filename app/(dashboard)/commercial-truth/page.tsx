"use client";

import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { CommercialTruthSettingsSection } from "@/components/settings/commercial-truth-settings";
import { SettingsStat } from "@/components/settings/settings-section";
import { getTranslations } from "@/lib/i18n";
import { useAppStore } from "@/store/app-store";
import { usePreferencesStore } from "@/store/preferences-store";

export default function CommercialTruthPage() {
  const businesses = useAppStore((state) => state.businesses);
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const language = usePreferencesStore((state) => state.language);
  const navigationTranslations = getTranslations(language).navigation;

  const activeBusiness =
    businesses.find((business) => business.id === selectedBusinessId) ?? null;

  if (!selectedBusinessId || !activeBusiness) {
    return <BusinessEmptyState />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            {navigationTranslations.commercialTruth}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Manage the shared business context that Meta and Creative decision surfaces use as
            deterministic commercial truth for the active workspace.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <SettingsStat label="Workspace" value={activeBusiness.name} />
          <SettingsStat label="Currency" value={activeBusiness.currency} />
          <SettingsStat
            label="Timezone"
            value={activeBusiness.timezone ?? "Derived from connected sources"}
            tone={activeBusiness.timezone ? "default" : "warning"}
          />
        </div>
      </div>

      <CommercialTruthSettingsSection businessId={selectedBusinessId} />
    </div>
  );
}
