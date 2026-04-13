import { describe, expect, it } from "vitest";
import { buildParameterizedQuery, resolveDbPoolMax, resolveDbTimeoutMs } from "@/lib/db";

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

  it("uses the interactive default pool size when worker mode is disabled", () => {
    expect(resolveDbPoolMax({} as NodeJS.ProcessEnv)).toBe(10);
  });

  it("uses the worker pool default when sync worker mode is enabled", () => {
    expect(
      resolveDbPoolMax({ SYNC_WORKER_MODE: "1" } as unknown as NodeJS.ProcessEnv),
    ).toBe(20);
  });
});

describe("buildParameterizedQuery", () => {
  it("converts a tagged template into a parameterized query", () => {
    expect(
      buildParameterizedQuery(
        ["SELECT * FROM users WHERE id = ", " AND email = ", ""] as unknown as TemplateStringsArray,
        ["user-1", "test@example.com"],
      ),
    ).toEqual({
      text: "SELECT * FROM users WHERE id = $1 AND email = $2",
      values: ["user-1", "test@example.com"],
    });
  });

  it("normalizes undefined values to null", () => {
    expect(
      buildParameterizedQuery(
        ["SELECT * FROM users WHERE avatar IS NOT DISTINCT FROM ", ""] as unknown as TemplateStringsArray,
        [undefined],
      ),
    ).toEqual({
      text: "SELECT * FROM users WHERE avatar IS NOT DISTINCT FROM $1",
      values: [null],
    });
  });
});
