import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Custom column types for PostgreSQL extensions and types Drizzle does not model natively.
const citext = customType<{ data: string; driverData: string }>({
  dataType: () => "citext",
});

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => "tsvector",
});

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// --- Identity and sessions ---------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: citext("email").notNull().unique(),
    displayName: text("display_name").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    status: text("status").notNull().default("active"),
    emailVerifiedAt: timestamptz("email_verified_at").notNull().defaultNow(),
    lastLoginAt: timestamptz("last_login_at"),
    /** NULL when the account is active; set when deletion is scheduled (30-day grace period). */
    deletionRequestedAt: timestamptz("deletion_requested_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check("users_display_name_length", sql`char_length(${table.displayName}) between 1 and 60`),
    check("users_status_check", sql`${table.status} in ('active', 'disabled')`),
  ],
);

export const loginCodes = pgTable(
  "login_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: citext("email").notNull(),
    /** HMAC-SHA256 of the 6-digit code, keyed with the server secret. Never the code itself. */
    codeHash: bytea("code_hash").notNull(),
    purpose: text("purpose").notNull().default("sign_in"),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamptz("expires_at").notNull(),
    consumedAt: timestamptz("consumed_at"),
    ip: inet("ip"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("login_codes_email_idx").on(table.email, table.createdAt.desc()),
    check("login_codes_purpose_check", sql`${table.purpose} in ('sign_in')`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the random session token. The raw token only lives in the cookie. */
    tokenHash: bytea("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    expiresAt: timestamptz("expires_at").notNull(),
    lastSeenAt: timestamptz("last_seen_at").notNull().defaultNow(),
    revokedAt: timestamptz("revoked_at"),
    ip: inet("ip"),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("sessions_user_idx")
      .on(table.userId)
      .where(sql`${table.revokedAt} is null`),
  ],
);

// --- Authorization (RBAC) ----------------------------------------------------

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  /** System roles (user, admin) cannot be deleted. */
  isSystem: boolean("is_system").notNull().default(false),
});

export const permissions = pgTable("permissions", {
  id: serial("id").primaryKey(),
  /** Format: resource:action, e.g. "entries:read". */
  code: text("code").notNull().unique(),
  description: text("description"),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: integer("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
    assignedAt: timestamptz("assigned_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.roleId] })],
);

// --- Diary content -----------------------------------------------------------

export const entries = pgTable(
  "entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Calendar date of the note, interpreted in the user's timezone. */
    entryDate: date("entry_date", { mode: "string" }).notNull(),
    /** Time of the note with minute precision (HH:mm), interpreted in the user's timezone. */
    entryTime: time("entry_time", { precision: 0 }).notNull(),
    title: text("title"),
    content: text("content").notNull().default(""),
    /** Full-text search vector, maintained by PostgreSQL. */
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('spanish', coalesce(title, '')), 'A') || setweight(to_tsvector('spanish', content), 'B')`,
    ),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("entries_user_day_idx").on(table.userId, table.entryDate, table.entryTime),
    index("entries_search_idx").using("gin", table.searchVector),
    // Minute precision only: seconds must be zero.
    check("entries_time_minute_precision", sql`extract(second from ${table.entryTime}) = 0`),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
  },
  (table) => [unique("tags_user_name_unique").on(table.userId, table.name)],
);

export const entryTags = pgTable(
  "entry_tags",
  {
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.entryId, table.tagId] })],
);

// --- Audit -------------------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** Dotted action name, e.g. "auth.login.success". */
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    ip: inet("ip"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [index("audit_actor_idx").on(table.actorId, table.createdAt)],
);
