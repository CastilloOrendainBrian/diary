import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { entries } from "../services/endpoints";
import type { EntryView } from "../../shared/entries";
import { addDays, todayIn } from "../../shared/time";
import { Alert } from "../components/Alert";
import { buttonPrimary, buttonSecondary, card, linkButton } from "../components/ui";
import { useCurrentUser } from "../auth/AuthContext";
import { formatLongDate } from "../lib/format";
import { useErrorText } from "../lib/use-error-text";

/** Entries of one day, ordered by time. */
export default function DayPage() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const errorText = useErrorText();
  const { date = "" } = useParams();

  // Results are tagged with the date they belong to, so a late response never shows for another day.
  const [loaded, setLoaded] = useState<{
    date: string;
    items?: EntryView[];
    error?: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    entries
      .day(date)
      .then((list) => {
        if (active) setLoaded({ date, items: list });
      })
      .catch((loadError: unknown) => {
        if (active) setLoaded({ date, error: errorText(loadError) });
      });
    return () => {
      active = false;
    };
  }, [date, errorText]);

  const current = loaded?.date === date ? loaded : null;
  const items = current?.items ?? null;
  const error = current?.error ?? null;

  const isToday = date === todayIn(user.timezone);

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-stone-500">{isToday ? t("nav.today") : ""}</p>
          <h1 className="text-2xl font-semibold tracking-tight capitalize">
            {formatLongDate(date)}
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <Link
            to={`/day/${addDays(date, -1)}`}
            className={linkButton}
            aria-label={t("day.previous")}
          >
            ←
          </Link>
          <Link to={`/day/${addDays(date, 1)}`} className={linkButton} aria-label={t("day.next")}>
            →
          </Link>
          <Link to={`/day/${date}/new`} className={buttonPrimary}>
            {t("day.newEntry")}
          </Link>
        </div>
      </header>

      {error && <Alert tone="error">{error}</Alert>}
      {!error && items === null && <p className="text-stone-500">{t("common.loading")}</p>}

      {items !== null && items.length === 0 && (
        <div className={`${card} text-center text-stone-600`}>
          <p>{t("day.empty")}</p>
          <Link to={`/day/${date}/new`} className={`${buttonSecondary} mt-3`}>
            {t("day.newEntry")}
          </Link>
        </div>
      )}

      <ul className="space-y-3">
        {items?.map((entry) => (
          <li key={entry.id}>
            <Link
              to={`/entries/${entry.id}`}
              className={`${card} block transition hover:border-stone-300`}
            >
              <div className="flex items-baseline gap-3">
                <time
                  dateTime={`${entry.entryDate}T${entry.entryTime}`}
                  className="font-mono text-sm text-stone-500"
                >
                  {entry.entryTime}
                </time>
                <h2 className="font-medium text-stone-900">{entry.title ?? t("day.untitled")}</h2>
              </div>
              {entry.content.trim().length > 0 && (
                <p className="mt-2 line-clamp-2 text-sm text-stone-600">
                  {plainSnippet(entry.content)}
                </p>
              )}
              {entry.tags.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {entry.tags.map((tag) => (
                    <li
                      key={tag}
                      className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-700"
                    >
                      #{tag}
                    </li>
                  ))}
                </ul>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** First meaningful line of a Markdown note, without formatting characters. */
function plainSnippet(markdown: string): string {
  const line = markdown.split("\n").find((item) => item.trim().length > 0) ?? "";
  return line
    .replace(/[#*_`>[\]()-]/g, "")
    .trim()
    .slice(0, 160);
}
