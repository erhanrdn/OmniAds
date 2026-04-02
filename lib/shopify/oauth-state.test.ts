import { describe, expect, it } from "vitest";

import {
  createShopifyOAuthState,
  parseShopifyOAuthState,
  validateShopifyOAuthCallbackState,
} from "@/lib/shopify/oauth-state";

describe("shopify oauth state helpers", () => {
  it("creates and parses a valid state payload", () => {
    const state = createShopifyOAuthState({
      businessId: "biz_1",
      returnTo: "/integrations",
      host: "admin.shopify.com/store/demo",
    });

    expect(parseShopifyOAuthState(state)).toEqual(
      expect.objectContaining({
        businessId: "biz_1",
        returnTo: "/integrations",
        host: "admin.shopify.com/store/demo",
      }),
    );
  });

  it("rejects malformed callback state", () => {
    expect(
      validateShopifyOAuthCallbackState({
        state: "not-base64-json",
        cookieState: null,
      }),
    ).toEqual(
      expect.objectContaining({
        valid: false,
        reason: "malformed_state",
      }),
    );
  });

  it("fails closed when the cookie exists but the state is missing", () => {
    expect(
      validateShopifyOAuthCallbackState({
        state: null,
        cookieState: "expected",
      }),
    ).toEqual(
      expect.objectContaining({
        valid: false,
        reason: "missing_state",
      }),
    );
  });

  it("fails closed on a cookie mismatch", () => {
    const state = createShopifyOAuthState({});
    expect(
      validateShopifyOAuthCallbackState({
        state,
        cookieState: `${state}-mismatch`,
      }),
    ).toEqual(
      expect.objectContaining({
        valid: false,
        reason: "state_mismatch",
      }),
    );
  });
});
