"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { TemplateMiniPreview, TemplateProviders } from "@/components/reports/template-mini-preview";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app-store";
import { CUSTOM_REPORT_TEMPLATES, type CustomReportRecord } from "@/lib/custom-reports";

async function fetchReports(businessId: string) {
  const response = await fetch(`/api/reports?businessId=${encodeURIComponent(businessId)}`, {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((payload as { message?: string } | null)?.message ?? "Failed to load reports.");
  }
  return (payload as { reports: CustomReportRecord[] }).reports;
}

export default function ReportsPage() {
  const businesses = useAppStore((state) => state.businesses);
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businessId = selectedBusinessId ?? "";
  const queryClient = useQueryClient();
  const business = businesses.find((item) => item.id === selectedBusinessId) ?? null;
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<"recent" | "name">("recent");

  const reportsQuery = useQuery({
    queryKey: ["custom-reports", businessId],
    enabled: Boolean(selectedBusinessId),
    queryFn: () => fetchReports(businessId),
  });
  const reports = reportsQuery.data ?? [];
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredReports = (normalizedQuery
    ? reports.filter((report) => {
        const category =
          CUSTOM_REPORT_TEMPLATES.find((template) => template.id === report.templateId)?.category ?? "";
        return [report.name, report.description ?? "", category]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
    : reports
  ).slice().sort((left, right) => {
    if (sortMode === "name") return left.name.localeCompare(right.name);
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });

  if (!selectedBusinessId) return <BusinessEmptyState />;

  const invalidateReports = async () => {
    await queryClient.invalidateQueries({ queryKey: ["custom-reports", businessId] });
  };

  const handleDuplicate = async (report: CustomReportRecord) => {
    setBusyReportId(report.id);
    setActionMessage(null);
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId,
        name: `${report.name} Copy`,
        description: report.description,
        templateId: report.templateId,
        definition: report.definition,
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setActionMessage((payload as { message?: string } | null)?.message ?? "Failed to duplicate report.");
      setBusyReportId(null);
      return;
    }
    await invalidateReports();
    setBusyReportId(null);
    setActionMessage("Report duplicated.");
  };

  const handleDelete = async (reportId: string) => {
    setBusyReportId(reportId);
    setActionMessage(null);
    const response = await fetch(`/api/reports/${reportId}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setActionMessage((payload as { message?: string } | null)?.message ?? "Failed to delete report.");
      setBusyReportId(null);
      return;
    }
    await invalidateReports();
    setBusyReportId(null);
    setActionMessage("Report deleted.");
  };

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border bg-[radial-gradient(circle_at_top_left,_rgba(125,211,252,0.35),_transparent_35%),linear-gradient(135deg,#ffffff,#f7fafc)] p-8 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Custom Reporting
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
              Build one-click reports for {business?.name ?? "this business"}
            </h1>
            <p className="text-sm leading-6 text-slate-600">
              Save reusable report formats under each business, start from a template, then share
              the final output as a public link or export table widgets as CSV.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/reports/new">Create Blank Report</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
        <div className="rounded-[28px] border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Saved Reports</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Every saved report belongs to the active business.
              </p>
            </div>
            {actionMessage ? <p className="text-sm text-slate-500">{actionMessage}</p> : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search reports..."
              className="min-w-[220px] rounded-xl border px-3 py-2 text-sm"
            />
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as "recent" | "name")}
              className="rounded-xl border px-3 py-2 text-sm"
            >
              <option value="recent">Sort: Recently updated</option>
              <option value="name">Sort: Name</option>
            </select>
          </div>

          {reportsQuery.isLoading ? (
            <div className="mt-6 rounded-2xl border border-dashed p-10 text-sm text-muted-foreground">
              Loading saved reports...
            </div>
          ) : reportsQuery.error ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              {reportsQuery.error instanceof Error ? reportsQuery.error.message : "Failed to load reports."}
            </div>
          ) : reports.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed p-10 text-sm text-muted-foreground">
              No saved reports yet. Start from a template or create a blank report.
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed p-10 text-sm text-muted-foreground">
              No reports match this search yet.
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {filteredReports.map((report) => (
                <div
                  key={report.id}
                  className="rounded-[28px] border px-4 py-4 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
                    <Link href={`/reports/${report.id}`} className="block">
                      <h3 className="text-base font-semibold text-slate-950">{report.name}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {report.description || "No description yet."}
                      </p>
                      <p className="mt-3 text-xs text-slate-400">
                        Updated {new Date(report.updatedAt).toLocaleString()}
                      </p>
                    </Link>
                    <Link href={`/reports/${report.id}`} className="block">
                      <TemplateMiniPreview definition={report.definition} />
                    </Link>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {report.definition?.widgets?.length ?? 0} widgets
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/reports/${report.id}`}>Edit</Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDuplicate(report)}
                        disabled={busyReportId === report.id}
                      >
                        Duplicate
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(report.id)}
                        disabled={busyReportId === report.id}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[28px] border bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-semibold">Template Gallery</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Start with a one-click structure, then customize every widget and slot.
            </p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {CUSTOM_REPORT_TEMPLATES.map((template) => (
              <Link
                key={template.id}
                href={`/reports/new?template=${template.id}`}
                className={`rounded-[28px] border bg-gradient-to-br ${template.accent} p-5 transition hover:-translate-y-0.5 hover:shadow-md`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600">
                    {template.category}
                  </span>
                  <TemplateProviders template={template} />
                </div>
                <TemplateMiniPreview definition={template.definition} className="mt-8" />
                <h3 className="mt-5 text-lg font-semibold text-slate-950">{template.name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{template.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
