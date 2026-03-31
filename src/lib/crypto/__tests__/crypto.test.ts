import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "../index";

beforeAll(() => {
  // Valid hex-encoded 32-byte key
  process.env.ENCRYPTION_KEY = "a".repeat(64);
});

describe("crypto module", () => {
  it("encrypt→decrypt round-trip returns original plaintext", () => {
    const plaintext = "hello, ShayFinance";
    const payload = encrypt(plaintext);
    expect(decrypt(payload)).toBe(plaintext);
  });

  it("two encryptions of the same plaintext produce different IVs and ciphertext", () => {
    const plaintext = "same input";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.encrypted.equals(b.encrypted)).toBe(false);
  });

  it("decrypt with wrong key throws", () => {
    const payload = encrypt("secret");
    process.env.ENCRYPTION_KEY = "b".repeat(64);
    expect(() => decrypt(payload)).toThrow();
    process.env.ENCRYPTION_KEY = "a".repeat(64);
  });

  it("decrypt with tampered ciphertext throws", () => {
    const payload = encrypt("secret");
    const tampered = Buffer.from(payload.encrypted);
    tampered[0] ^= 0xff;
    expect(() => decrypt({ ...payload, encrypted: tampered })).toThrow();
  });

  it("decrypt with tampered authTag throws", () => {
    const payload = encrypt("secret");
    const tampered = Buffer.from(payload.authTag);
    tampered[0] ^= 0xff;
    expect(() => decrypt({ ...payload, authTag: tampered })).toThrow();
  });
});
