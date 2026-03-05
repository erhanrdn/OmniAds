"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BUSINESSES, useAppStore } from "@/store/app-store";
import {
  getCreatives,
  getLandingPages,
  getOverview,
  getPlatformTable,
} from "@/src/services";
import { Platform, PlatformLevel } from "@/src/types";
import { LoadingSkeleton } from "@/components/states/loading-skeleton";
import { ErrorState } from "@/components/states/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

type SectionKey =
  | "kpis"
  | "platformTable"
  | "trend"
  | "topCreatives"
  | "topLandingPages";
type DateRangePreset = "7d" | "30d";
type PlatformFilter = "all" | Platform;

interface ReportTemplate {
  id: string;
  name: string;
  sections: SectionKey[];
  dateRange: DateRangePreset;
  platform: PlatformFilter;
  logoFileName: string;
}

const TEMPLATE_STORAGE_KEY = "omniads.report.templates.v1";

const SECTION_OPTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: "kpis", label: "KPIs" },
  { key: "platformTable", label: "Platform table" },
  { key: "trend", label: "Trend" },
  { key: "topCreatives", label: "Top creatives" },
  { key: "topLandingPages", label: "Top landing pages" },
];

const DEFAULT_SECTIONS: SectionKey[] = [
  "kpis",
  "platformTable",
  "trend",
  "topCreatives",
  "topLandingPages",
];

const PLATFORM_OPTIONS: Array<{ value: PlatformFilter; label: string }> = [
  { value: "all", label: "All platforms" },
  { value: Platform.META, label: "Meta" },
  { value: Platform.GOOGLE, label: "Google" },
  { value: Platform.TIKTOK, label: "TikTok" },
  { value: Platform.PINTEREST, label: "Pinterest" },
  { value: Platform.SNAPCHAT, label: "Snapchat" },
];

