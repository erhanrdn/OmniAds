import { setSessionActiveBusiness, type SessionContext } from "@/lib/auth";
import { listUserBusinesses } from "@/lib/access";
import { scopeBusinessesForUser } from "@/lib/reviewer-access";
import { getCachedValue } from "@/lib/server-cache";

export async function resolveBusinessContext(session: SessionContext) {
  const cacheKey = [
    "business-context",
    session.sessionId,
    session.user.id,
    session.user.email.toLowerCase(),
    session.activeBusinessId ?? "none",
  ].join(":");
  const cached = await getCachedValue({
    key: cacheKey,
    ttlMs: 30_000,
    staleWhileRevalidateMs: 60_000,
    loader: async () => {
      const businesses = scopeBusinessesForUser(
        session.user.email,
        await listUserBusinesses(session.user.id)
      );
      const activeBusinessId =
        session.activeBusinessId && businesses.some((business) => business.id === session.activeBusinessId)
          ? session.activeBusinessId
          : businesses.find((business) => business.membershipStatus === "active")?.id ?? null;

      return {
        businesses,
        activeBusinessId,
      };
    },
  });
  const { businesses, activeBusinessId } = cached.value;

  if (activeBusinessId !== session.activeBusinessId) {
    await setSessionActiveBusiness(session.sessionId, activeBusinessId);
  }

  return {
    businesses,
    activeBusinessId,
  };
}
