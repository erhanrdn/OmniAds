import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, destroySessionByRequest } from "@/lib/auth";

export async function POST(request: NextRequest) {
  await destroySessionByRequest(request);
  const response = NextResponse.json({ status: "ok" });
  clearSessionCookie(response);
  return response;
}

