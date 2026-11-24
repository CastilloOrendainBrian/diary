import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { admin, type AdminUser, type AuditEvent } from "../services/endpoints";
import { useAuth, useCurrentUser } from "../auth/AuthContext";
import { Alert } from "../components/Alert";
import { buttonSecondary } from "../components/ui";
import { formatTimestamp } from "../lib/format";
import { useErrorText } from "../lib/use-error-text";

/** Account administration: enable or disable accounts, change administrator role, audit log. */
/** Loads users and the latest audit events in parallel. */
async function loadAdminData() {
  const [users, events] = await Promise.all([admin.users(), admin.audit()]);
  return { users, events };
}

export default function AdminPage() {
  const { t } = useTranslation();
  const me = useCurrentUser();
  const { can } = useAuth();
  const errorText = useErrorText();

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    const data = await loadAdminData();
    setUsers(data.users);
    setEvents(data.events);
  }

  useEffect(() => {
    let active = true;
    loadAdminData()
      .then((data) => {
        if (!active) return;
        setUsers(data.users);
        setEvents(data.events);
      })
      .catch((loadError: unknown) => {
        if (active) setError(errorText(loadError));
      });
    return () => {
      active = false;
    };
  }, [errorText]);

  const emailById = new Map((users ?? []).map((user) => [user.id, user.email]));

  async function act(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await reload();
    } catch (actionError) {
      setError(errorText(actionError));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t("admin.title")}</h1>
      {error && <Alert tone="error">{error}</Alert>}

      <section className="space-y-3">
        <h2 className="font-medium text-stone-900">{t("admin.users")}</h2>
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50 text-left text-stone-600">
              <tr>
                <th className="px-3 py-2 font-medium">{t("admin.email")}</th>
                <th className="px-3 py-2 font-medium">{t("admin.status")}</th>
                <th className="px-3 py-2 font-medium">{t("admin.roles")}</th>
                <th className="px-3 py-2 font-medium">{t("admin.lastLogin")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {users?.map((user) => {
                const isSelf = user.id === me.id;
                const isAdmin = user.roles.includes("admin");
                return (
                  <tr key={user.id}>
                    <td className="px-3 py-2">
                      {user.email}
                      {isSelf && (
                        <span className="ml-2 text-xs text-stone-500">({t("admin.you")})</span>
                      )}
                      <div className="text-xs text-stone-500">{user.displayName}</div>
                    </td>
                    <td className="px-3 py-2">
                      {user.status === "active" ? t("admin.active") : t("admin.disabled")}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-3">
                        <span>{t("admin.roleNames.user")}</span>
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={isAdmin}
                            disabled={!can("roles:manage") || isSelf || busyId === user.id}
                            onChange={(event) => {
                              const roles = event.target.checked ? ["user", "admin"] : ["user"];
                              void act(user.id, () => admin.setRoles(user.id, roles));
                            }}
                          />
                          {t("admin.roleNames.admin")}
                        </label>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-stone-500">
                      {user.lastLoginAt ? formatTimestamp(user.lastLoginAt) : t("admin.never")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {can("users:manage") && (
                        <button
                          type="button"
                          disabled={isSelf || busyId === user.id}
                          onClick={() =>
                            void act(user.id, () =>
                              admin.setStatus(
                                user.id,
                                user.status === "active" ? "disabled" : "active",
                              ),
                            )
                          }
                          className={buttonSecondary}
                        >
                          {user.status === "active" ? t("admin.disable") : t("admin.enable")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium text-stone-900">{t("admin.audit")}</h2>
        {events !== null && events.length === 0 && (
          <p className="text-stone-500">{t("admin.noEvents")}</p>
        )}
        {events !== null && events.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 text-left text-stone-600">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("admin.date")}</th>
                  <th className="px-3 py-2 font-medium">{t("admin.action")}</th>
                  <th className="px-3 py-2 font-medium">{t("admin.actor")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="px-3 py-2 text-stone-500">{formatTimestamp(event.createdAt)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{event.action}</td>
                    <td className="px-3 py-2">
                      {event.actorId
                        ? (emailById.get(event.actorId) ?? event.actorId)
                        : t("admin.system")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
