import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const target = new URL(request.url);
  target.pathname = "/api/meta/creatives";
  target.searchParams.set("debugPreview", "1");
  if (!target.searchParams.has("previewSampleLimit")) {
    target.searchParams.set("previewSampleLimit", "10");
  }

  const response = await fetch(target.toString(), {
    method: "GET",
    headers: {
      cookie: request.headers.get("cookie") ?? "",
      authorization: request.headers.get("authorization") ?? "",
      accept: "application/json",
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json(
      payload ?? { error: "preview_debug_failed", message: "Preview debug request failed." },
      { status: response.status }
    );
  }

  return NextResponse.json(payload);
}
