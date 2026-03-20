import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import { renderCustomReportRecord, renderWidgetCsv } from "@/lib/custom-report-renderer";
import { getCustomReportById } from "@/lib/custom-report-store";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params;
  const widgetId = request.nextUrl.searchParams.get("widgetId");
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
  const widget =
    rendered.widgets.find((item) => item.id === widgetId) ??
    rendered.widgets.find((item) => item.type === "table");

  if (!widget || widget.type !== "table" || !widget.rows?.length) {
    return NextResponse.json(
      {
        error: "table_widget_required",
        message: "This report does not have an exportable table widget.",
      },
      { status: 400 }
    );
  }

  const csv = renderWidgetCsv(widget);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"${report.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}-${widget.id}.csv\"`,
    },
  });
}
