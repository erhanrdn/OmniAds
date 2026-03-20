import { NextRequest, NextResponse } from "next/server";
import { requireBusinessAccess } from "@/lib/access";
import {
  deleteCustomReport,
  getCustomReportById,
  updateCustomReport,
} from "@/lib/custom-report-store";
import { ensureReportDefinition } from "@/lib/custom-reports";

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
  return NextResponse.json({ report });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params;
  const existing = await getCustomReportById(reportId);
  if (!existing) {
    return NextResponse.json(
      { error: "not_found", message: "Report not found." },
      { status: 404 }
    );
  }
  const access = await requireBusinessAccess({
    request,
    businessId: existing.businessId,
    minRole: "collaborator",
  });
  if ("error" in access) return access.error;

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        description?: string | null;
        templateId?: string | null;
        definition?: unknown;
      }
    | null;

  if (!body?.name) {
    return NextResponse.json(
      { error: "invalid_payload", message: "name is required." },
      { status: 400 }
    );
  }

  const report = await updateCustomReport({
    reportId,
    name: body.name.trim(),
    description: body.description ?? null,
    templateId: body.templateId ?? null,
    definition: ensureReportDefinition(body.definition as never),
  });

  return NextResponse.json({ report });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params;
  const existing = await getCustomReportById(reportId);
  if (!existing) {
    return NextResponse.json({ ok: true });
  }
  const access = await requireBusinessAccess({
    request,
    businessId: existing.businessId,
    minRole: "collaborator",
  });
  if ("error" in access) return access.error;

  await deleteCustomReport(reportId);
  return NextResponse.json({ ok: true });
}
