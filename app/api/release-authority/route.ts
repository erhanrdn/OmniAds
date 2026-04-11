import { NextResponse } from "next/server";
import { getReleaseAuthorityReport } from "@/lib/release-authority/report";

export async function GET() {
  const report = await getReleaseAuthorityReport();
  return NextResponse.json(report, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
