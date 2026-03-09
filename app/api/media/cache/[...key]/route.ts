import { NextRequest, NextResponse } from "next/server";
import { CacheRepository } from "@/lib/media-cache/cache-repository";
import { LocalStorageAdapter } from "@/lib/media-cache/storage-adapter";

const adapter = new LocalStorageAdapter();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<unknown> }
) {
  const resolved = (await params) as { key?: string[] } | null;
  const segments = Array.isArray(resolved?.key) ? resolved.key : [];
  const storageKey = segments.join("/");

  if (!storageKey || storageKey.includes("..")) {
    return NextResponse.json({ error: "Invalid key." }, { status: 400 });
  }

  // Verify the entry exists in the DB and is not expired
  const row = await CacheRepository.findByStorageKey(storageKey);
  if (!row || row.status !== "cached") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ error: "Expired." }, { status: 404 });
  }

  // Read from storage
  const file = await adapter.read(storageKey);
  if (!file) {
    // File missing on disk — mark as failed so the worker re-downloads
    await CacheRepository.setFailed(row.id, "File missing from storage");
    return NextResponse.json(
      { error: "File not found in storage." },
      { status: 404 }
    );
  }

  return new NextResponse(new Uint8Array(file.data), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.data.length),
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
