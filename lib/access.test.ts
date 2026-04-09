import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/db-schema-readiness", () => ({
  getDbSchemaReadiness: vi.fn(),
}));

vi.mock("@/lib/migrations", () => ({
  runMigrations: vi.fn(),
}));

const access = await import("@/lib/access");
const db = await import("@/lib/db");
const schemaReadiness = await import("@/lib/db-schema-readiness");
const migrations = await import("@/lib/migrations");

describe("access request-path migration guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for membership reads when schema is not ready without running migrations", async () => {
    vi.mocked(schemaReadiness.getDbSchemaReadiness).mockResolvedValue({
      ready: false,
      missingTables: ["memberships"],
      checkedAt: "2026-04-09T00:00:00.000Z",
    });

    await expect(
      access.findMembership({
        userId: "user_1",
        businessId: "biz_1",
      }),
    ).resolves.toBeNull();

    expect(db.getDb).not.toHaveBeenCalled();
    expect(migrations.runMigrations).not.toHaveBeenCalled();
  });

  it("returns an empty workspace list when schema is not ready without running migrations", async () => {
    vi.mocked(schemaReadiness.getDbSchemaReadiness).mockResolvedValue({
      ready: false,
      missingTables: ["memberships", "businesses"],
      checkedAt: "2026-04-09T00:00:00.000Z",
    });

    await expect(access.listUserBusinesses("user_1")).resolves.toEqual([]);

    expect(db.getDb).not.toHaveBeenCalled();
    expect(migrations.runMigrations).not.toHaveBeenCalled();
  });
});
