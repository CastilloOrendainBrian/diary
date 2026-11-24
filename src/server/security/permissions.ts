// Single source of truth for permissions and system roles.
// The seed step (src/server/db/seed.ts) copies these into the database on every migration run.

export const PERMISSIONS = [
  { code: "entries:read", description: "Read own diary entries" },
  { code: "entries:write", description: "Create and update own diary entries" },
  { code: "entries:delete", description: "Delete own diary entries" },
  { code: "tags:manage", description: "Manage own tags" },
  { code: "export:run", description: "Export own diary entries" },
  { code: "profile:update", description: "Update own profile and manage own sessions" },
  { code: "users:read", description: "List users (no diary content)" },
  { code: "users:manage", description: "Disable, enable and delete users" },
  { code: "roles:manage", description: "Assign and remove roles" },
  { code: "audit:read", description: "Read the audit log" },
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number]["code"];

export interface SystemRoleDefinition {
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly PermissionCode[];
}

// Administrators manage accounts but have no permission over other users' diary entries.
export const SYSTEM_ROLES: readonly SystemRoleDefinition[] = [
  {
    name: "user",
    description: "Regular user: manages own diary entries",
    permissions: [
      "entries:read",
      "entries:write",
      "entries:delete",
      "tags:manage",
      "export:run",
      "profile:update",
    ],
  },
  {
    name: "admin",
    description: "Administrator: manages accounts, roles and audit log",
    permissions: ["profile:update", "users:read", "users:manage", "roles:manage", "audit:read"],
  },
];
