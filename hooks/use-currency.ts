import { useAppStore } from "@/store/app-store";

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  TRY: "₺",
  JPY: "¥",
  CAD: "CA$",
  AUD: "A$",
  CHF: "Fr",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  PLN: "zł",
  CZK: "Kč",
  HUF: "Ft",
  RON: "lei",
  BRL: "R$",
  MXN: "MX$",
  INR: "₹",
  ZAR: "R",
  AED: "د.إ",
  SAR: "﷼",
};

/** Use inside React components */
export function useCurrencySymbol(): string {
  const businesses = useAppStore((s) => s.businesses);
  const selectedBusinessId = useAppStore((s) => s.selectedBusinessId);
  const business = businesses.find((b) => b.id === selectedBusinessId);
  const code = business?.currency ?? "USD";
  return CURRENCY_SYMBOLS[code] ?? code;
}

/** Use outside React (e.g. in plain formatter functions) */
export function getCurrencySymbol(): string {
  const state = useAppStore.getState();
  const business = state.businesses.find((b) => b.id === state.selectedBusinessId);
  const code = business?.currency ?? "USD";
  return CURRENCY_SYMBOLS[code] ?? code;
}
