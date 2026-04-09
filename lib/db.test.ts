import { describe, expect, it } from "vitest";
import { resolveDbTimeoutMs } from "@/lib/db";

describe("resolveDbTimeoutMs", () => {
  it("uses the interactive default when worker mode is disabled", () => {
    expect(resolveDbTimeoutMs({} as NodeJS.ProcessEnv)).toBe(8_000);
  });

  it("uses the worker default when sync worker mode is enabled", () => {
    expect(
      resolveDbTimeoutMs({ SYNC_WORKER_MODE: "1" } as unknown as NodeJS.ProcessEnv),
    ).toBe(30_000);
    expect(
      resolveDbTimeoutMs({ SYNC_WORKER_MODE: "true" } as unknown as NodeJS.ProcessEnv),
    ).toBe(30_000);
  });

  it("lets explicit DB_QUERY_TIMEOUT_MS override the worker fallback", () => {
    expect(
      resolveDbTimeoutMs({
        SYNC_WORKER_MODE: "1",
        DB_QUERY_TIMEOUT_MS: "45000",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(45_000);
  });
});
