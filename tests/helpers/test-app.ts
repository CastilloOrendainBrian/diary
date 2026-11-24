import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/server/app.js";
import { loadConfig, type AppConfig } from "../../src/server/config.js";
import { createDatabaseClient, type DatabaseClient } from "../../src/server/db/client.js";
import type { LoginCodeMessage, MailService, SendResult } from "../../src/server/mail/mailer.js";
import { TEST_APP_URL } from "./database-urls.js";

export const TEST_PUBLIC_URL = "http://localhost:5173";
export const TEST_HMAC_SECRET = "test-only-hmac-secret-that-is-long-enough";

/** Mail provider that records messages instead of sending them. */
export class CapturingMailer implements MailService {
  readonly messages: LoginCodeMessage[] = [];
  /** When set, the next send fails with this message. */
  failWith: string | null = null;

  sendLoginCode(message: LoginCodeMessage): Promise<SendResult> {
    if (this.failWith !== null) {
      const reason = this.failWith;
      this.failWith = null;
      return Promise.reject(new Error(reason));
    }
    this.messages.push(message);
    return Promise.resolve({ providerId: `test-${String(this.messages.length)}` });
  }

  /** Code from the most recent message sent to an address. */
  codeFor(email: string): string {
    const message = [...this.messages].reverse().find((item) => item.to === email);
    if (!message) throw new Error(`No login code was sent to ${email}`);
    return message.code;
  }

  clear(): void {
    this.messages.length = 0;
    this.failWith = null;
  }
}

export interface TestApp {
  app: FastifyInstance;
  config: AppConfig;
  database: DatabaseClient;
  mailer: CapturingMailer;
  close(): Promise<void>;
}

/** Environment for tests. Overrides let individual suites change limits or flags. */
export function testEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: "test",
    DATABASE_URL: TEST_APP_URL,
    CODE_HMAC_SECRET: TEST_HMAC_SECRET,
    PUBLIC_URL: TEST_PUBLIC_URL,
    MAIL_PROVIDER: "console",
    // Suites make many requests from the same loopback IP; the per-IP limit has its own test.
    AUTH_RATE_LIMIT_PER_MINUTE: "10000",
    ...overrides,
  };
}

/** Builds the application against diary_test with the runtime role and a capturing mailer. */
export async function createTestApp(overrides: Record<string, string> = {}): Promise<TestApp> {
  const config = loadConfig(testEnv(overrides));
  const database = createDatabaseClient(config.DATABASE_URL, 5);
  const mailer = new CapturingMailer();
  const app = await buildApp({ config, database, mailer }, { logger: false });

  return {
    app,
    config,
    database,
    mailer,
    close: async () => {
      await app.authCodes.waitForDeliveries();
      await app.close();
      await database.close();
    },
  };
}
