import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  isIntegrationSecretKeyRequiredError,
  isIntegrationSecretUnreadableError,
  isEncryptedIntegrationSecret,
} from "@/lib/integration-secrets";

describe("integration secret crypto", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("encrypts and decrypts secrets when the master key is configured", () => {
    vi.stubEnv("INTEGRATION_TOKEN_ENCRYPTION_KEY", "test-master-key");

    const encrypted = encryptIntegrationSecret("super-secret-token");

    expect(encrypted).not.toBe("super-secret-token");
    expect(isEncryptedIntegrationSecret(encrypted)).toBe(true);
    expect(decryptIntegrationSecret(encrypted)).toBe("super-secret-token");
  });

  it("keeps plaintext values readable for backward compatibility", () => {
    vi.stubEnv("INTEGRATION_TOKEN_ENCRYPTION_KEY", "test-master-key");

    expect(decryptIntegrationSecret("legacy-plaintext")).toBe("legacy-plaintext");
    expect(isEncryptedIntegrationSecret("legacy-plaintext")).toBe(false);
  });

  it("throws when the master key is absent during writes", () => {
    vi.unstubAllEnvs();

    expect(() => encryptIntegrationSecret("legacy-plaintext")).toThrow(
      /INTEGRATION_TOKEN_ENCRYPTION_KEY/
    );
  });

  it("throws for malformed ciphertext", () => {
    vi.stubEnv("INTEGRATION_TOKEN_ENCRYPTION_KEY", "test-master-key");

    expect(() => decryptIntegrationSecret("enc:v1:not-valid")).toThrow(/Malformed/);
  });

  it("throws when decrypting with the wrong key", () => {
    vi.stubEnv("INTEGRATION_TOKEN_ENCRYPTION_KEY", "test-master-key");
    const encrypted = encryptIntegrationSecret("super-secret-token");

    vi.stubEnv("INTEGRATION_TOKEN_ENCRYPTION_KEY", "different-master-key");
    try {
      decryptIntegrationSecret(encrypted);
      throw new Error("expected decryptIntegrationSecret to throw");
    } catch (error) {
      expect(isIntegrationSecretUnreadableError(error)).toBe(true);
    }
  });

  it("classifies missing key errors explicitly", () => {
    vi.unstubAllEnvs();

    try {
      decryptIntegrationSecret("enc:v1:not-valid");
      throw new Error("expected decryptIntegrationSecret to throw");
    } catch (error) {
      expect(isIntegrationSecretKeyRequiredError(error)).toBe(true);
    }
  });
});
