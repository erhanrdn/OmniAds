import type { AccountOperatingModePayload } from "@/src/types/business-commercial";

export async function fetchBusinessOperatingMode(input: {
  businessId: string;
  startDate: string;
  endDate: string;
}) {
  const params = new URLSearchParams({
    businessId: input.businessId,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  const response = await fetch(`/api/business-operating-mode?${params.toString()}`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const payload =
    (await response.json().catch(() => null)) as
      | AccountOperatingModePayload
      | { message?: string }
      | null;
  const message =
    payload && "message" in payload && typeof payload.message === "string"
      ? payload.message
      : null;
  if (!response.ok || !payload || !("currentMode" in payload)) {
    throw new Error(message ?? "Could not load operating mode.");
  }
  return payload;
}

export function getOperatingModeTone(mode: AccountOperatingModePayload["currentMode"]) {
  if (mode === "Recovery") {
    return {
      panel: "border-rose-200 bg-rose-50",
      badge: "bg-rose-600 text-white",
    };
  }
  if (mode === "Peak / Promo") {
    return {
      panel: "border-amber-200 bg-amber-50",
      badge: "bg-amber-500 text-white",
    };
  }
  if (mode === "Margin Protect") {
    return {
      panel: "border-orange-200 bg-orange-50",
      badge: "bg-orange-600 text-white",
    };
  }
  if (mode === "Exploit") {
    return {
      panel: "border-emerald-200 bg-emerald-50",
      badge: "bg-emerald-600 text-white",
    };
  }
  if (mode === "Stabilize") {
    return {
      panel: "border-sky-200 bg-sky-50",
      badge: "bg-sky-600 text-white",
    };
  }
  return {
    panel: "border-slate-200 bg-slate-50",
    badge: "bg-slate-700 text-white",
  };
}
