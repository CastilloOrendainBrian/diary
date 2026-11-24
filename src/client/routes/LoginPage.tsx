import { useState, type SyntheticEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { auth } from "../services/endpoints";
import { useAuth } from "../auth/AuthContext";
import { Alert } from "../components/Alert";
import { buttonPrimary, buttonSecondary, card, input } from "../components/ui";
import { browserTimezone } from "../lib/format";
import { useErrorText } from "../lib/use-error-text";

type Step = "email" | "code";

/** Passwordless sign-in: email address, then the 6-digit code sent to it. */
export default function LoginPage() {
  const { t } = useTranslation();
  const { state, setSession } = useAuth();
  const errorText = useErrorText();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status === "authenticated") {
    return <Navigate to="/" replace />;
  }

  async function requestCode(event?: SyntheticEvent<HTMLFormElement>) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.requestCode(email.trim());
      setCode("");
      setStep("code");
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await auth.verifyCode(email.trim(), code.trim(), browserTimezone());
      setSession(session);
      void navigate("/", { replace: true });
    } catch (verifyError) {
      setError(errorText(verifyError));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-10">
      <div className={`${card} w-full max-w-sm space-y-5`}>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            {t("login.title")}
          </h1>
          <p className="text-sm text-stone-600">{t("login.intro")}</p>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        {step === "email" ? (
          <form onSubmit={(event) => void requestCode(event)} className="space-y-4">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-stone-700">{t("login.email")}</span>
              <input
                type="email"
                required
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={input}
              />
            </label>
            <button type="submit" disabled={busy} className={`${buttonPrimary} w-full`}>
              {t("login.sendCode")}
            </button>
          </form>
        ) : (
          <form onSubmit={(event) => void verifyCode(event)} className="space-y-4">
            <p className="text-sm text-stone-600">
              {t("login.codeSentTo", { email: email.trim() })}
            </p>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-stone-700">{t("login.code")}</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className={`${input} text-center text-2xl tracking-[0.4em]`}
              />
            </label>
            <button type="submit" disabled={busy} className={`${buttonPrimary} w-full`}>
              {t("login.verify")}
            </button>
            <div className="flex justify-between gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void requestCode()}
                className={buttonSecondary}
              >
                {t("login.resend")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setError(null);
                }}
                className={buttonSecondary}
              >
                {t("login.changeEmail")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
