import type { Metadata } from "next";
import Link from "next/link";
import { getCustomReportShareSnapshot } from "@/lib/custom-report-store";
import { ReportCanvas } from "@/components/reports/report-canvas";

export const metadata: Metadata = {
  title: "Shared Report",
  robots: { index: false, follow: false },
};

export default async function ShareReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = await getCustomReportShareSnapshot(token);

  if (!payload) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Share link not found or expired</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This shared report may have expired or the URL is invalid.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex rounded-md border px-3 py-1.5 text-sm hover:bg-muted/40"
          >
            Back to Adsecute
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(125,211,252,0.22),_transparent_32%),linear-gradient(180deg,#f8fafc,#f3f4f6)] px-6 py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-[32px] border bg-white/95 px-6 py-6 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Shared Report
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">{payload.name}</h1>
              {payload.description ? (
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{payload.description}</p>
              ) : null}
            </div>
            <div className="grid min-w-[220px] gap-3 rounded-3xl border bg-slate-50/90 p-4 text-sm text-slate-600">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Date Range
                </div>
                <div className="mt-1 font-medium text-slate-900">{payload.dateRangeLabel}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Generated
                </div>
                <div className="mt-1 font-medium text-slate-900">
                  {new Date(payload.generatedAt).toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Expires
                </div>
                <div className="mt-1 font-medium text-slate-900">
                  {new Date(payload.expiresAt).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-dashed bg-white/70 px-6 py-4 text-sm text-slate-600 shadow-sm">
          This is a captured share snapshot from Adsecute. Open the link anytime before it expires
          to review the generated report layout.
        </div>

        <div className="rounded-[32px] border bg-white/80 p-5 shadow-sm backdrop-blur">
          <p className="mb-4 text-xs uppercase tracking-[0.18em] text-slate-400">
            Shared Report
          </p>
          <ReportCanvas report={payload} />
        </div>
      </div>
    </main>
  );
}
