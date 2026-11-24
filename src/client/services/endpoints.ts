import type {
  CalendarDay,
  CreateEntryInput,
  EntryView,
  TagView,
  UpdateEntryInput,
} from "../../shared/entries.js";
import { request } from "./http.js";

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
}

export interface SessionInfo {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  roles: string[];
}

export interface RoleInfo {
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

export interface AuditEvent {
  id: number;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  createdAt: string;
  metadata: unknown;
}

export interface SessionResponse {
  user: CurrentUser;
  permissions: string[];
}

export const auth = {
  requestCode: (email: string) => request<undefined>("POST", "/api/auth/code", { email }),
  verifyCode: (email: string, code: string, timezone: string) =>
    request<SessionResponse & { registered: boolean }>("POST", "/api/auth/code/verify", {
      email,
      code,
      timezone,
    }),
  me: () => request<SessionResponse>("GET", "/api/auth/me"),
  logout: () => request<undefined>("POST", "/api/auth/logout"),
};

export const entries = {
  day: async (date: string) =>
    (await request<{ entries: EntryView[] }>("GET", `/api/days/${date}`)).entries,
  get: async (id: string) =>
    (await request<{ entry: EntryView }>("GET", `/api/entries/${id}`)).entry,
  create: async (input: CreateEntryInput) =>
    (await request<{ entry: EntryView }>("POST", "/api/entries", input)).entry,
  update: async (id: string, input: UpdateEntryInput) =>
    (await request<{ entry: EntryView }>("PATCH", `/api/entries/${id}`, input)).entry,
  remove: (id: string) => request<undefined>("DELETE", `/api/entries/${id}`),
  calendar: async (month: string) =>
    (await request<{ days: CalendarDay[] }>("GET", `/api/calendar?month=${month}`)).days,
};

export const tags = {
  list: async () => (await request<{ tags: TagView[] }>("GET", "/api/tags")).tags,
  rename: async (id: number, name: string) =>
    (await request<{ tag: TagView }>("PUT", `/api/tags/${String(id)}`, { name })).tag,
  remove: (id: number) => request<undefined>("DELETE", `/api/tags/${String(id)}`),
};

export const account = {
  updateProfile: async (input: { displayName?: string; timezone?: string }) =>
    (await request<{ user: CurrentUser }>("PATCH", "/api/account", input)).user,
  sessions: async () =>
    (await request<{ sessions: SessionInfo[] }>("GET", "/api/account/sessions")).sessions,
  revokeSession: (id: string) => request<undefined>("DELETE", `/api/account/sessions/${id}`),
};

export const admin = {
  users: async () => (await request<{ users: AdminUser[] }>("GET", "/api/admin/users")).users,
  setStatus: async (id: string, status: "active" | "disabled") =>
    (await request<{ user: AdminUser }>("PATCH", `/api/admin/users/${id}`, { status })).user,
  setRoles: async (id: string, roles: string[]) =>
    (await request<{ user: AdminUser }>("PUT", `/api/admin/users/${id}/roles`, { roles })).user,
  roles: async () => (await request<{ roles: RoleInfo[] }>("GET", "/api/admin/roles")).roles,
  audit: async () =>
    (await request<{ events: AuditEvent[] }>("GET", "/api/admin/audit?limit=50")).events,
};
