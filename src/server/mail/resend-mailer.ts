import { Resend } from "resend";
import type { LoginCodeMessage, MailService, SendResult } from "./mailer.js";
import { renderLoginCodeEmail } from "./templates/login-code.js";

export interface ResendMailerOptions {
  apiKey: string;
  from: string;
  replyTo?: string | undefined;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
}

/** Sends transactional email through the Resend API. */
export class ResendMailer implements MailService {
  private readonly client: Resend;
  private readonly from: string;
  private readonly replyTo: string | undefined;
  private readonly timeoutMs: number;

  constructor(options: ResendMailerOptions) {
    this.client = new Resend(options.apiKey);
    this.from = options.from;
    this.replyTo = options.replyTo;
    this.timeoutMs = options.timeoutMs ?? 5_000;
  }

  async sendLoginCode(message: LoginCodeMessage): Promise<SendResult> {
    const email = renderLoginCodeEmail(message);

    const sending = this.client.emails.send(
      {
        from: this.from,
        to: message.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
        ...(this.replyTo ? { replyTo: this.replyTo } : {}),
      },
      { idempotencyKey: message.idempotencyKey },
    );

    // Bound the wait so a slow provider cannot hold a request open indefinitely.
    const response = await withTimeout(sending, this.timeoutMs, "Resend request timed out");

    if (response.error) {
      throw new Error(`Resend rejected the email: ${response.error.message}`);
    }
    return { providerId: response.data.id };
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