export default function ReportsPage() {
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businessId = selectedBusinessId ?? BUSINESSES[0].id;

  const [selectedSections, setSelectedSections] =
    useState<SectionKey[]>(DEFAULT_SECTIONS);
  const [dateRange, setDateRange] = useState<DateRangePreset>("30d");
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [logoFileName, setLogoFileName] = useState("");
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const range = useMemo(() => {
    if (dateRange === "7d") {
      return { startDate: "2026-02-27", endDate: "2026-03-05" };
    }
    return { startDate: "2026-02-04", endDate: "2026-03-05" };
  }, [dateRange]);

  const overviewQuery = useQuery({
    queryKey: ["report-overview", businessId, range],
    queryFn: () => getOverview(businessId, range),
  });

  const creativesQuery = useQuery({
    queryKey: ["report-creatives", businessId, platform, dateRange],
    queryFn: () =>
      getCreatives(businessId, {
        dateRange,
        platforms: platform === "all" ? [] : [platform],
        sortBy: "roas",
      }),
  });

  const landingPagesQuery = useQuery({
    queryKey: ["report-landing-pages", businessId, platform, dateRange],
    queryFn: () =>
      getLandingPages(businessId, {
        dateRange,
        platform: platform === "all" ? undefined : platform,
      }),
  });

  const platformTableQuery = useQuery({
    queryKey: ["report-platform-table", businessId, platform, range],
    enabled: platform !== "all",
    queryFn: () =>
      getPlatformTable(
        platform as Platform,
        PlatformLevel.CAMPAIGN,
        businessId,
        null,
        range,
        ["spend", "purchases", "revenue", "roas", "cpa"]
      ),
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ReportTemplate[];
      if (Array.isArray(parsed)) setTemplates(parsed);
    } catch {
      setTemplates([]);
    }
  }, []);

  const saveTemplates = (next: ReportTemplate[]) => {
    setTemplates(next);
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(next));
  };

  const toggleSection = (section: SectionKey) => {
    setSelectedSections((prev) =>
      prev.includes(section) ? prev.filter((item) => item !== section) : [...prev, section]
    );
  };

  const handleSaveTemplate = () => {
    const name = templateName.trim() || `Template ${templates.length + 1}`;
    const nextTemplate: ReportTemplate = {
      id: crypto.randomUUID(),
      name,
      sections: selectedSections,
      dateRange,
      platform,
      logoFileName,
    };
    const next = [nextTemplate, ...templates];
    saveTemplates(next);
    setTemplateName("");
    setSelectedTemplateId(nextTemplate.id);
  };

  const handleLoadTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setSelectedSections(template.sections);
    setDateRange(template.dateRange);
    setPlatform(template.platform);
    setLogoFileName(template.logoFileName);
  };

  const isLoading =
    overviewQuery.isLoading ||
    creativesQuery.isLoading ||
    landingPagesQuery.isLoading ||
    (platform !== "all" && platformTableQuery.isLoading);
  const isError =
    overviewQuery.isError ||
    creativesQuery.isError ||
    landingPagesQuery.isError ||
    (platform !== "all" && platformTableQuery.isError);

  if (isLoading) {
    return <LoadingSkeleton rows={5} />;
  }

  if (isError) {
    return (
      <ErrorState
        onRetry={() => {
          overviewQuery.refetch();
          creativesQuery.refetch();
          landingPagesQuery.refetch();
          platformTableQuery.refetch();
        }}
      />
    );
  }

  const overview = overviewQuery.data;
  if (!overview) return null;

  const topCreatives = (creativesQuery.data ?? []).slice(0, 4);
  const topLandingPages = [...(landingPagesQuery.data ?? [])]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 4);

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
      <aside className="rounded-2xl border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Sections
        </h2>
        <div className="mt-3 space-y-2">
          {SECTION_OPTIONS.map((section) => (
            <button
              key={section.key}
              type="button"
              onClick={() => toggleSection(section.key)}
              className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm"
            >
              <span>{section.label}</span>
              <input type="checkbox" readOnly checked={selectedSections.includes(section.key)} />
            </button>
          ))}
        </div>
      </aside>

      <section className="rounded-2xl border bg-muted/20 p-4">
        <div className="mx-auto w-full max-w-[780px]">
          <div className="mb-3 text-xs text-muted-foreground">Report Preview (A4)</div>
          <article className="mx-auto aspect-[210/297] w-full overflow-y-auto rounded-md border bg-white p-7 text-black shadow-sm">
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Performance Report</h1>
                <p className="text-sm text-neutral-600">
                  {range.startDate} to {range.endDate}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-neutral-500">Platform</p>
                <p className="text-sm font-medium capitalize">
                  {platform === "all" ? "All" : platform}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Logo: {logoFileName || "placeholder"}
                </p>
              </div>
            </div>

            {selectedSections.includes("kpis") && (
              <section className="mb-6">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-600">
                  KPIs
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <PreviewMetric label="Spend" value={`$${overview.kpis.spend.toLocaleString()}`} />
                  <PreviewMetric
                    label="Revenue"
                    value={`$${overview.kpis.revenue.toLocaleString()}`}
                  />
                  <PreviewMetric label="ROAS" value={overview.kpis.roas.toFixed(2)} />
                </div>
              </section>
            )}

            {selectedSections.includes("platformTable") && (
              <section className="mb-6">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-600">
                  Platform Table
                </h3>
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-neutral-500">
                      <th className="py-1.5">Name</th>
                      <th className="py-1.5">Spend</th>
                      <th className="py-1.5">Revenue</th>
                      <th className="py-1.5">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(platform === "all"
                      ? overview.platformEfficiency.map((item) => ({
                          id: item.platform,
                          name: item.platform,
                          spend: item.spend,
                          revenue: item.revenue,
                          roas: item.roas,
                        }))
                      : (platformTableQuery.data ?? []).map((item) => ({
                          id: item.id,
                          name: item.name,
                          spend: item.metrics.spend ?? 0,
                          revenue: item.metrics.revenue ?? 0,
                          roas: item.metrics.roas ?? 0,
                        }))
                    )
                      .slice(0, 5)
                      .map((row) => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="py-1.5 capitalize">{row.name}</td>
                          <td className="py-1.5">${row.spend.toLocaleString()}</td>
                          <td className="py-1.5">${row.revenue.toLocaleString()}</td>
                          <td className="py-1.5">{row.roas.toFixed(2)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </section>
            )}

            {selectedSections.includes("trend") && (
              <section className="mb-6">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-600">
                  Trend
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  {(dateRange === "7d" ? overview.trends["7d"] : overview.trends["30d"])
                    .slice(0, 4)
                    .map((point) => (
                      <div key={point.label} className="rounded border p-2">
                        <p className="text-[10px] text-neutral-500">{point.label}</p>
                        <p className="mt-1 text-xs font-medium">
                          ${point.revenue.toLocaleString()}
                        </p>
                      </div>
                    ))}
                </div>
              </section>
            )}

            {selectedSections.includes("topCreatives") && (
              <section className="mb-6">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-600">
                  Top Creatives
                </h3>
                <div className="space-y-1.5 text-xs">
                  {topCreatives.map((item) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <span>{item.headline}</span>
                      <span className="text-neutral-500">ROAS {item.metrics.roas.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {selectedSections.includes("topLandingPages") && (
              <section>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-600">
                  Top Landing Pages
                </h3>
                <div className="space-y-1.5 text-xs">
                  {topLandingPages.map((item) => (
                    <div key={item.id} className="flex items-center justify-between">
                      <span className="truncate pr-3">{item.url}</span>
                      <span className="text-neutral-500">{item.roas.toFixed(2)} ROAS</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </article>
        </div>
      </section>

      <aside className="space-y-4 rounded-2xl border bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Filters
          </h2>
          <div className="mt-3 space-y-3">
            <div className="inline-flex rounded-md border bg-muted/40 p-1">
              {(["7d", "30d"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setDateRange(item)}
                  className={`rounded px-2.5 py-1 text-xs font-medium uppercase ${
                    dateRange === item
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            <select
              value={platform}
              onChange={(event) => setPlatform(event.target.value as PlatformFilter)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              {PLATFORM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <div className="rounded-lg border border-dashed p-3">
              <p className="text-xs text-muted-foreground">Logo upload placeholder</p>
              <input
                type="file"
                accept="image/*"
                className="mt-2 block w-full text-xs"
                onChange={(event) =>
                  setLogoFileName(event.target.files?.[0]?.name ?? "")
                }
              />
              {logoFileName && (
                <Badge className="mt-2" variant="secondary">
                  {logoFileName}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Templates
          </h2>
          <div className="mt-3 space-y-2">
            <input
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Template name"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            />
            <Button className="w-full" onClick={handleSaveTemplate}>
              Save Template
            </Button>

            <select
              value={selectedTemplateId}
              onChange={(event) => handleLoadTemplate(event.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Load template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Button className="w-full" onClick={() => setIsExportModalOpen(true)}>
          Export
        </Button>
      </aside>

      {isExportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border bg-background p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">Print / Save PDF</h3>
              <button
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                onClick={() => setIsExportModalOpen(false)}
                aria-label="Close export modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Export action is a placeholder. Use browser print dialog to save as PDF.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsExportModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => window.print()}>Print</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border px-2 py-2">
      <p className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{value}</p>
    </div>
  );
}
