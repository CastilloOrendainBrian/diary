import { Navigate, Outlet } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";

/** Guards routes that need a session: waits for the first /me check, then redirects if needed. */
export default function RequireAuth() {
  const { t } = useTranslation();
  const { state } = useAuth();

  if (state.status === "loading") {
    return <p className="p-8 text-center text-stone-500">{t("common.loading")}</p>;
  }
  if (state.status === "anonymous") {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
