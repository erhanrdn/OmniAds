import { beforeEach, describe, expect, it, vi } from "vitest";

const runMigrationsMock = vi.fn();

vi.mock("@/lib/migrations", () => ({
  runMigrations: runMigrationsMock,
}));

describe("runOperationalMigrationsIfEnabled", () => {
  beforeEach(() => {
    runMigrationsMock.mockReset();
    delete process.env.ENABLE_RUNTIME_MIGRATIONS;
  });

  it("does not run migrations by default", async () => {
    const { runOperationalMigrationsIfEnabled } = await import("./_operational-runtime");
    await expect(runOperationalMigrationsIfEnabled()).resolves.toBe(false);
    expect(runMigrationsMock).not.toHaveBeenCalled();
  });

  it("runs migrations when explicitly enabled", async () => {
    const { runOperationalMigrationsIfEnabled } = await import("./_operational-runtime");
    await expect(
      runOperationalMigrationsIfEnabled({ runtimeMigrationsEnabled: true }),
    ).resolves.toBe(true);
    expect(runMigrationsMock).toHaveBeenCalledTimes(1);
  });
});
