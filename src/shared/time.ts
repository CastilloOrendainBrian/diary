// Calendar helpers that work on plain "YYYY-MM-DD" and "HH:mm" strings.
// They do not depend on the runtime timezone, so the server and the browser agree.

/** Adds a number of days to a "YYYY-MM-DD" date. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** First day of the month after the given "YYYY-MM" month, as "YYYY-MM-DD" (exclusive bound). */
export function nextMonthStart(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  // Date.UTC treats the month as 0-based, so passing the 1-based number yields the next month.
  return new Date(Date.UTC(year ?? 1970, monthNumber ?? 1, 1)).toISOString().slice(0, 10);
}

/** Number of days in a "YYYY-MM" month. */
export function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, monthNumber ?? 1, 0)).getUTCDate();
}

/** Weekday of a "YYYY-MM-DD" date, 0 = Sunday. */
export function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/** Trims seconds from a PostgreSQL time value ("09:05:00" becomes "09:05"). */
export function toMinutePrecision(time: string): string {
  return time.slice(0, 5);
}

/**
 * Current calendar date ("YYYY-MM-DD") in the given IANA timezone.
 * Entries are stored as local date and time, so "today" depends on the user's zone.
 */
export function todayIn(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Current time of day ("HH:mm") in the given IANA timezone. */
export function currentTimeIn(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}
