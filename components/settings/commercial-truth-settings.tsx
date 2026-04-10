"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type TextareaHTMLAttributes,
} from "react";
import { Button } from "@/components/ui/button";
import {
  SettingsActionRow,
  SettingsField,
  SettingsGrid,
  SettingsInput,
  SettingsSection,
  SettingsSelect,
} from "@/components/settings/settings-section";
import {
  BUSINESS_COUNTRY_PRIORITY_TIERS,
  BUSINESS_COUNTRY_SCALE_OVERRIDES,
  BUSINESS_COUNTRY_SERVICEABILITY,
  BUSINESS_ISSUE_STATUSES,
  BUSINESS_PROMO_SEVERITIES,
  BUSINESS_PROMO_TYPES,
  BUSINESS_RISK_POSTURES,
  BUSINESS_STOCK_PRESSURE_STATUSES,
  createEmptyBusinessCommercialTruthSnapshot,
  createEmptyCountryEconomicsRow,
  createEmptyOperatingConstraints,
  createEmptyPromoCalendarEvent,
  createEmptyTargetPack,
  type BusinessCommercialSectionMeta,
  type BusinessCommercialTruthSnapshot,
} from "@/src/types/business-commercial";

interface CommercialTruthSettingsResponse {
  snapshot: BusinessCommercialTruthSnapshot;
  permissions: {
    canEdit: boolean;
    reason: string | null;
    role: "admin" | "collaborator" | "guest";
  };
}

function SectionMeta({
  meta,
  emptyText,
}: {
  meta: BusinessCommercialSectionMeta;
  emptyText: string;
}) {
  if (!meta.configured) {
    return <p className="text-xs text-muted-foreground">{emptyText}</p>;
  }
  return (
    <p className="text-xs text-muted-foreground">
      Source: {meta.sourceLabel ?? "settings_manual_entry"}.
      {meta.updatedAt ? ` Updated at ${meta.updatedAt}.` : ""}{" "}
      {meta.itemCount > 0 ? `Items: ${meta.itemCount}.` : ""}
    </p>
  );
}

