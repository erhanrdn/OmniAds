import { NextRequest, NextResponse } from "next/server";
import { runDailyInsights } from "@/lib/ai/run-daily-insights";

/**
 * POST /api/ai/cron
 *
 * Triggers the daily AI insight generation for all businesses.
 * Protected by a shared CRON_SECRET to ensure only authorized callers
 * (e.g. system cron, any external scheduler) can trigger it.
 *
 * Set CRON_SECRET in your environment variables and pass it as:
 *   Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await runDailyInsights();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ai-cron] Fatal error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
