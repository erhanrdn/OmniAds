import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/startup-diagnostics", () => ({
  logStartupError: vi.fn(),
  logStartupEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
  getDbWithTimeout: vi.fn(),
}));

const db = await import("@/lib/db");

describe("runMigrations", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ENABLE_RUNTIME_MIGRATIONS = "true";
  });

  it("uses the explicit timeout override DB client when provided", async () => {
    const sql = Object.assign(
      vi.fn(async () => []),
      {
        query: vi.fn(async () => []),
      }
    );
    vi.mocked(db.getDb).mockReturnValue(sql as never);
    vi.mocked(db.getDbWithTimeout).mockReturnValue(sql as never);

    const migrations = await import("@/lib/migrations");
    await migrations.runMigrations({
      force: true,
      reason: "test",
      timeoutMs: 120_000,
    });

    expect(db.getDbWithTimeout).toHaveBeenCalledWith(120_000);
    expect(db.getDb).not.toHaveBeenCalled();
  });
});
