export function normalizeCurrencyCode(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

const seenCurrencyDebugKeys = new Set<string>();

function shouldLogCurrencyDebug(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.NEXT_PUBLIC_CREATIVE_CURRENCY_DEBUG === "1";
}

export function resolveCreativeCurrency(
  rowCurrency: string | null | undefined,
  defaultCurrency: string | null | undefined
): string | null {
  return normalizeCurrencyCode(rowCurrency) ?? normalizeCurrencyCode(defaultCurrency) ?? null;
}

function currencyLocale(currency: string): string | undefined {
  if (currency === "TRY") return "tr-TR";
  if (currency === "USD") return "en-US";
  if (currency === "EUR") return "de-DE";
  if (currency === "GBP") return "en-GB";
  return undefined;
}

export function formatMoney(
  value: number,
  rowCurrency: string | null | undefined,
  defaultCurrency: string | null | undefined
): string {
  const currency = resolveCreativeCurrency(rowCurrency, defaultCurrency);
  if (shouldLogCurrencyDebug()) {
    const debugKey = `${rowCurrency ?? "null"}|${defaultCurrency ?? "null"}|${currency ?? "null"}`;
    if (!seenCurrencyDebugKeys.has(debugKey)) {
      seenCurrencyDebugKeys.add(debugKey);
      console.log("[creatives] currency formatter", {
        row_currency: rowCurrency ?? null,
        default_currency: defaultCurrency ?? null,
        resolved_currency: currency,
      });
    }
  }
  if (!currency) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return value.toLocaleString(currencyLocale(currency), {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
}
