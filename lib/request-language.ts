import type { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getPreferredLanguage, LANGUAGE_COOKIE_NAME, type AppLanguage } from "@/lib/i18n";

export async function resolveRequestLanguage(request: NextRequest): Promise<AppLanguage> {
  const session = await getSessionFromRequest(request);
  return getPreferredLanguage({
    userLanguage: session?.user.language,
    cookieLanguage: request.cookies.get(LANGUAGE_COOKIE_NAME)?.value ?? null,
  });
}
