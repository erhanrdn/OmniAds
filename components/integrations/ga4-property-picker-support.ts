export interface GA4Property {
  propertyId: string;
  propertyName: string;
  accountId: string;
  accountName: string;
}

function extractMessage(payload: unknown, fallback: string) {
  return payload && typeof payload === "object" && "message" in payload
    ? (payload as { message: string }).message
    : fallback;
}

export async function fetchGa4Properties(businessId: string): Promise<{
  properties: GA4Property[];
  selectedPropertyId: string | null;
  error: string | null;
}> {
  try {
    const response = await fetch(
      `/api/google-analytics/properties?businessId=${encodeURIComponent(businessId)}`,
      { method: "GET", headers: { Accept: "application/json" } }
    );

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        properties: [],
        selectedPropertyId: null,
        error: extractMessage(payload, "Could not load GA4 properties."),
      };
    }

    return {
      properties: Array.isArray(payload?.data) ? payload.data : [],
      selectedPropertyId:
        payload && typeof payload === "object" && "selectedPropertyId" in payload
          ? ((payload as { selectedPropertyId?: string | null }).selectedPropertyId ?? null)
          : null,
      error: null,
    };
  } catch (error) {
    return {
      properties: [],
      selectedPropertyId: null,
      error: error instanceof Error ? error.message : "Could not load GA4 properties.",
    };
  }
}

export async function saveGa4PropertySelection(params: {
  businessId: string;
  property: GA4Property;
}): Promise<{ error: string | null }> {
  try {
    const res = await fetch("/api/google-analytics/select-property", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessId: params.businessId,
        propertyId: params.property.propertyId,
        propertyName: params.property.propertyName,
        accountId: params.property.accountId,
        accountName: params.property.accountName,
      }),
    });

    const payload = await res.json().catch(() => null);
    return {
      error: res.ok ? null : extractMessage(payload, "Could not save property selection."),
    };
  } catch {
    return { error: "Could not save property selection." };
  }
}
