import { z } from "zod";

const emailSchema = z.email().max(254);

/**
 * Normalizes an email for storage and comparison: trimmed and lower-cased.
 * Returns null when the value is not a valid email address.
 */
export function normalizeEmail(input: string): string | null {
  const candidate = input.trim().toLowerCase();
  const result = emailSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

/** Domain part of a normalized email address. */
export function emailDomain(normalizedEmail: string): string {
  const at = normalizedEmail.lastIndexOf("@");
  return at === -1 ? "" : normalizedEmail.slice(at + 1);
}

/**
 * Default display name for a new account: the local part of the address,
 * trimmed to the 60-character limit of users.display_name.
 */
export function defaultDisplayName(normalizedEmail: string): string {
  const local = normalizedEmail.split("@")[0] ?? "";
  const name = local.trim().slice(0, 60);
  return name.length > 0 ? name : "User";
}

/** Returns true when the IANA timezone name is known to the runtime. */
export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
