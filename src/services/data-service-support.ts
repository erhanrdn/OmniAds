export function getApiOrigin() {
  return typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
}

export function buildApiUrl(path: string, baseUrl?: string) {
  return new URL(baseUrl ?? path, baseUrl ? undefined : getApiOrigin());
}

export async function readJsonResponse(response: Response) {
  return response.json().catch(() => null);
}

export function getApiErrorMessage(
  payload: unknown,
  fallback: string
) {
  if (payload && typeof payload === "object" && "message" in payload) {
    return String((payload as { message?: unknown }).message ?? fallback);
  }

  return fallback;
}
