import crypto from "crypto";

import { sanitizeNextPath } from "@/lib/auth-routing";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function createShopifyOAuthState(input: {
  businessId?: string | null;
  returnTo?: string | null;
  host?: string | null;
}) {
  return Buffer.from(
    JSON.stringify({
      businessId:
        typeof input.businessId === "string" && input.businessId.trim()
          ? input.businessId
          : null,
      returnTo: sanitizeNextPath(input.returnTo) ?? null,
      host:
        typeof input.host === "string" && input.host.trim()
          ? input.host.trim()
          : null,
      nonce: crypto.randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");
}

export function parseShopifyOAuthState(state: string) {
  try {
    const decoded = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8"),
    ) as unknown;
    if (!isRecord(decoded) || typeof decoded.nonce !== "string" || !decoded.nonce) {
      return null;
    }

    return {
      businessId:
        typeof decoded.businessId === "string" && decoded.businessId.trim()
          ? decoded.businessId
          : null,
      returnTo: sanitizeNextPath(
        typeof decoded.returnTo === "string" ? decoded.returnTo : null,
      ),
      host:
        typeof decoded.host === "string" && decoded.host.trim()
          ? decoded.host.trim()
          : null,
      nonce: decoded.nonce,
    };
  } catch {
    return null;
  }
}

export function validateShopifyOAuthCallbackState(input: {
  state: string | null;
  cookieState: string | null;
}) {
  if (input.cookieState && !input.state) {
    return { valid: false as const, reason: "missing_state", parsedState: null };
  }

  if (input.cookieState && input.state !== input.cookieState) {
    return { valid: false as const, reason: "state_mismatch", parsedState: null };
  }

  if (!input.state) {
    return { valid: true as const, reason: "state_absent", parsedState: null };
  }

  const parsedState = parseShopifyOAuthState(input.state);
  if (!parsedState) {
    return { valid: false as const, reason: "malformed_state", parsedState: null };
  }

  return {
    valid: true as const,
    reason: input.cookieState ? "state_verified" : "state_unverified",
    parsedState,
  };
}
