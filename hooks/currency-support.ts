import type { Business } from "@/store/app-store";

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

export function resolveCurrencySymbol(
  businesses: Business[],
  selectedBusinessId: string | null
) {
  const business = businesses.find((entry) => entry.id === selectedBusinessId);
  const code = business?.currency ?? "USD";
  return CURRENCY_SYMBOLS[code] ?? code;
}
