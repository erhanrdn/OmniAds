import { describe, expect, it } from "vitest";
import { resolveReviewerSeedConfig } from "@/scripts/seed-reviewer-account-support.mjs";

describe("resolveReviewerSeedConfig", () => {
  it("uses the env-supplied password when present", () => {
    const config = resolveReviewerSeedConfig({
      SHOPIFY_REVIEWER_EMAIL: "Reviewer@Adsecute.com",
      SHOPIFY_REVIEWER_NAME: "Reviewer",
      SHOPIFY_REVIEWER_PASSWORD: "Secret-123",
    } as any);

    expect(config.email).toBe("reviewer@adsecute.com");
    expect(config.name).toBe("Reviewer");
    expect(config.password).toBe("Secret-123");
    expect(config.passwordSource).toBe("env");
  });

  it("generates a runtime password when none is supplied", () => {
    const config = resolveReviewerSeedConfig({
      SHOPIFY_REVIEWER_EMAIL: "shopify-review@adsecute.com",
      SHOPIFY_REVIEWER_NAME: "Reviewer",
    } as any);

    expect(config.passwordSource).toBe("generated_runtime");
    expect(config.password).toMatch(/^Adsecute-/);
    expect(config.password).not.toBe("AdsecuteReview!2026");
  });
});
