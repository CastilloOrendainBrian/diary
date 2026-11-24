import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { tags as tagsApi } from "../services/endpoints";
import type { TagView } from "../../shared/entries";
import { Alert } from "../components/Alert";
import { buttonDanger, buttonSecondary, card, input } from "../components/ui";
import { useErrorText } from "../lib/use-error-text";

/** Lists the user's tags with usage counts; allows renaming and deleting them. */
export default function TagsPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();

  const [items, setItems] = useState<TagView[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    tagsApi
      .list()
      .then((list) => {
        if (active) setItems(list);
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorText(loadError));
      });
    return () => {
      active = false;
    };
  }, [errorText]);

  async function reload() {
    setItems(await tagsApi.list());
  }

  async function rename(tag: TagView) {
    const name = (drafts[tag.id] ?? tag.name).trim();
    if (name.length === 0 || name === tag.name) return;
    setBusyId(tag.id);
    setError(null);
    try {
      await tagsApi.rename(tag.id, name);
      setDrafts((current) =>
        Object.fromEntries(Object.entries(current).filter(([key]) => key !== String(tag.id))),
      );
      await reload();
    } catch (renameError) {
      setError(errorText(renameError));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(tag: TagView) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    setBusyId(tag.id);
    setError(null);
    try {
      await tagsApi.remove(tag.id);
      await reload();
    } catch (removeError) {
      setError(errorText(removeError));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t("tags.title")}</h1>
      {error && <Alert tone="error">{error}</Alert>}
      {items === null && !error && <p className="text-stone-500">{t("common.loading")}</p>}
      {items !== null && items.length === 0 && <p className="text-stone-600">{t("tags.empty")}</p>}

      <ul className="space-y-3">
        {items?.map((tag) => (
          <li key={tag.id} className={`${card} flex flex-wrap items-center gap-3`}>
            <div className="min-w-40 flex-1">
              <label className="sr-only" htmlFor={`tag-${String(tag.id)}`}>
                {t("tags.rename")}
              </label>
              <input
                id={`tag-${String(tag.id)}`}
                type="text"
                maxLength={30}
                value={drafts[tag.id] ?? tag.name}
                onChange={(event) => setDrafts({ ...drafts, [tag.id]: event.target.value })}
                className={input}
              />
              <p className="mt-1 text-xs text-stone-500">
                {t("tags.usage", { count: tag.entryCount })}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busyId === tag.id}
                onClick={() => void rename(tag)}
                className={buttonSecondary}
              >
                {t("tags.rename")}
              </button>
              <button
                type="button"
                disabled={busyId === tag.id}
                onClick={() => void remove(tag)}
                className={buttonDanger}
              >
                {t("tags.delete")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
