import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { entries } from "../services/endpoints";
import type { CalendarDay } from "../../shared/entries";
import { daysInMonth, todayIn, weekdayOf } from "../../shared/time";
import { Alert } from "../components/Alert";
import { useCurrentUser } from "../auth/AuthContext";
import { buttonSecondary, card, linkButton } from "../components/ui";
import { formatMonth } from "../lib/format";
import { useErrorText } from "../lib/use-error-text";

/** Month grid with the number of notes per day. Weeks start on Monday. */
export default function CalendarPage() {
  const { t, i18n } = useTranslation();
  const user = useCurrentUser();
  const errorText = useErrorText();

  const [month, setMonth] = useState(() => todayIn(user.timezone).slice(0, 7));
  // Results are tagged with the month they belong to, so a late response never shows for another month.
  const [loaded, setLoaded] = useState<{
    month: string;
    days?: CalendarDay[];
    error?: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    entries
      .calendar(month)
      .then((list) => {
        if (active) setLoaded({ month, days: list });
      })
      .catch((loadError: unknown) => {
        if (active) setLoaded({ month, error: errorText(loadError) });
      });
    return () => {
      active = false;
    };
  }, [month, errorText]);

  const current = loaded?.month === month ? loaded : null;
  const days = current?.days ?? null;
  const error = current?.error ?? null;

  const counts = useMemo(() => new Map((days ?? []).map((day) => [day.date, day.count])), [days]);
  const today = todayIn(user.timezone);
  const weekdayLabels = useMemo(() => weekdayHeaders(i18n.language), [i18n.language]);

  // Leading blanks so that day 1 falls under its weekday (Monday = first column).
  const leading = (weekdayOf(`${month}-01`) + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from(
      { length: daysInMonth(month) },
      (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`,
    ),
  ];

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight capitalize">{formatMonth(month)}</h1>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label={t("calendar.previousMonth")}
            onClick={() => setMonth(shiftMonth(month, -1))}
            className={buttonSecondary}
          >
            ←
          </button>
          <button
            type="button"
            aria-label={t("calendar.nextMonth")}
            onClick={() => setMonth(shiftMonth(month, 1))}
            className={buttonSecondary}
          >
            →
          </button>
        </div>
      </header>

      {error && <Alert tone="error">{error}</Alert>}

      <div className={`${card} p-2 sm:p-4`}>
        <div className="grid grid-cols-7 gap-1 pb-2 text-center text-xs font-medium uppercase text-stone-500">
          {weekdayLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, index) =>
            date === null ? (
              <span key={`blank-${String(index)}`} />
            ) : (
              <Link
                key={date}
                to={`/day/${date}`}
                aria-label={`${date}${counts.has(date) ? ` · ${t("calendar.entries", { count: counts.get(date) ?? 0 })}` : ""}`}
                className={`flex min-h-14 flex-col items-center justify-between rounded-lg border p-1.5 text-sm transition hover:border-stone-400 sm:min-h-20 ${
                  date === today ? "border-stone-800 font-semibold" : "border-stone-200"
                } ${counts.has(date) ? "bg-emerald-50" : "bg-white"}`}
              >
                <span>{Number(date.slice(8))}</span>
                {counts.has(date) && (
                  <span className="rounded-full bg-emerald-600 px-1.5 text-xs text-white">
                    {counts.get(date)}
                  </span>
                )}
              </Link>
            ),
          )}
        </div>
      </div>

      {days === null && !error && <p className="text-stone-500">{t("common.loading")}</p>}
      <p className="text-sm text-stone-500">
        <Link to={`/day/${today}`} className={linkButton}>
          {t("nav.today")}
        </Link>
      </p>
    </section>
  );
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year ?? 1970, (monthNumber ?? 1) - 1 + delta, 1));
  return shifted.toISOString().slice(0, 7);
}

/** Short weekday names starting on Monday, in the active locale. */
function weekdayHeaders(locale: string): string[] {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(Date.UTC(2024, 0, 1 + index))),
  );
}
