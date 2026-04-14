export type RuntimeLogLevel = "silent" | "error" | "warn" | "info" | "debug";

const RUNTIME_LOG_LEVELS: Record<RuntimeLogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

function normalizeRuntimeLogLevel(value: unknown): RuntimeLogLevel | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "silent" || normalized === "error" || normalized === "warn") {
    return normalized;
  }
  if (normalized === "info" || normalized === "debug") return normalized;
  if (normalized === "none" || normalized === "off") return "silent";
  return null;
}

export function resolveRuntimeLogLevel(env: NodeJS.ProcessEnv = process.env): RuntimeLogLevel {
  const explicit = normalizeRuntimeLogLevel(env.APP_LOG_LEVEL ?? env.LOG_LEVEL);
  if (explicit) return explicit;
  return env.NODE_ENV === "production" ? "warn" : "debug";
}

export function isRuntimeLogLevelEnabled(
  level: Exclude<RuntimeLogLevel, "silent">,
  env: NodeJS.ProcessEnv = process.env,
) {
  return RUNTIME_LOG_LEVELS[resolveRuntimeLogLevel(env)] >= RUNTIME_LOG_LEVELS[level];
}

function emitRuntimeLog(
  method: "log" | "info" | "warn" | "error",
  scope: string,
  event: string,
  details?: unknown,
) {
  const message = `[${scope}] ${event}`;
  if (details === undefined) {
    console[method](message);
    return;
  }
  console[method](message, details);
}

export function logRuntimeDebug(scope: string, event: string, details?: unknown) {
  if (!isRuntimeLogLevelEnabled("debug")) return;
  emitRuntimeLog("log", scope, event, details);
}

export function logRuntimeInfo(scope: string, event: string, details?: unknown) {
  if (!isRuntimeLogLevelEnabled("info")) return;
  emitRuntimeLog("info", scope, event, details);
}

export function logRuntimeWarn(scope: string, event: string, details?: unknown) {
  if (!isRuntimeLogLevelEnabled("warn")) return;
  emitRuntimeLog("warn", scope, event, details);
}

export function logRuntimeError(scope: string, event: string, details?: unknown) {
  if (!isRuntimeLogLevelEnabled("error")) return;
  emitRuntimeLog("error", scope, event, details);
}
