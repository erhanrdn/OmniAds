import { NextResponse } from "next/server";
import { runMigrations } from "@/lib/migrations";

/**
 * POST /api/migrate
 *
 * Runs all database migrations.
 * Idempotent — safe to call multiple times.
 */
export async function POST() {
  try {
    await runMigrations();
    return NextResponse.json({ status: "OK", message: "Migrations applied successfully." });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { status: "FAILED", error: message },
      { status: 500 }
    );
  }
}
