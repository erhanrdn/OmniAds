import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type OverviewBenchmarkBaselineMap = Record<string, number>;

export const DEFAULT_OVERVIEW_BENCHMARK_BASELINE_FILE =
  "docs/benchmarks/overview-release-2026-04-07.json";

export function resolveOverviewBenchmarkBaselinePath(pathValue?: string | null) {
  return resolve(pathValue ?? DEFAULT_OVERVIEW_BENCHMARK_BASELINE_FILE);
}

export function loadOverviewBenchmarkBaselineMap(
  pathValue?: string | null,
): OverviewBenchmarkBaselineMap {
  const baselinePath = resolveOverviewBenchmarkBaselinePath(pathValue);
  let payload: {
    baseline?: Record<string, number>;
    scenarios?: Array<{ name?: string; averageMs?: number }>;
  };

  try {
    payload = JSON.parse(readFileSync(baselinePath, "utf8")) as typeof payload;
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return {};
    }
    throw error;
  }

  const map: OverviewBenchmarkBaselineMap = {};
  for (const [key, value] of Object.entries(payload.baseline ?? {})) {
    map[key] = value;
    if (key.endsWith("_ms")) {
      map[key.slice(0, -3)] = value;
    }
  }
  for (const scenario of payload.scenarios ?? []) {
    if (scenario.name && typeof scenario.averageMs === "number") {
      map[scenario.name] = scenario.averageMs;
    }
  }
  return map;
}
