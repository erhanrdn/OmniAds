import { DEMO_BUSINESS_ID } from "@/lib/demo-business";

export const SHOPIFY_REVIEWER_EMAIL =
  process.env.SHOPIFY_REVIEWER_EMAIL?.trim().toLowerCase() ??
  "shopify-review@adsecute.com";

export function isReviewerEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === SHOPIFY_REVIEWER_EMAIL;
}

export function canReviewerAccessBusiness(
  email: string | null | undefined,
  businessId: string | null | undefined
): boolean {
  if (!isReviewerEmail(email)) return true;
  return businessId === DEMO_BUSINESS_ID;
}

export function scopeBusinessesForUser<T extends { id: string }>(
  email: string | null | undefined,
  businesses: T[]
): T[] {
  if (!isReviewerEmail(email)) return businesses;
  return businesses.filter((business) => business.id === DEMO_BUSINESS_ID);
}
