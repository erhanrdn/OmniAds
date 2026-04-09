import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/migrate/route";

describe("POST /api/migrate", () => {
  it("returns an explicit retired-entrypoint response", async () => {
    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(410);
    expect(payload).toEqual({
      status: "DISABLED",
      message:
        "HTTP-triggered migrations are retired. Use `npm run db:migrate` or `node --import tsx scripts/run-migrations.ts`.",
      entrypoint: "npm run db:migrate",
    });
  });
});
