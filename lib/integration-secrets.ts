import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const SECRET_PREFIX = "enc:v1";
const IV_BYTES = 12;
const INTEGRATION_SECRET_KEY_REQUIRED_CODE = "INTEGRATION_SECRET_KEY_REQUIRED";
const INTEGRATION_SECRET_UNREADABLE_CODE = "INTEGRATION_SECRET_UNREADABLE";

export class IntegrationSecretKeyRequiredError extends Error {
  code = INTEGRATION_SECRET_KEY_REQUIRED_CODE;

  constructor(message: string) {
    super(message);
    this.name = "IntegrationSecretKeyRequiredError";
  }
}

export class IntegrationSecretUnreadableError extends Error {
  code = INTEGRATION_SECRET_UNREADABLE_CODE;
  override cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "IntegrationSecretUnreadableError";
    this.cause = options?.cause;
  }
}

export function isIntegrationSecretKeyRequiredError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === INTEGRATION_SECRET_KEY_REQUIRED_CODE
  );
}

export function isIntegrationSecretUnreadableError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === INTEGRATION_SECRET_UNREADABLE_CODE
  );
}

function getDerivedKey() {
  const raw = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  return createHash("sha256").update(raw, "utf8").digest();
}

export function requireIntegrationSecretKey() {
  const key = getDerivedKey();
  if (!key) {
    throw new IntegrationSecretKeyRequiredError(
      "INTEGRATION_TOKEN_ENCRYPTION_KEY is required before persisting integration secrets."
    );
  }
  return key;
}

export function isEncryptedIntegrationSecret(value: string | null | undefined) {
  return typeof value === "string" && value.startsWith(`${SECRET_PREFIX}:`);
}

export function encryptIntegrationSecret(value: string | null | undefined) {
  if (!value) return null;
  if (isEncryptedIntegrationSecret(value)) return value;

  const key = requireIntegrationSecretKey();

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    SECRET_PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptIntegrationSecret(value: string | null | undefined) {
  if (!value) return null;
  if (!isEncryptedIntegrationSecret(value)) return value;

  const key = getDerivedKey();
  if (!key) {
    throw new IntegrationSecretKeyRequiredError(
      "INTEGRATION_TOKEN_ENCRYPTION_KEY is required to decrypt integration secrets."
    );
  }

  const parts = value.split(":");
  const ivBase64 = parts[2];
  const tagBase64 = parts[3];
  const payloadBase64 = parts.slice(4).join(":");
  if (!ivBase64 || !tagBase64 || !payloadBase64) {
    throw new IntegrationSecretUnreadableError("Malformed encrypted integration secret.");
  }

  const iv = Buffer.from(ivBase64, "base64");
  const tag = Buffer.from(tagBase64, "base64");
  const payload = Buffer.from(payloadBase64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8");
  } catch (cause) {
    throw new IntegrationSecretUnreadableError(
      "Encrypted integration secret could not be decrypted with the current runtime key.",
      { cause },
    );
  }
}
