import { loadEnvConfig } from "@next/env";

export function configureOperationalScriptRuntime() {
  loadEnvConfig(process.cwd());

  if (!process.env.ENABLE_RUNTIME_MIGRATIONS?.trim()) {
    process.env.ENABLE_RUNTIME_MIGRATIONS = "0";
  }

  return {
    runtimeMigrationsEnabled: process.env.ENABLE_RUNTIME_MIGRATIONS === "1",
  };
}
