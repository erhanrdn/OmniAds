import { useAppStore } from "@/store/app-store";
import { CURRENCY_SYMBOLS, resolveCurrencySymbol } from "@/hooks/currency-support";

/** Use inside React components */
export function useCurrencySymbol(): string {
  const businesses = useAppStore((s) => s.businesses);
  const selectedBusinessId = useAppStore((s) => s.selectedBusinessId);
  return resolveCurrencySymbol(businesses, selectedBusinessId);
}

/** Use outside React (e.g. in plain formatter functions) */
export function getCurrencySymbol(): string {
  const state = useAppStore.getState();
  return resolveCurrencySymbol(state.businesses, state.selectedBusinessId);
}