function TextAreaField(
  props: TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className="min-h-[84px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

export function CommercialTruthSettingsSection({
  businessId,
}: {
  businessId: string;
}) {
  const [snapshot, setSnapshot] = useState<BusinessCommercialTruthSnapshot>(
    createEmptyBusinessCommercialTruthSnapshot(businessId),
  );
  const [permissions, setPermissions] =
    useState<CommercialTruthSettingsResponse["permissions"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canEdit = permissions?.canEdit ?? false;

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/business-commercial-settings?businessId=${encodeURIComponent(businessId)}`,
        { cache: "no-store" },
      );
      const payload =
        (await response.json().catch(() => null)) as CommercialTruthSettingsResponse | null;
      if (!response.ok || !payload?.snapshot || !payload.permissions) {
        throw new Error("Could not load commercial truth settings.");
      }
      setSnapshot(payload.snapshot);
      setPermissions(payload.permissions);
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load commercial truth settings.",
      );
      setSnapshot(createEmptyBusinessCommercialTruthSnapshot(businessId));
      setPermissions(null);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    setSnapshot(createEmptyBusinessCommercialTruthSnapshot(businessId));
    setPermissions(null);
    void loadSnapshot();
  }, [businessId, loadSnapshot]);

  const updateTargetPack = useCallback(
    (field: keyof NonNullable<BusinessCommercialTruthSnapshot["targetPack"]>, value: unknown) => {
      setSnapshot((current) => ({
        ...current,
        targetPack: {
          ...(current.targetPack ?? createEmptyTargetPack()),
          [field]: value,
        },
      }));
    },
    [],
  );

  const updateCountry = useCallback(
    (
      index: number,
      field: keyof BusinessCommercialTruthSnapshot["countryEconomics"][number],
      value: unknown,
    ) => {
      setSnapshot((current) => ({
        ...current,
        countryEconomics: current.countryEconomics.map((row, rowIndex) =>
          rowIndex === index ? { ...row, [field]: value } : row,
        ),
      }));
    },
    [],
  );

  const updatePromo = useCallback(
    (
      index: number,
      field: keyof BusinessCommercialTruthSnapshot["promoCalendar"][number],
      value: unknown,
    ) => {
      setSnapshot((current) => ({
        ...current,
        promoCalendar: current.promoCalendar.map((row, rowIndex) =>
          rowIndex === index ? { ...row, [field]: value } : row,
        ),
      }));
    },
    [],
  );

  const updateConstraints = useCallback(
    (
      field: keyof NonNullable<BusinessCommercialTruthSnapshot["operatingConstraints"]>,
      value: unknown,
    ) => {
      setSnapshot((current) => ({
        ...current,
        operatingConstraints: {
          ...(current.operatingConstraints ?? createEmptyOperatingConstraints()),
          [field]: value,
        },
      }));
    },
    [],
  );

  async function handleSave() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/business-commercial-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          businessId,
          snapshot,
        }),
      });
      const payload =
        (await response.json().catch(() => null)) as CommercialTruthSettingsResponse | null;
      if (!response.ok || !payload?.snapshot || !payload.permissions) {
        throw new Error(
          (payload as { message?: string } | null)?.message ??
            "Could not save commercial truth settings.",
        );
      }
      setSnapshot(payload.snapshot);
      setPermissions(payload.permissions);
      setNotice("Commercial truth settings updated.");
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save commercial truth settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  const targetPack = snapshot.targetPack ?? createEmptyTargetPack();
  const operatingConstraints =
    snapshot.operatingConstraints ?? createEmptyOperatingConstraints();

  const countryRows = useMemo(
    () => snapshot.countryEconomics,
    [snapshot.countryEconomics],
  );
  const promoRows = useMemo(
    () => snapshot.promoCalendar,
    [snapshot.promoCalendar],
  );

  return (
    <SettingsSection
      title="Commercial Truth"
      description="Give Meta and Creative deterministic commercial context: business targets, GEO economics, promo timing, and operating constraints."
    >
      <div className="space-y-6" data-testid="commercial-truth-settings">
        {loading ? (
          <p className="text-sm text-muted-foreground">
            Loading commercial truth settings...
          </p>
        ) : null}

        {!loading && permissions?.reason ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {permissions.reason}
          </div>
        ) : null}

        {notice ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <div className="rounded-2xl border bg-background p-4">
          <div className="space-y-1 border-b pb-4">
            <h3 className="text-base font-semibold">Target Pack</h3>
            <SectionMeta
              meta={snapshot.sectionMeta.targetPack}
              emptyText="Optional. Leave blank to keep operating mode in Explore until target economics are explicit."
            />
          </div>
          <div className="pt-4">
            <SettingsGrid>
              <SettingsField label="Target CPA">
                <SettingsInput
                  data-testid="commercial-target-cpa"
                  type="number"
                  step="0.01"
                  value={targetPack.targetCpa ?? ""}
                  onChange={(event) =>
                    updateTargetPack(
                      "targetCpa",
                      event.target.value === "" ? null : Number(event.target.value),
                    )
                  }
                  disabled={!canEdit || loading}
                />
              </SettingsField>
              <SettingsField label="Target ROAS">
                <SettingsInput
                  data-testid="commercial-target-roas"
                  type="number"
                  step="0.01"
                  value={targetPack.targetRoas ?? ""}
                  onChange={(event) =>
                    updateTargetPack(
                      "targetRoas",
                      event.target.value === "" ? null : Number(event.target.value),
                    )
                  }
                  disabled={!canEdit || loading}
                />
              </SettingsField>
              <SettingsField label="Break-even CPA">
                <SettingsInput
                  data-testid="commercial-break-even-cpa"
                  type="number"
                  step="0.01"
                  value={targetPack.breakEvenCpa ?? ""}
                  onChange={(event) =>
                    updateTargetPack(
                      "breakEvenCpa",
                      event.target.value === "" ? null : Number(event.target.value),
                    )
                  }
                  disabled={!canEdit || loading}
                />
              </SettingsField>
              <SettingsField label="Break-even ROAS">
                <SettingsInput
                  data-testid="commercial-break-even-roas"
                  type="number"
                  step="0.01"
                  value={targetPack.breakEvenRoas ?? ""}
                  onChange={(event) =>
                    updateTargetPack(
                      "breakEvenRoas",
                      event.target.value === "" ? null : Number(event.target.value),
                    )
                  }
                  disabled={!canEdit || loading}
                />
              </SettingsField>
              <SettingsField label="Contribution margin assumption (%)">
                <SettingsInput
                  type="number"
                  step="0.01"
                  value={targetPack.contributionMarginAssumption ?? ""}
                  onChange={(event) =>
                    updateTargetPack(
                      "contributionMarginAssumption",
                      event.target.value === "" ? null : Number(event.target.value),
                    )
                  }
                  disabled={!canEdit || loading}
                />
              </SettingsField>
              <SettingsField label="AOV assumption">
                <SettingsInput
                  type="number"
                  step="0.01"
                  value={targetPack.aovAssumption ?? ""}
                  onChange={(event) =>
                    updateTargetPack(
                      "aovAssumption",
                      event.target.value === "" ? null : Number(event.target.value),
                    )
                  }
                  disabled={!canEdit || loading}
                />
              </SettingsField>
              <SettingsField label="New customer weight">
                <SettingsInput
                  type="number"
                  step="0.01"
                  value={targetPack.newCustomerWeight ?? ""}
                  onChange={(event) =>
                    updateTargetPack(
                      "newCustomerWeight",
                      event.target.value === "" ? null : Number(event.target.value),
                    )
                  }
                  disabled={!canEdit || loading}
                />
              </SettingsField>
              <SettingsField label="Default risk posture">
                <SettingsSelect
                  value={targetPack.defaultRiskPosture}
                  onChange={(event) =>
                    updateTargetPack("defaultRiskPosture", event.target.value)
                  }
                  disabled={!canEdit || loading}
                >
                  {BUSINESS_RISK_POSTURES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SettingsSelect>
              </SettingsField>
            </SettingsGrid>
          </div>
        </div>

        <div className="rounded-2xl border bg-background p-4">
          <div className="space-y-1 border-b pb-4">
            <h3 className="text-base font-semibold">Country Economics</h3>
            <SectionMeta
              meta={snapshot.sectionMeta.countryEconomics}
              emptyText="Optional. Add only the GEO overrides that materially change scaling or serviceability."
            />
          </div>
          <div className="space-y-3 pt-4">
            {countryRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No GEO economics rows yet. This soft-fails and lowers operating-mode confidence without blocking the page.
              </p>
            ) : null}
            {countryRows.map((row, index) => (
              <div
                key={`${row.countryCode || "row"}-${index}`}
                className="rounded-xl border bg-muted/20 p-4"
              >
                <div className="grid gap-4 lg:grid-cols-3">
                  <SettingsField label="Country code">
                    <SettingsInput
                      data-testid={`commercial-country-code-${index}`}
                      value={row.countryCode}
                      onChange={(event) =>
                        updateCountry(index, "countryCode", event.target.value.toUpperCase())
                      }
                      disabled={!canEdit || loading}
                    />
                  </SettingsField>
                  <SettingsField label="Economics multiplier">
                    <SettingsInput
                      data-testid={`commercial-economics-multiplier-${index}`}
                      type="number"
                      step="0.01"
                      value={row.economicsMultiplier ?? ""}
                      onChange={(event) =>
                        updateCountry(
                          index,
                          "economicsMultiplier",
                          event.target.value === "" ? null : Number(event.target.value),
                        )
                      }
                      disabled={!canEdit || loading}
                    />
                  </SettingsField>
                  <SettingsField label="Margin modifier">
                    <SettingsInput
                      type="number"
                      step="0.01"
                      value={row.marginModifier ?? ""}
                      onChange={(event) =>
                        updateCountry(
                          index,
                          "marginModifier",
                          event.target.value === "" ? null : Number(event.target.value),
                        )
                      }
                      disabled={!canEdit || loading}
                    />
                  </SettingsField>
                  <SettingsField label="Serviceability">
                    <SettingsSelect
                      value={row.serviceability}
                      onChange={(event) =>
                        updateCountry(index, "serviceability", event.target.value)
                      }
                      disabled={!canEdit || loading}
                    >
                      {BUSINESS_COUNTRY_SERVICEABILITY.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </SettingsSelect>
                  </SettingsField>
                  <SettingsField label="Priority tier">
                    <SettingsSelect
                      value={row.priorityTier}
                      onChange={(event) =>
                        updateCountry(index, "priorityTier", event.target.value)
                      }
                      disabled={!canEdit || loading}
                    >
                      {BUSINESS_COUNTRY_PRIORITY_TIERS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </SettingsSelect>
                  </SettingsField>
                  <SettingsField label="Scale override">
                    <SettingsSelect
                      value={row.scaleOverride}
                      onChange={(event) =>
                        updateCountry(index, "scaleOverride", event.target.value)
                      }
                      disabled={!canEdit || loading}
                    >
                      {BUSINESS_COUNTRY_SCALE_OVERRIDES.map((option) => (
                        <option key={option} value={option}>
                          {option.replaceAll("_", " ")}
                        </option>
                      ))}
                    </SettingsSelect>
                  </SettingsField>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <SettingsField label="Notes">
                    <TextAreaField
                      value={row.notes ?? ""}
                      onChange={(event) =>
                        updateCountry(index, "notes", event.target.value || null)
                      }
                      disabled={!canEdit || loading}
                    />
                  </SettingsField>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setSnapshot((current) => ({
                          ...current,
                          countryEconomics: current.countryEconomics.filter(
                            (_, rowIndex) => rowIndex !== index,
                          ),
                        }))
                      }
                      disabled={!canEdit || loading}
                    >
                      Remove row
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              data-testid="commercial-add-country"
              onClick={() =>
                setSnapshot((current) => ({
                  ...current,
                  countryEconomics: [
                    ...current.countryEconomics,
                    createEmptyCountryEconomicsRow(),
                  ],
                }))
              }
              disabled={!canEdit || loading}
            >
              Add country economics row
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-background p-4">
          <div className="space-y-1 border-b pb-4">
            <h3 className="text-base font-semibold">Promo Calendar</h3>
            <SectionMeta
              meta={snapshot.sectionMeta.promoCalendar}
              emptyText="Optional. Add only promo windows that materially change landing pages, offer pressure, or pacing."
            />
          </div>
          <div className="space-y-3 pt-4">
            {promoRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No promo windows yet. Operating mode will still render, but promo-aware posture will stay conservative.
              </p>
            ) : null}
            {promoRows.map((row, index) => (
              <div key={row.eventId} className="rounded-xl border bg-muted/20 p-4">
                <div className="grid gap-4 lg:grid-cols-3">
                  <SettingsField label="Title">
                    <SettingsInput
                      data-testid={`commercial-promo-title-${index}`}
                      value={row.title}
                      onChange={(event) =>
                        updatePromo(index, "title", event.target.value)
                      }
                      disabled={!canEdit || loading}
                    />
                  </SettingsField>
                  <SettingsField label="Promo type">
                    <SettingsSelect
                      value={row.promoType}
                      onChange={(event) =>
                        updatePromo(index, "promoType", event.target.value)
                      }
                      disabled={!canEdit || loading}
                    >
                      {BUSINESS_PROMO_TYPES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </SettingsSelect>
                  </SettingsField>
                  <SettingsField label="Severity">
                    <SettingsSelect
                      value={row.severity}
                      onChange={(event) =>
                        updatePromo(index, "severity", event.target.value)
                      }
                      disabled={!canEdit || loading}
                    >
                      {BUSINESS_PROMO_SEVERITIES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </SettingsSelect>
                  </SettingsField>
                  <SettingsField label="Start date">
                    <SettingsInput
                      type="date"
                      value={row.startDate}
                      onChange={(event) =>
                        updatePromo(index, "startDate", event.target.value)
                      }
                      disabled={!canEdit || loading}
                    />
                  </SettingsField>
                  <SettingsField label="End date">
                    <SettingsInput
                      type="date"
                      value={row.endDate}
                      onChange={(event) =>
                        updatePromo(index, "endDate", event.target.value)
                      }
                      disabled={!canEdit || loading}
                    />
                  </SettingsField>
                  <SettingsField label="Affected scope">
                    <SettingsInput
                      value={row.affectedScope ?? ""}
                      onChange={(event) =>
                        updatePromo(index, "affectedScope", event.target.value || null)
                      }
                      disabled={!canEdit || loading}
                    />
                  </SettingsField>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <SettingsField label="Notes">
                    <TextAreaField
                      value={row.notes ?? ""}
                      onChange={(event) =>
                        updatePromo(index, "notes", event.target.value || null)
                      }
                      disabled={!canEdit || loading}
                    />
                  </SettingsField>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setSnapshot((current) => ({
                          ...current,
                          promoCalendar: current.promoCalendar.filter(
                            (_, rowIndex) => rowIndex !== index,
                          ),
                        }))
                      }
                      disabled={!canEdit || loading}
                    >
                      Remove promo
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              data-testid="commercial-add-promo"
              onClick={() =>
                setSnapshot((current) => ({
                  ...current,
                  promoCalendar: [
                    ...current.promoCalendar,
                    createEmptyPromoCalendarEvent(),
                  ],
                }))
              }
              disabled={!canEdit || loading}
            >
              Add promo event
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-background p-4">
          <div className="space-y-1 border-b pb-4">
            <h3 className="text-base font-semibold">Site Health &amp; Stock Pressure</h3>
            <SectionMeta
              meta={snapshot.sectionMeta.operatingConstraints}
              emptyText="Optional. Set only the operating blockers that should explicitly constrain scaling."
            />
          </div>
          <div className="pt-4">
            <SettingsGrid>
              <SettingsField label="Site issue">
                <SettingsSelect
                  value={operatingConstraints.siteIssueStatus}
                  onChange={(event) =>
                    updateConstraints("siteIssueStatus", event.target.value)
                  }
                  disabled={!canEdit || loading}
                >
                  {BUSINESS_ISSUE_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SettingsSelect>
              </SettingsField>
              <SettingsField label="Checkout issue">
                <SettingsSelect
                  value={operatingConstraints.checkoutIssueStatus}
                  onChange={(event) =>
                    updateConstraints("checkoutIssueStatus", event.target.value)
                  }
                  disabled={!canEdit || loading}
                >
                  {BUSINESS_ISSUE_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SettingsSelect>
              </SettingsField>
              <SettingsField label="Conversion tracking issue">
                <SettingsSelect
                  value={operatingConstraints.conversionTrackingIssueStatus}
                  onChange={(event) =>
                    updateConstraints(
                      "conversionTrackingIssueStatus",
                      event.target.value,
                    )
                  }
                  disabled={!canEdit || loading}
                >
                  {BUSINESS_ISSUE_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SettingsSelect>
              </SettingsField>
              <SettingsField label="Feed issue">
                <SettingsSelect
                  value={operatingConstraints.feedIssueStatus}
                  onChange={(event) =>
                    updateConstraints("feedIssueStatus", event.target.value)
                  }
                  disabled={!canEdit || loading}
                >
                  {BUSINESS_ISSUE_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SettingsSelect>
              </SettingsField>
              <SettingsField label="Stock pressure">
                <SettingsSelect
                  data-testid="commercial-stock-pressure"
                  value={operatingConstraints.stockPressureStatus}
                  onChange={(event) =>
                    updateConstraints("stockPressureStatus", event.target.value)
                  }
                  disabled={!canEdit || loading}
                >
                  {BUSINESS_STOCK_PRESSURE_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SettingsSelect>
              </SettingsField>
            </SettingsGrid>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <SettingsField label="Landing page concern">
                <TextAreaField
                  value={operatingConstraints.landingPageConcern ?? ""}
                  onChange={(event) =>
                    updateConstraints("landingPageConcern", event.target.value || null)
                  }
                  disabled={!canEdit || loading}
                />
              </SettingsField>
              <SettingsField label="Merchandising concern">
                <TextAreaField
                  value={operatingConstraints.merchandisingConcern ?? ""}
                  onChange={(event) =>
                    updateConstraints("merchandisingConcern", event.target.value || null)
                  }
                  disabled={!canEdit || loading}
                />
              </SettingsField>
              <SettingsField label="Manual do-not-scale reason">
                <TextAreaField
                  data-testid="commercial-manual-do-not-scale"
                  value={operatingConstraints.manualDoNotScaleReason ?? ""}
                  onChange={(event) =>
                    updateConstraints(
                      "manualDoNotScaleReason",
                      event.target.value || null,
                    )
                  }
                  disabled={!canEdit || loading}
                />
              </SettingsField>
            </div>
          </div>
        </div>

        {snapshot.costModelContext ? (
          <div className="rounded-xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
            Cost model remains a separate truth surface. It is shown here only as optional context and does not silently override target pack logic.
          </div>
        ) : null}

        <SettingsActionRow>
          <Button
            data-testid="commercial-settings-save"
            onClick={() => void handleSave()}
            disabled={!canEdit || loading || saving}
          >
            {saving ? "Saving..." : "Save commercial truth"}
          </Button>
        </SettingsActionRow>
      </div>
    </SettingsSection>
  );
}
