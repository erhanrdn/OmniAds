import { isRuntimeLogLevelEnabled } from "@/lib/runtime-logging";

type PerfFields = Record<string, unknown>;

function shouldLogPerf() {
  if (process.env.NODE_ENV === "test") return false;
  return process.env.PERF_DEBUG === "1" || isRuntimeLogLevelEnabled("info");
}

function normalizeError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error ?? "unknown_error");
}

export function logPerfEvent(event: string, fields: PerfFields) {
  if (!shouldLogPerf()) return;
  console.info(`[perf] ${event}`, fields);
}

export async function measurePerf<T>(
  event: string,
  fields: PerfFields,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await operation();
    logPerfEvent(event, {
      ...fields,
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    logPerfEvent(`${event}_failed`, {
      ...fields,
      durationMs: Date.now() - startedAt,
      error: normalizeError(error),
    });
    throw error;
  }
}
