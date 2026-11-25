import { useEffect, useState, type SyntheticEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { SearchHit } from "../../shared/search";
import { search } from "../services/endpoints";
import { Alert } from "../components/Alert";
import { buttonPrimary, card, input } from "../components/ui";
import { formatLongDate } from "../lib/format";
import { useErrorText } from "../lib/use-error-text";

/** Full-text search over the user's notes. The query lives in the URL (?q=). */
export default function SearchPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") ?? "").trim();

  const [draft, setDraft] = useState(q);
  const [loaded, setLoaded] = useState<{ q: string; hits?: SearchHit[]; error?: string } | null>(
    null,
  );

  useEffect(() => {
    if (q.length === 0) return;
    let active = true;
    search
      .query(q)
      .then((hits) => {
        if (active) setLoaded({ q, hits });
      })
      .catch((error: unknown) => {
        if (active) setLoaded({ q, error: errorText(error) });
      });
    return () => {
      active = false;
    };
  }, [q, errorText]);

  const current = q.length > 0 && loaded?.q === q ? loaded : null;

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = draft.trim();
    setParams(next.length > 0 ? { q: next } : {});
  }

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t("search.title")}</h1>

      <form onSubmit={submit} role="search" className="flex gap-2">
        <label className="sr-only" htmlFor="search-query">
          {t("search.placeholder")}
        </label>
        <input
          id="search-query"
          type="search"
          maxLength={200}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("search.placeholder")}
          className={input}
        />
        <button type="submit" className={buttonPrimary}>
          {t("search.submit")}
        </button>
      </form>

      {q.length === 0 && <p className="text-stone-500">{t("search.prompt")}</p>}
      {current?.error && <Alert tone="error">{current.error}</Alert>}
      {q.length > 0 && !current && <p className="text-stone-500">{t("common.loading")}</p>}
      {current?.hits?.length === 0 && <p className="text-stone-600">{t("search.empty")}</p>}

      <ul className="space-y-3">
        {current?.hits?.map((hit) => (
          <li key={hit.id}>
            <Link
              to={`/entries/${hit.id}`}
              className={`${card} block transition hover:border-stone-300`}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 text-sm text-stone-500">
                <time dateTime={hit.entryDate}>{formatLongDate(hit.entryDate)}</time>
                <span className="font-mono">{hit.entryTime}</span>
              </div>
              <h2 className="mt-1 font-medium text-stone-900">{hit.title ?? t("day.untitled")}</h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-700">
                <Highlighted text={hit.snippet} />
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Renders a snippet whose matches are wrapped in [[ ]] markers. Only text nodes and <mark>
 * elements are produced, so note content can never inject markup.
 */
function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(\[\[.*?\]\])/);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("[[") && part.endsWith("]]") ? (
          <mark key={index} className="rounded bg-amber-200 px-0.5 text-stone-900">
            {part.slice(2, -2)}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}
