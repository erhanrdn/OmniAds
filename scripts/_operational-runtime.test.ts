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
      runOperationalMigrationsIfEnabled({
        runtimeMigrationsEnabled: true,
        lane: "owner_maintenance",
      }),
    ).resolves.toBe(true);
    expect(runMigrationsMock).toHaveBeenCalledTimes(1);
  });

  it("rejects migration attempts from read-only observation scripts", async () => {
    const { runOperationalMigrationsIfEnabled } = await import("./_operational-runtime");
    await expect(
      runOperationalMigrationsIfEnabled({
        runtimeMigrationsEnabled: true,
        scriptName: "meta-state-check",
      }),
    ).rejects.toThrow(
      "meta-state-check is a read-only observation script and must not run migrations.",
    );
    expect(runMigrationsMock).not.toHaveBeenCalled();
  });
});

describe("assertOperationalOwnerMaintenance", () => {
  beforeEach(() => {
    delete process.env.ENABLE_RUNTIME_MIGRATIONS;
  });

  it("requires explicit opt-in for owner-maintenance scripts", async () => {
    const { assertOperationalOwnerMaintenance } = await import("./_operational-runtime");
    expect(() =>
      assertOperationalOwnerMaintenance({
        runtimeMigrationsEnabled: false,
        scriptName: "meta-truth-state-cleanup",
      }),
    ).toThrow(
      "meta-truth-state-cleanup is an owner-maintenance script. Re-run with ENABLE_RUNTIME_MIGRATIONS=1 only after confirming the target DB/context.",
    );
  });

  it("allows owner-maintenance scripts when explicitly enabled", async () => {
    const { assertOperationalOwnerMaintenance } = await import("./_operational-runtime");
    expect(
      assertOperationalOwnerMaintenance({
        runtimeMigrationsEnabled: true,
        scriptName: "meta-truth-state-cleanup",
      }),
    ).toBe(true);
  });
});
