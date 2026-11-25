import { useEffect, useState, type SyntheticEvent } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { account, type SessionInfo } from "../services/endpoints";
import { useAuth, useCurrentUser } from "../auth/AuthContext";
import { exportPath } from "../services/endpoints";
import { downloadFile } from "../services/http";
import { saveBlob } from "../lib/download";
import { Alert } from "../components/Alert";
import { buttonDanger, buttonPrimary, buttonSecondary, card, input } from "../components/ui";
import { formatTimestamp, timezoneOptions } from "../lib/format";
import { useErrorText } from "../lib/use-error-text";

/** Profile (name and timezone), active sessions and sign-out. */
export default function AccountPage() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { can, refresh, signOut } = useAuth();
  const errorText = useErrorText();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(user.displayName);
  const [timezone, setTimezone] = useState(user.timezone);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);

  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    account
      .sessions()
      .then((list) => {
        if (active) setSessions(list);
      })
      .catch((error: unknown) => {
        if (active) setSessionError(errorText(error));
      });
    return () => {
      active = false;
    };
  }, [errorText]);

  async function saveProfile(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileBusy(true);
    setProfileMessage(null);
    try {
      await account.updateProfile({ displayName: displayName.trim(), timezone });
      await refresh();
      setProfileMessage({ tone: "success", text: t("account.profileSaved") });
    } catch (error) {
      setProfileMessage({ tone: "error", text: errorText(error) });
    } finally {
      setProfileBusy(false);
    }
  }

  async function revoke(id: string) {
    setSessionError(null);
    try {
      await account.revokeSession(id);
      setSessions((current) => current?.filter((session) => session.id !== id) ?? null);
    } catch (error) {
      setSessionError(errorText(error));
    }
  }

  async function exportDiary(format: "json" | "md") {
    setExportError(null);
    setExporting(true);
    try {
      const file = await downloadFile(exportPath(format));
      saveBlob(file.blob, file.fileName);
    } catch (error) {
      setExportError(errorText(error));
    } finally {
      setExporting(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    void navigate("/login", { replace: true });
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("account.title")}</h1>

      <form onSubmit={(event) => void saveProfile(event)} className={`${card} space-y-4`}>
        <h2 className="font-medium text-stone-900">{t("account.profile")}</h2>
        <p className="text-sm text-stone-500">
          {t("account.email")}: {user.email}
        </p>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-stone-700">{t("account.displayName")}</span>
          <input
            type="text"
            required
            maxLength={60}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className={input}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-stone-700">{t("account.timezone")}</span>
          <select
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            className={input}
          >
            {timezoneOptions(user.timezone).map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <span className="text-xs text-stone-500">{t("account.timezoneHelp")}</span>
        </label>

        {profileMessage && <Alert tone={profileMessage.tone}>{profileMessage.text}</Alert>}
        <button type="submit" disabled={profileBusy} className={buttonPrimary}>
          {t("account.saveProfile")}
        </button>
      </form>

      <section className={`${card} space-y-4`}>
        <h2 className="font-medium text-stone-900">{t("account.sessions")}</h2>
        {sessionError && <Alert tone="error">{sessionError}</Alert>}
        {sessions === null && !sessionError && (
          <p className="text-stone-500">{t("common.loading")}</p>
        )}
        <ul className="divide-y divide-stone-200">
          {sessions?.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="space-y-0.5 text-sm">
                <p className="font-medium text-stone-800">
                  {session.current
                    ? t("account.currentSession")
                    : (session.userAgent ?? t("account.unknownDevice"))}
                </p>
                <p className="text-stone-500">
                  {t("account.lastSeen")}: {formatTimestamp(session.lastSeenAt)} ·{" "}
                  {t("account.createdAt")}: {formatTimestamp(session.createdAt)}
                </p>
              </div>
              {!session.current && (
                <button
                  type="button"
                  onClick={() => void revoke(session.id)}
                  className={buttonDanger}
                >
                  {t("account.revoke")}
                </button>
              )}
            </li>
          ))}
        </ul>
        {sessions !== null && sessions.length === 1 && (
          <p className="text-sm text-stone-500">{t("account.noSessions")}</p>
        )}
      </section>

      {can("export:run") && (
        <section className={`${card} space-y-4`}>
          <h2 className="font-medium text-stone-900">{t("account.exportTitle")}</h2>
          <p className="text-sm text-stone-600">{t("account.exportHelp")}</p>
          {exportError && <Alert tone="error">{exportError}</Alert>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={exporting}
              onClick={() => void exportDiary("json")}
              className={buttonSecondary}
            >
              {t("account.exportJson")}
            </button>
            <button
              type="button"
              disabled={exporting}
              onClick={() => void exportDiary("md")}
              className={buttonSecondary}
            >
              {t("account.exportMarkdown")}
            </button>
          </div>
        </section>
      )}

      <div>
        <button type="button" onClick={() => void handleSignOut()} className={buttonSecondary}>
          {t("account.signOut")}
        </button>
      </div>
    </section>
  );
}
