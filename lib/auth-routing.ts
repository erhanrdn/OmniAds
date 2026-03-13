export interface AuthBusinessLike {
  id: string;
  membershipStatus?: "active" | "invited" | "pending";
}

export function sanitizeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  return value;
}

export function getPostLoginDestination(
  businesses: AuthBusinessLike[],
  activeBusinessId: string | null | undefined
): string {
  if (businesses.length === 0) {
    return "/businesses/new";
  }

  if (activeBusinessId && businesses.some((business) => business.id === activeBusinessId)) {
    return "/overview";
  }

  const firstActiveBusiness = businesses.find(
    (business) => !business.membershipStatus || business.membershipStatus === "active"
  );
  if (firstActiveBusiness) {
    return "/select-business";
  }

  return "/select-business";
}

export function resolvePostLoginDestination(input: {
  businesses: AuthBusinessLike[];
  activeBusinessId: string | null | undefined;
  nextPath?: string | null;
}): string {
  return (
    sanitizeNextPath(input.nextPath) ??
    getPostLoginDestination(input.businesses, input.activeBusinessId)
  );
}
