import { describe, it, expect } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  generateGameKey,
} from "../crypto";

describe("crypto — AES-256-GCM encryption", () => {
  it("generates a non-empty base64 key", async () => {
    const key = await generateGameKey();
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });

  it("generates unique keys each time", async () => {
    const k1 = await generateGameKey();
    const k2 = await generateGameKey();
    expect(k1).not.toBe(k2);
  });

  it("encrypts and decrypts a secret correctly (roundtrip)", async () => {
    const key = await generateGameKey();
    const plaintext = "elephant";
    const encrypted = await encryptSecret(plaintext, key);
    const decrypted = await decryptSecret(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it("encrypted output starts with 'enc:' prefix", async () => {
    const key = await generateGameKey();
    const encrypted = await encryptSecret("test", key);
    expect(encrypted.startsWith("enc:")).toBe(true);
  });

  it("isEncrypted returns true for encrypted strings", async () => {
    const key = await generateGameKey();
    const encrypted = await encryptSecret("test", key);
    expect(isEncrypted(encrypted)).toBe(true);
  });

  it("isEncrypted returns false for plaintext", () => {
    expect(isEncrypted("elephant")).toBe(false);
    expect(isEncrypted("hello world")).toBe(false);
  });

  it("different encryptions of the same plaintext produce different ciphertext", async () => {
    const key = await generateGameKey();
    const e1 = await encryptSecret("same", key);
    const e2 = await encryptSecret("same", key);
    expect(e1).not.toBe(e2); // Random IV means different output
  });

  it("decryption with wrong key fails", async () => {
    const key1 = await generateGameKey();
    const key2 = await generateGameKey();
    const encrypted = await encryptSecret("secret", key1);
    await expect(decryptSecret(encrypted, key2)).rejects.toThrow();
  });

  it("handles unicode/emoji in secrets", async () => {
    const key = await generateGameKey();
    const plaintext = "🐘 éléphant 中文";
    const encrypted = await encryptSecret(plaintext, key);
    const decrypted = await decryptSecret(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it("handles long secret strings", async () => {
    const key = await generateGameKey();
    const plaintext = "a".repeat(1000);
    const encrypted = await encryptSecret(plaintext, key);
    const decrypted = await decryptSecret(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it("decryptSecret returns plaintext string as-is if not encrypted", async () => {
    const key = await generateGameKey();
    const result = await decryptSecret("not-encrypted", key);
    expect(result).toBe("not-encrypted");
  });
});
