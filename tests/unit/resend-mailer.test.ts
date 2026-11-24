import { beforeEach, describe, expect, it, vi } from "vitest";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    readonly emails = { send };
  },
}));

// Imported after the mock is registered.
const { ResendMailer } = await import("../../src/server/mail/resend-mailer.js");

const message = {
  to: "ana@example.com",
  code: "654321",
  ttlMinutes: 10,
  idempotencyKey: "00000000-0000-4000-8000-000000000001",
};

describe("ResendMailer", () => {
  beforeEach(() => {
    send.mockReset();
  });

  it("sends the login code with the idempotency key and returns the provider id", async () => {
    send.mockResolvedValue({ data: { id: "email_123" }, error: null });
    const mailer = new ResendMailer({ apiKey: "re_test", from: "Diario <no-reply@example.com>" });

    const result = await mailer.sendLoginCode(message);

    expect(result).toEqual({ providerId: "email_123" });
    expect(send).toHaveBeenCalledTimes(1);
    const [payload, options] = send.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(payload).toMatchObject({
      from: "Diario <no-reply@example.com>",
      to: "ana@example.com",
    });
    expect(String(payload.subject)).toContain("654321");
    expect(String(payload.text)).toContain("654321");
    expect(String(payload.html)).toContain("654321");
    expect(options).toEqual({ idempotencyKey: message.idempotencyKey });
  });

  it("sets Reply-To only when configured", async () => {
    send.mockResolvedValue({ data: { id: "email_1" }, error: null });
    const mailer = new ResendMailer({
      apiKey: "re_test",
      from: "Diario <no-reply@example.com>",
      replyTo: "support@example.com",
    });

    await mailer.sendLoginCode(message);

    const [payload] = send.mock.calls[0] as [Record<string, unknown>];
    expect(payload.replyTo).toBe("support@example.com");
  });

  it("throws when Resend returns an error response", async () => {
    send.mockResolvedValue({ data: null, error: { message: "domain not verified" } });
    const mailer = new ResendMailer({ apiKey: "re_test", from: "Diario <no-reply@example.com>" });

    await expect(mailer.sendLoginCode(message)).rejects.toThrow(/domain not verified/);
  });

  it("gives up after the timeout instead of waiting indefinitely", async () => {
    send.mockReturnValue(new Promise(() => undefined));
    const mailer = new ResendMailer({
      apiKey: "re_test",
      from: "Diario <no-reply@example.com>",
      timeoutMs: 10,
    });

    await expect(mailer.sendLoginCode(message)).rejects.toThrow(/timed out/);
  });
});
