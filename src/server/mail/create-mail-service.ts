import type { AppConfig } from "../config.js";
import { ConsoleMailer } from "./console-mailer.js";
import type { MailService } from "./mailer.js";
import { ResendMailer } from "./resend-mailer.js";

/** Builds the mail provider selected by configuration. */
export function createMailService(config: AppConfig): MailService {
  if (config.MAIL_PROVIDER === "console") {
    return new ConsoleMailer();
  }
  if (!config.RESEND_API_KEY) {
    // The configuration schema already enforces this; the check keeps the type narrow.
    throw new Error("RESEND_API_KEY is required for the resend mail provider");
  }
  return new ResendMailer({
    apiKey: config.RESEND_API_KEY,
    from: config.MAIL_FROM,
    replyTo: config.MAIL_REPLY_TO,
  });
}
