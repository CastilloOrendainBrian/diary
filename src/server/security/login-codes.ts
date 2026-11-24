import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/** Length of the one-time login code sent by email. */
export const LOGIN_CODE_LENGTH = 6;

/**
 * Generates a uniformly distributed numeric code, e.g. "004217".
 * Uses the CSPRNG (crypto.randomInt), never Math.random.
 */
export function generateLoginCode(): string {
  const max = 10 ** LOGIN_CODE_LENGTH;
  return randomInt(0, max).toString().padStart(LOGIN_CODE_LENGTH, "0");
}

/**
 * HMAC-SHA256 of a code, bound to the normalized email address and keyed with the server secret.
 * The 6-digit space is small, so the secret is what prevents offline guessing from a DB dump.
 */
export function hashLoginCode(secret: string, email: string, code: string): Buffer {
  return createHmac("sha256", secret).update(`${email}\n${code}`).digest();
}

/** Constant-time comparison of a candidate code against a stored hash. */
export function verifyLoginCode(
  secret: string,
  email: string,
  candidate: string,
  storedHash: Buffer,
): boolean {
  const candidateHash = hashLoginCode(secret, email, candidate);
  return candidateHash.length === storedHash.length && timingSafeEqual(candidateHash, storedHash);
}
