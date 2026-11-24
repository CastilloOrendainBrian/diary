import { useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import { useErrorText } from "../lib/use-error-text";
import { Alert } from "./Alert";
import { MarkdownView } from "./MarkdownView";
import { buttonDanger, buttonPrimary, buttonSecondary, card, input } from "./ui";

export interface EntryFormValues {
  entryDate: string;
  entryTime: string;
  title: string;
  content: string;
  tags: string[];
}

interface EntryFormProps {
  initial: EntryFormValues;
  isNew: boolean;
  onSave: (values: EntryFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
}

/** Create or edit form for a diary entry, with a Markdown preview tab. */
export function EntryForm({ initial, isNew, onSave, onDelete }: EntryFormProps) {
  const { t } = useTranslation();
  const errorText = useErrorText();

  const [entryDate, setEntryDate] = useState(initial.entryDate);
  const [entryTime, setEntryTime] = useState(initial.entryTime);
  const [title, setTitle] = useState(initial.title);
  const [tagsText, setTagsText] = useState(initial.tags.join(", "));
  const [content, setContent] = useState(initial.content);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave({
        entryDate,
        entryTime,
        title: title.trim(),
        content,
        tags: tagsText
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      });
    } catch (saveError) {
      setError(errorText(saveError));
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || !window.confirm(t("common.confirmDelete"))) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete();
    } catch (deleteError) {
      setError(errorText(deleteError));
      setBusy(false);
    }
  }

  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-stone-800 text-white" : "text-stone-600 hover:bg-stone-100"}`;

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-stone-700">{t("entry.date")}</span>
          <input
            type="date"
            required
            value={entryDate}
            onChange={(event) => setEntryDate(event.target.value)}
            className={input}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-stone-700">{t("entry.time")}</span>
          <input
            type="time"
            required
            value={entryTime}
            onChange={(event) => setEntryTime(event.target.value)}
            className={input}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-stone-700">{t("entry.titleLabel")}</span>
        <input
          type="text"
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className={input}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-stone-700">{t("entry.tags")}</span>
        <input
          type="text"
          value={tagsText}
          onChange={(event) => setTagsText(event.target.value)}
          aria-describedby="tags-help"
          className={input}
        />
        <span id="tags-help" className="text-xs text-stone-500">
          {t("entry.tagsHelp")}
        </span>
      </label>

      <div className={`${card} space-y-3`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-stone-700">{t("entry.content")}</span>
          <div role="tablist" className="flex gap-1">
            <button
              type="button"
              role="tab"
              aria-selected={!preview}
              onClick={() => setPreview(false)}
              className={tabClass(!preview)}
            >
              {t("entry.write")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={preview}
              onClick={() => setPreview(true)}
              className={tabClass(preview)}
            >
              {t("entry.preview")}
            </button>
          </div>
        </div>

        {preview ? (
          content.trim().length > 0 ? (
            <MarkdownView source={content} />
          ) : (
            <p className="text-sm text-stone-500">{t("entry.emptyPreview")}</p>
          )
        ) : (
          <>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={12}
              maxLength={100_000}
              aria-label={t("entry.content")}
              className={`${input} font-mono text-sm`}
            />
            <p className="text-xs text-stone-500">{t("entry.markdownHelp")}</p>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {!isNew && onDelete ? (
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={busy}
            className={buttonDanger}
          >
            {t("entry.deleteEntry")}
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" onClick={() => window.history.back()} className={buttonSecondary}>
            {t("common.back")}
          </button>
          <button type="submit" disabled={busy} className={buttonPrimary}>
            {busy ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </form>
  );
}
