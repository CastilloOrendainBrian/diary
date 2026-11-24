import type { LoginCodeMessage } from "../mailer.js";

/**
 * Spanish copy for the login code email. Kept in one place so it can move to
 * i18n resources when more languages are added.
 */
export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function renderLoginCodeEmail(message: LoginCodeMessage): RenderedEmail {
  const { code, ttlMinutes } = message;
  const subject = `Tu código de acceso: ${code}`;

  const text = [
    "Hola,",
    "",
    `Tu código para entrar en Diario es: ${code}`,
    "",
    `Caduca en ${String(ttlMinutes)} minutos y sólo puede usarse una vez.`,
    "",
    "Si no has solicitado este código, puedes ignorar este mensaje.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="es">
  <body style="font-family: system-ui, sans-serif; color: #292524; background: #fafaf9; padding: 24px;">
    <p>Hola,</p>
    <p>Tu código para entrar en Diario es:</p>
    <p style="font-size: 28px; font-weight: 600; letter-spacing: 6px;">${code}</p>
    <p>Caduca en ${String(ttlMinutes)} minutos y sólo puede usarse una vez.</p>
    <p style="color: #78716c; font-size: 13px;">Si no has solicitado este código, puedes ignorar este mensaje.</p>
  </body>
</html>`;

  return { subject, text, html };
}
