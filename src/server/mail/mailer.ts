export interface LoginCodeMessage {
  /** Normalized recipient address. */
  to: string;
  /** Plain 6-digit code. Only ever sent by email, never stored in plain text. */
  code: string;
  /** Minutes until the code expires, shown in the email. */
  ttlMinutes: number;
  /** Stable key so that retries never send the same code twice (Resend Idempotency-Key). */
  idempotencyKey: string;
}

export interface SendResult {
  /** Provider message identifier, stored in the audit log. */
  providerId: string;
}

/** Abstraction over the transactional email provider. */
export interface MailService {
  sendLoginCode(message: LoginCodeMessage): Promise<SendResult>;
}
