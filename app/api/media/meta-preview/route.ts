import { NextRequest, NextResponse } from "next/server";

const ALLOWED_META_HOST_SUFFIXES = [
  ".facebook.com",
  ".fbcdn.net",
  ".fbsbx.com",
  ".cdninstagram.com",
];

const ALLOWED_META_HOSTS = new Set([
  "facebook.com",
  "fbcdn.net",
  "fbsbx.com",
  "cdninstagram.com",
]);

function isAllowedMetaHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (ALLOWED_META_HOSTS.has(host)) return true;
  return ALLOWED_META_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

function toValidationError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("src");
  if (!src) {
    return toValidationError("Missing src query parameter.", 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return toValidationError("Invalid src URL.", 400);
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    return toValidationError("Unsupported src protocol.", 400);
  }

  if (!isAllowedMetaHost(parsed.hostname)) {
    return toValidationError("Only Meta/Facebook image URLs are allowed.", 400);
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      },
    });

    if (!upstream.ok || !upstream.body) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[meta-preview-proxy] upstream request failed", {
          src: parsed.toString(),
          status: upstream.status,
          statusText: upstream.statusText,
        });
      }
      return NextResponse.json(
        { error: "Failed to load upstream media.", upstreamStatus: upstream.status, upstreamStatusText: upstream.statusText },
        { status: upstream.status }
      );
    }

    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    const contentLength = upstream.headers.get("content-length");
    if (contentType) headers.set("content-type", contentType);
    if (contentLength) headers.set("content-length", contentLength);
    headers.set("cache-control", "private, max-age=900");

    if (process.env.NODE_ENV !== "production") {
      console.info("[meta-preview-proxy] upstream request success", {
        src: parsed.toString(),
        status: upstream.status,
        contentType: contentType ?? null,
      });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[meta-preview-proxy] unexpected error", {
        src: parsed.toString(),
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return NextResponse.json({ error: "Proxy fetch failed." }, { status: 502 });
  }
}
