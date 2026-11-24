import { NavLink, Outlet, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth, useCurrentUser } from "../auth/AuthContext";
import { todayIn } from "../../shared/time";
import { linkButton } from "./ui";

interface NavItem {
  to: string;
  label: string;
}

/** Signed-in shell: top navigation on wide screens, bottom navigation on phones. */
export default function AppLayout() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { can, signOut } = useAuth();
  const navigate = useNavigate();

  const diaryLinks: NavItem[] = can("entries:read")
    ? [
        { to: `/day/${todayIn(user.timezone)}`, label: t("nav.today") },
        { to: "/calendar", label: t("nav.calendar") },
        { to: "/tags", label: t("nav.tags") },
      ]
    : [];
  const accountLinks: NavItem[] = [{ to: "/account", label: t("nav.account") }];
  const adminLinks: NavItem[] = can("users:read") ? [{ to: "/admin", label: t("nav.admin") }] : [];
  const links = [...diaryLinks, ...accountLinks, ...adminLinks];

  async function handleSignOut() {
    await signOut();
    void navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <span className="text-lg font-semibold tracking-tight">{t("nav.brand")}</span>
          <nav aria-label="Principal" className="hidden items-center gap-1 sm:flex">
            {links.map((link) => (
              <NavLink
                key={link.label}
                to={link.to}
                className={({ isActive }) =>
                  `${linkButton} ${isActive ? "bg-stone-200 text-stone-900" : ""}`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <button type="button" onClick={() => void handleSignOut()} className={linkButton}>
            {t("nav.logout")}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 sm:pb-8">
        <Outlet />
      </main>

      <nav
        aria-label="Principal móvil"
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-stone-200 bg-white sm:hidden"
      >
        {links.map((link) => (
          <NavLink
            key={link.label}
            to={link.to}
            className={({ isActive }) =>
              `flex-1 py-3 text-center text-xs font-medium ${isActive ? "text-stone-900" : "text-stone-500"}`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
