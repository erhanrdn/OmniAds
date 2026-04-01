import { NextRequest, NextResponse } from "next/server";
import { requireInternalOrAdminSyncAccess } from "@/lib/internal-sync-auth";
import { runSyncSoakGate } from "@/lib/sync/soak-gate";

export async function GET(request: NextRequest) {
  const access = await requireInternalOrAdminSyncAccess(request);
  if (access.error) return access.error;

  try {
    const { result } = await runSyncSoakGate();
    return NextResponse.json(result, {
      status: result.outcome === "pass" ? 200 : 503,
    });
  } catch (error) {
    console.error("[sync-soak GET]", error);
    return NextResponse.json(
      { error: "internal_error", message: String(error) },
      { status: 500 }
    );
  }
}
