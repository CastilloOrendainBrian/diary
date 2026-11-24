import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import type { TestApp } from "./test-app.js";

export const TEST_ORIGIN = "http://localhost:5173";

/** Name of the session cookie, duplicated from the server to keep tests explicit. */
export const COOKIE_NAME = "diary_session";

export async function requestCode(
  app: FastifyInstance,
  email: string,
  headers: Record<string, string> = {},
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: "POST",
    url: "/api/auth/code",
    payload: { email },
    headers,
  });
}

export async function verifyCode(
  app: FastifyInstance,
  payload: { email: string; code: string; displayName?: string; timezone?: string },
  headers: Record<string, string> = {},
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: "POST",
    url: "/api/auth/code/verify",
    payload,
    headers,
  });
}

/** Extracts the raw session token from a response, or null when no cookie was set. */
export function sessionCookie(response: LightMyRequestResponse): string | null {
  const cookie = response.cookies.find((item) => item.name === COOKIE_NAME);
  return cookie?.value ?? null;
}

/**
 * Full sign-in: request a code, wait for the email, verify it.
 * Returns the verify response; throws when the code was not delivered.
 */
export async function signIn(
  test: TestApp,
  email: string,
  options: { displayName?: string; timezone?: string; headers?: Record<string, string> } = {},
): Promise<LightMyRequestResponse> {
  const requested = await requestCode(test.app, email, options.headers);
  if (requested.statusCode !== 202) {
    throw new Error(`Code request failed with ${String(requested.statusCode)}`);
  }
  await test.app.authCodes.waitForDeliveries();

  const code = test.mailer.codeFor(email);
  return verifyCode(
    test.app,
    {
      email,
      code,
      ...(options.displayName ? { displayName: options.displayName } : {}),
      ...(options.timezone ? { timezone: options.timezone } : {}),
    },
    options.headers,
  );
}

/** Signs in and returns the raw session token, failing loudly if sign-in does not succeed. */
export async function signInToken(test: TestApp, email: string): Promise<string> {
  const response = await signIn(test, email);
  const token = sessionCookie(response);
  if (response.statusCode !== 200 || token === null) {
    throw new Error(`Sign-in failed: ${String(response.statusCode)} ${response.body}`);
  }
  return token;
}

export function withSession(token: string): Record<string, string> {
  return { cookie: `${COOKIE_NAME}=${token}` };
}
