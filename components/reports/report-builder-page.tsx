"use client";

import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { BusinessEmptyState } from "@/components/business/BusinessEmptyState";
import { useAppStore } from "@/store/app-store";
import type { CustomReportRecord } from "@/lib/custom-reports";

const ReportBuilder = dynamic(
  () => import("@/components/reports/report-builder").then((module) => module.ReportBuilder),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-3xl border bg-white p-8 text-sm text-muted-foreground">
        Loading builder...
      </div>
    ),
  }
);

async function fetchReport(reportId: string) {
  const response = await fetch(`/api/reports/${reportId}`, { cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error((payload as { message?: string } | null)?.message ?? "Failed to load report.");
  }
  return (payload as { report: CustomReportRecord }).report;
}

export function ReportBuilderPage({
  mode,
  reportId,
  templateId,
}: {
  mode: "new" | "edit";
  reportId?: string;
  templateId?: string | null;
}) {
  const selectedBusinessId = useAppStore((state) => state.selectedBusinessId);
  const businessId = selectedBusinessId ?? "";

  const reportQuery = useQuery({
    queryKey: ["custom-report", reportId],
    enabled: mode === "edit" && Boolean(reportId),
    queryFn: () => fetchReport(reportId as string),
  });

  if (!selectedBusinessId) return <BusinessEmptyState />;

  if (mode === "edit" && reportQuery.isLoading) {
    return (
      <div className="rounded-3xl border bg-white p-8 text-sm text-muted-foreground">
        Loading report...
      </div>
    );
  }

  if (mode === "edit" && reportQuery.error) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-sm text-red-700">
        {reportQuery.error instanceof Error ? reportQuery.error.message : "Failed to load report."}
      </div>
    );
  }

  return (
    <ReportBuilder
      businessId={businessId}
      initialRecord={reportQuery.data ?? null}
      initialTemplateId={templateId ?? null}
    />
  );
}
