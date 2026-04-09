import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json(
    {
      status: "DISABLED",
      message:
        "HTTP-triggered migrations are retired. Use `npm run db:migrate` or `node --import tsx scripts/run-migrations.ts`.",
      entrypoint: "npm run db:migrate",
    },
    { status: 410 },
  );
}
