import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "omniads_session";

const PUBLIC_PAGE_PREFIXES = [
  "/login",
  "/signup",
  "/invite",
  "/share",
  "/privacy",
  "/terms",
  "/contact",
  "/security",
];
const PUBLIC_API_PREFIXES = [
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/invite",
  "/api/creatives/share",
];

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(AUTH_COOKIE)?.value);

  if (pathname.startsWith("/api/")) {
    if (isPublicApi(pathname)) {
      return NextResponse.next();
    }
    if (!hasSession) {
      return NextResponse.json(
        { error: "auth_error", message: "Authentication required." },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(hasSession ? "/overview" : "/login", request.url));
  }

  if (!isPublicPage(pathname) && !pathname.startsWith("/_next") && !pathname.includes(".")) {
    if (!hasSession) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  if ((pathname === "/login" || pathname === "/signup") && hasSession) {
    return NextResponse.redirect(new URL("/overview", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
