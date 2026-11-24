import { randomUUID } from "node:crypto";
import type { LoginCodeMessage, MailService, SendResult } from "./mailer.js";

/**
 * Development-only provider: prints the code to stdout instead of sending email.
 * The configuration refuses this provider when NODE_ENV is production.
 */
export class ConsoleMailer implements MailService {
  sendLoginCode(message: LoginCodeMessage): Promise<SendResult> {
    console.info(
      `[dev mail] login code for ${message.to}: ${message.code} (expires in ${String(message.ttlMinutes)} min)`,
    );
    return Promise.resolve({ providerId: `console-${randomUUID()}` });
  }
}
