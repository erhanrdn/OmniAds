type StartupDetails = Record<string, unknown>;

function startupDiagnosticsEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.STARTUP_DEBUG === "1";
}

export function logStartupEvent(event: string, details: StartupDetails = {}) {
  if (!startupDiagnosticsEnabled()) return;
  console.info(`[startup] ${event}`, details);
}

export function logStartupError(event: string, error: unknown, details: StartupDetails = {}) {
  if (!startupDiagnosticsEnabled()) return;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[startup] ${event}`, {
    ...details,
    message,
  });
}
