import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
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

  it("does not encrypt when the master key is absent", () => {
    vi.unstubAllEnvs();

    expect(encryptIntegrationSecret("legacy-plaintext")).toBe("legacy-plaintext");
  });
});
