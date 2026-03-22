import type {
  LandingPageAiCommentaryResponse,
  LandingPageAiReport,
  LandingPagePerformanceResponse,
} from "@/src/types/landing-pages";
import {
  buildApiUrl,
  getApiErrorMessage,
  readJsonResponse,
} from "@/src/services/data-service-support";

export async function getLandingPagePerformance(
  businessId: string,
  startDate: string,
  endDate: string
): Promise<LandingPagePerformanceResponse> {
  const url = buildApiUrl("/api/analytics/landing-page-performance");
  url.searchParams.set("businessId", businessId);
  url.searchParams.set("startDate", startDate);
  url.searchParams.set("endDate", endDate);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const error = new Error(
      getApiErrorMessage(payload, `Landing page performance request failed with status ${response.status}`)
    ) as Error & { payload?: unknown };
    error.payload = payload;
    throw error;
  }

  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { rows?: unknown }).rows)) {
    throw new Error("Landing page performance API returned an invalid payload.");
  }

  return payload as LandingPagePerformanceResponse;
}

export async function getLandingPageAiCommentary(
  businessId: string,
  report: LandingPageAiReport
): Promise<LandingPageAiCommentaryResponse> {
  const url = buildApiUrl("/api/ai/landing-pages/commentary");

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ businessId, report }),
  });

  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const error = new Error(
      getApiErrorMessage(payload, `Landing page AI commentary request failed with status ${response.status}`)
    ) as Error & { payload?: unknown };
    error.payload = payload;
    throw error;
  }

  if (!payload || typeof payload !== "object" || !("commentary" in payload)) {
    throw new Error("Landing page AI commentary API returned an invalid payload.");
  }

  return payload as LandingPageAiCommentaryResponse;
}
