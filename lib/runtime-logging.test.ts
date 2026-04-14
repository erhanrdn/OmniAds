import { describe, expect, it } from "vitest";
import { isRuntimeLogLevelEnabled, resolveRuntimeLogLevel } from "@/lib/runtime-logging";

describe("runtime logging", () => {
  it("defaults to debug outside production", () => {
    expect(resolveRuntimeLogLevel({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe("debug");
  });

  it("defaults to warn in production", () => {
    expect(resolveRuntimeLogLevel({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe("warn");
  });

  it("honors APP_LOG_LEVEL", () => {
    expect(
      resolveRuntimeLogLevel({
        NODE_ENV: "production",
        APP_LOG_LEVEL: "info",
      } as NodeJS.ProcessEnv)
    ).toBe("info");
  });

  it("accepts LOG_LEVEL alias and off-style values", () => {
    expect(
      resolveRuntimeLogLevel({
        NODE_ENV: "development",
        LOG_LEVEL: "off",
      } as NodeJS.ProcessEnv)
    ).toBe("silent");
  });

  it("enables levels at or below the configured threshold", () => {
    const env = { NODE_ENV: "production", APP_LOG_LEVEL: "info" } as NodeJS.ProcessEnv;
    expect(isRuntimeLogLevelEnabled("warn", env)).toBe(true);
    expect(isRuntimeLogLevelEnabled("info", env)).toBe(true);
    expect(isRuntimeLogLevelEnabled("debug", env)).toBe(false);
  });
});
