import { setSessionActiveBusiness, type SessionContext } from "@/lib/auth";
import { listUserBusinesses } from "@/lib/access";
import { scopeBusinessesForUser } from "@/lib/reviewer-access";

export async function resolveBusinessContext(session: SessionContext) {
  const businesses = scopeBusinessesForUser(
    session.user.email,
    await listUserBusinesses(session.user.id)
  );
  const activeBusinessId =
    session.activeBusinessId && businesses.some((business) => business.id === session.activeBusinessId)
      ? session.activeBusinessId
      : businesses.find((business) => business.membershipStatus === "active")?.id ?? null;

  if (activeBusinessId !== session.activeBusinessId) {
    await setSessionActiveBusiness(session.sessionId, activeBusinessId);
  }

  return {
    businesses,
    activeBusinessId,
  };
}
