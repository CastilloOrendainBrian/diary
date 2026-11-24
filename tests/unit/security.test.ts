import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  LOGIN_CODE_LENGTH,
  generateLoginCode,
  hashLoginCode,
  verifyLoginCode,
} from "../../src/server/security/login-codes.js";
import {
  generateSessionToken,
  hashSessionToken,
} from "../../src/server/security/session-tokens.js";
import {
  defaultDisplayName,
  emailDomain,
  isValidTimezone,
  normalizeEmail,
} from "../../src/server/security/email.js";

const SECRET = "unit-test-secret-with-enough-length-1234";

describe("login codes", () => {
  it("generates six-digit numeric codes, zero-padded", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateLoginCode()).toMatch(new RegExp(`^\\d{${String(LOGIN_CODE_LENGTH)}}$`));
    }
  });

  it("verifies the right code for the right email only", () => {
    const hash = hashLoginCode(SECRET, "ana@example.com", "123456");

    expect(verifyLoginCode(SECRET, "ana@example.com", "123456", hash)).toBe(true);
    expect(verifyLoginCode(SECRET, "ana@example.com", "123457", hash)).toBe(false);
    expect(verifyLoginCode(SECRET, "bob@example.com", "123456", hash)).toBe(false);
  });

  it("depends on the server secret, so a DB dump alone cannot be checked offline", () => {
    const hash = hashLoginCode(SECRET, "ana@example.com", "123456");
    const plainSha = createHash("sha256").update("ana@example.com\n123456").digest();

    expect(hash.equals(plainSha)).toBe(false);
    expect(
      verifyLoginCode("another-secret-entirely-different-1234", "ana@example.com", "123456", hash),
    ).toBe(false);
  });

  it("rejects a stored hash of the wrong length without throwing", () => {
    expect(verifyLoginCode(SECRET, "ana@example.com", "123456", Buffer.alloc(4))).toBe(false);
  });
});

describe("session tokens", () => {
  it("generates URL-safe random tokens of 256 bits", () => {
    const token = generateSessionToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(generateSessionToken()).not.toBe(token);
  });

  it("hashes tokens with SHA-256 and never returns the token itself", () => {
    const token = "example-token";
    const hash = hashSessionToken(token);

    expect(hash).toHaveLength(32);
    expect(hash.equals(createHash("sha256").update(token).digest())).toBe(true);
  });
});

describe("email helpers", () => {
  it("normalizes case and surrounding whitespace", () => {
    expect(normalizeEmail("  Ana.Lopez@Example.COM ")).toBe("ana.lopez@example.com");
  });

  it("returns null for invalid addresses", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("a".repeat(250) + "@example.com")).toBeNull();
  });

  it("extracts the domain", () => {
    expect(emailDomain("ana@example.com")).toBe("example.com");
  });

  it("derives a display name from the local part and keeps it within 60 characters", () => {
    expect(defaultDisplayName("maria.lopez@example.com")).toBe("maria.lopez");
    expect(defaultDisplayName(`${"x".repeat(80)}@example.com`)).toHaveLength(60);
  });

  it("validates IANA timezone names", () => {
    expect(isValidTimezone("Europe/Madrid")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Mars/Olympus")).toBe(false);
  });
});
