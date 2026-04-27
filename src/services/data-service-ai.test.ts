import { afterEach, describe, expect, it, vi } from "vitest";
import { getCreativeDecisionOsV2Preview } from "@/src/services/data-service-ai";

function previewResponse(enabled: boolean) {
  return new Response(
    JSON.stringify({
      contractVersion: "creative-decision-os-v2-preview.v0.1.1",
      enabled,
      status: "not_run",
      scope: {
        analysisScope: "account",
        analysisScopeId: null,
        analysisScopeLabel: "Account-wide",
        benchmarkScope: "account",
        benchmarkScopeId: null,
        benchmarkScopeLabel: "Account-wide",
      },
      generatedAt: "2026-04-27T12:00:00.000Z",
      decisionOsV2Preview: null,
      error: null,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function mutatingFetchCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([, init]) => {
    const method = String((init as RequestInit | undefined)?.method ?? "GET").toUpperCase();
    return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  });
}

describe("getCreativeDecisionOsV2Preview", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses a read-only GET request when the v2 preview flag is enabled", async () => {
    const fetchMock = vi.fn(async () => previewResponse(true));
    vi.stubGlobal("fetch", fetchMock);

    await getCreativeDecisionOsV2Preview("business-1", {
      enabled: true,
      benchmarkScope: {
        scope: "campaign",
        scopeId: "campaign-1",
        scopeLabel: "Campaign 1",
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mutatingFetchCalls(fetchMock)).toEqual([]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/creatives/decision-os-v2/preview");
    expect(parsed.searchParams.get("businessId")).toBe("business-1");
    expect(parsed.searchParams.get("creativeDecisionOsV2Preview")).toBe("1");
    expect(parsed.searchParams.get("benchmarkScope")).toBe("campaign");
    expect(parsed.searchParams.get("benchmarkScopeId")).toBe("campaign-1");
    expect(parsed.searchParams.get("benchmarkScopeLabel")).toBe("Campaign 1");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.cache).toBe("no-store");
  });

  it("keeps the preview endpoint GET-only when the flag is omitted", async () => {
    const fetchMock = vi.fn(async () => previewResponse(false));
    vi.stubGlobal("fetch", fetchMock);

    await getCreativeDecisionOsV2Preview("business-1", { enabled: false });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mutatingFetchCalls(fetchMock)).toEqual([]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/api/creatives/decision-os-v2/preview");
    expect(parsed.searchParams.get("creativeDecisionOsV2Preview")).toBeNull();
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });
});
