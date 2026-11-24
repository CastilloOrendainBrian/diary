import { createHash, randomBytes } from "node:crypto";

/** Size of the random session token in bytes (256 bits). */
export const SESSION_TOKEN_BYTES = 32;

/** Generates a random, URL-safe session token. Only the cookie holds the raw value. */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

/** SHA-256 of the token. This is what the database stores. */
export function hashSessionToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}
