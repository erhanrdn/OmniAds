type AuthDiagnostics = Record<string, unknown>;

function diagnosticsEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.AUTH_DEBUG === "1";
}

export function logServerAuthEvent(event: string, details: AuthDiagnostics) {
  if (!diagnosticsEnabled()) return;
  console.info(`[auth] ${event}`, details);
}

export function logClientAuthEvent(event: string, details: AuthDiagnostics) {
  if (!diagnosticsEnabled() || typeof window === "undefined") return;
  console.info(`[auth] ${event}`, details);
}
