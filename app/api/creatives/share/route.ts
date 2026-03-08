import { NextRequest, NextResponse } from "next/server";
import type { SharePayload } from "@/components/creatives/shareCreativeTypes";
import { createCreativeShareSnapshot } from "@/lib/creative-share-store";

type CreateShareRequest = Omit<SharePayload, "token" | "createdAt">;

function isValidPayload(payload: unknown): payload is CreateShareRequest {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as Partial<CreateShareRequest>;
  return (
    typeof obj.title === "string" &&
    typeof obj.dateRange === "string" &&
    typeof obj.expiresAt === "string" &&
    Array.isArray(obj.metrics) &&
    Array.isArray(obj.creatives)
  );
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as unknown;
  if (!isValidPayload(body)) {
    return NextResponse.json(
      { error: "invalid_payload", message: "Share payload is invalid." },
      { status: 400 }
    );
  }

  const { token } = await createCreativeShareSnapshot(body);
  return NextResponse.json({
    token,
    url: `/share/creative/${token}`,
  });
}
