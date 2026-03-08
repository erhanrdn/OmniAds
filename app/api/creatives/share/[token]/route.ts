import { NextRequest, NextResponse } from "next/server";
import { getCreativeShareSnapshot } from "@/lib/creative-share-store";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const payload = await getCreativeShareSnapshot(token);
  if (!payload) {
    return NextResponse.json(
      { error: "not_found", message: "Share link not found or expired." },
      { status: 404 }
    );
  }
  return NextResponse.json({ payload });
}
