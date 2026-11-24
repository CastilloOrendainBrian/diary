import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { entries } from "../services/endpoints";
import type { EntryView } from "../../shared/entries";
import { currentTimeIn, todayIn } from "../../shared/time";
import { Alert } from "../components/Alert";
import { EntryForm, type EntryFormValues } from "../components/EntryForm";
import { useCurrentUser } from "../auth/AuthContext";
import { useErrorText } from "../lib/use-error-text";

/** Creates a new entry (/day/:date/new) or edits an existing one (/entries/:id). */
export default function EntryPage() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { id, date } = useParams();
  const isNew = id === undefined;

  const [entry, setEntry] = useState<EntryView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialNew] = useState<EntryFormValues>(() => ({
    entryDate: date ?? todayIn(user.timezone),
    entryTime: currentTimeIn(user.timezone),
    title: "",
    content: "",
    tags: [],
  }));

  useEffect(() => {
    if (id === undefined) return;
    let active = true;
    entries
      .get(id)
      .then((loaded) => {
        if (active) setEntry(loaded);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(errorText(error));
      });
    return () => {
      active = false;
    };
  }, [id, errorText]);

  async function save(values: EntryFormValues) {
    const saved = isNew
      ? await entries.create({
          entryDate: values.entryDate,
          entryTime: values.entryTime,
          title: values.title,
          content: values.content,
          tags: values.tags,
        })
      : await entries.update(id, {
          entryDate: values.entryDate,
          entryTime: values.entryTime,
          title: values.title,
          content: values.content,
          tags: values.tags,
        });
    void navigate(`/day/${saved.entryDate}`, { replace: true });
  }

  async function remove() {
    if (!entry) return;
    await entries.remove(entry.id);
    void navigate(`/day/${entry.entryDate}`, { replace: true });
  }

  if (isNew) {
    return (
      <section className="space-y-5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("entry.newTitle")}</h1>
        <EntryForm initial={initialNew} isNew onSave={save} />
      </section>
    );
  }

  if (loadError) {
    return <Alert tone="error">{loadError || t("entry.notFound")}</Alert>;
  }
  if (!entry) {
    return <p className="text-stone-500">{t("common.loading")}</p>;
  }

  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">{t("entry.editTitle")}</h1>
      <EntryForm
        initial={{
          entryDate: entry.entryDate,
          entryTime: entry.entryTime,
          title: entry.title ?? "",
          content: entry.content,
          tags: entry.tags,
        }}
        isNew={false}
        onSave={save}
        onDelete={remove}
      />
    </section>
  );
}
