import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { getCustomReportById } from "@/lib/custom-report-store";
import { renderCustomReportRecord } from "@/lib/custom-report-renderer";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params;
  const report = await getCustomReportById(reportId);
  if (!report) {
    return NextResponse.json(
      { error: "not_found", message: "Report not found." },
      { status: 404 }
    );
  }
  const access = await requireBusinessAccess({
    request,
    businessId: report.businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  const rendered = await renderCustomReportRecord(request, report);
  return NextResponse.json({ report: rendered });
}
