import { z } from "zod";

// Request schemas shared by the API (validation) and the client (form validation).

const LOGIN_CODE_PATTERN = /^\d{6}$/;

export const requestCodeSchema = z.object({
  email: z.string().trim().min(1).max(254),
});

export const verifyCodeSchema = z.object({
  email: z.string().trim().min(1).max(254),
  code: z.string().regex(LOGIN_CODE_PATTERN, "must be 6 digits"),
  /** Only used when the account is created. */
  displayName: z.string().trim().min(1).max(60).optional(),
  /** IANA timezone detected by the browser, e.g. "Europe/Madrid". */
  timezone: z.string().min(1).max(64).optional(),
});

export type RequestCodeInput = z.infer<typeof requestCodeSchema>;
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;
