import { randomBytes } from "node:crypto";

export function generateReviewerPassword() {
  return `Adsecute-${randomBytes(12).toString("base64url")}`;
}

export function resolveReviewerSeedConfig(env = process.env) {
  const email = (env.SHOPIFY_REVIEWER_EMAIL ?? "shopify-review@adsecute.com")
    .trim()
    .toLowerCase();
  const name = (env.SHOPIFY_REVIEWER_NAME ?? "Shopify App Reviewer").trim();
  const suppliedPassword = env.SHOPIFY_REVIEWER_PASSWORD?.trim();

  return {
    email,
    name,
    password: suppliedPassword && suppliedPassword.length > 0
      ? suppliedPassword
      : generateReviewerPassword(),
    passwordSource: suppliedPassword && suppliedPassword.length > 0
      ? "env"
      : "generated_runtime",
  };
}
