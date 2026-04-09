import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/db-schema-readiness", () => ({
  getDbSchemaReadiness: vi.fn(),
}));

vi.mock("@/lib/migrations", () => ({
  runMigrations: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

const auth = await import("@/lib/auth");
const db = await import("@/lib/db");
const schemaReadiness = await import("@/lib/db-schema-readiness");
const migrations = await import("@/lib/migrations");

describe("auth request-path migration guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null from request session reads when auth tables are not ready without running migrations", async () => {
    vi.mocked(schemaReadiness.getDbSchemaReadiness).mockResolvedValue({
      ready: false,
      missingTables: ["sessions", "users"],
      checkedAt: "2026-04-09T00:00:00.000Z",
    });

    const request = new NextRequest("http://localhost/api/test", {
      headers: {
        cookie: `omniads_session=${"a".repeat(64)}`,
      },
    });

    await expect(auth.getSessionFromRequest(request)).resolves.toBeNull();

    expect(db.getDb).not.toHaveBeenCalled();
    expect(migrations.runMigrations).not.toHaveBeenCalled();
  });
});
