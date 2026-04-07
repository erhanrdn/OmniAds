type PerfFields = Record<string, unknown>;

function shouldLogPerf() {
  return process.env.NODE_ENV !== "test";
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
