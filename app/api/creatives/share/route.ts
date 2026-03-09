import { NextRequest, NextResponse } from "next/server";
import type { SharePayload } from "@/components/creatives/shareCreativeTypes";
import { createCreativeShareSnapshot } from "@/lib/creative-share-store";
import { requireBusinessAccess } from "@/lib/access";

type CreateShareRequest = Omit<SharePayload, "token" | "createdAt">;
let shareApiPreviewTraceCount = 0;

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
  const businessId = (body as Partial<CreateShareRequest>).businessId ?? null;
  const access = await requireBusinessAccess({
    request,
    businessId,
    minRole: "guest",
  });
  if ("error" in access) return access.error;

  const creatives = (body as CreateShareRequest).creatives ?? [];
  if (shareApiPreviewTraceCount < 5) {
    const sample = creatives.slice(0, Math.max(0, 5 - shareApiPreviewTraceCount));
    for (const creative of sample) {
      shareApiPreviewTraceCount += 1;
      console.log("[preview-trace][stage-3-share-api-receive]", {
        id: creative.id,
        name: creative.name,
        thumbnailUrl: creative.thumbnailUrl ?? null,
        imageUrl: creative.imageUrl ?? null,
        previewUrl: creative.previewUrl ?? null,
      });
    }
  }

  const { token } = await createCreativeShareSnapshot(body);
  return NextResponse.json({
    token,
    url: `/share/creative/${token}`,
  });
}
