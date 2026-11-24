// Locale-aware formatting for dates and times shown in the interface.
const LOCALE = "es-ES";

/** Timezone of the browser, used to pre-fill the profile on first sign-in. */
export function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** "lunes, 23 de noviembre de 2026" for a "YYYY-MM-DD" date. */
export function formatLongDate(isoDate: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** "noviembre de 2026" for a "YYYY-MM" month. */
export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

/** "23 nov 2026, 09:05" for a timestamp returned by the API. */
export function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** All IANA timezone names the runtime knows, with a short fallback for old browsers. */
export function timezoneOptions(current: string): string[] {
  const supported: string[] =
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const list = supported.length > 0 ? supported : ["UTC", "Europe/Madrid", "America/Mexico_City"];
  return list.includes(current) ? list : [current, ...list];
}
