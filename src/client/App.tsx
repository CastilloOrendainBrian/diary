import { Link, Navigate, Route, Routes } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth, useCurrentUser } from "./auth/AuthContext";
import AppLayout from "./components/AppLayout";
import RequireAuth from "./components/RequireAuth";
import { buttonPrimary } from "./components/ui";
import { todayIn } from "../shared/time";
import AccountPage from "./routes/AccountPage";
import AdminPage from "./routes/AdminPage";
import CalendarPage from "./routes/CalendarPage";
import DayPage from "./routes/DayPage";
import EntryPage from "./routes/EntryPage";
import LoginPage from "./routes/LoginPage";
import SearchPage from "./routes/SearchPage";
import TagsPage from "./routes/TagsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<HomeRedirect />} />
          <Route path="day/:date" element={<DayPage />} />
          <Route path="day/:date/new" element={<EntryPage />} />
          <Route path="entries/:id" element={<EntryPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="tags" element={<TagsPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}

/** Opens today's notes. Administrators without diary access go to the admin panel instead. */
function HomeRedirect() {
  const user = useCurrentUser();
  const { can } = useAuth();
  if (!can("entries:read")) return <Navigate to="/admin" replace />;
  return <Navigate to={`/day/${todayIn(user.timezone)}`} replace />;
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4 py-12 text-center">
      <h1 className="text-2xl font-semibold">{t("notFound.title")}</h1>
      <Link to="/" className={buttonPrimary}>
        {t("notFound.link")}
      </Link>
    </div>
  );
}
