import type { Business } from "@/store/app-store";

const DEMO_BUSINESS_FALLBACK_ID = "11111111-1111-4111-8111-111111111111";

export function isDemoBusinessSelected(
  businessId: string | null | undefined,
  businesses: Business[]
): boolean {
  if (!businessId) return false;
  const selected = businesses.find((business) => business.id === businessId);
  if (selected?.isDemoBusiness) return true;
  return businessId === DEMO_BUSINESS_FALLBACK_ID;
}

