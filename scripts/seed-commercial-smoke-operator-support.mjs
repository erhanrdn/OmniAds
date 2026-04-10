import { randomBytes } from "node:crypto";

export function generateCommercialSmokeOperatorPassword() {
  return `Adsecute-${randomBytes(12).toString("base64url")}`;
}

export function resolveCommercialSmokeOperatorConfig(env = process.env) {
  const email = (env.COMMERCIAL_SMOKE_OPERATOR_EMAIL ?? "commercial-smoke@adsecute.com")
    .trim()
    .toLowerCase();
  const name = (env.COMMERCIAL_SMOKE_OPERATOR_NAME ?? "Commercial Smoke Operator").trim();
  const suppliedPassword = env.COMMERCIAL_SMOKE_OPERATOR_PASSWORD?.trim();

  return {
    email,
    name,
    password:
      suppliedPassword && suppliedPassword.length > 0
        ? suppliedPassword
        : generateCommercialSmokeOperatorPassword(),
    passwordSource:
      suppliedPassword && suppliedPassword.length > 0
        ? "env"
        : "generated_runtime",
  };
}
