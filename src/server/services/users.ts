import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { permissions, rolePermissions, roles, userRoles, users } from "../db/schema.js";

export type UserRecord = typeof users.$inferSelect;

export interface CreateUserInput {
  /** Normalized email address. */
  email: string;
  displayName: string;
  timezone?: string;
  /** Role names to assign, e.g. ["user"] or ["user", "admin"]. */
  roleNames: readonly string[];
  assignedBy?: string | null;
}

export async function findUserByEmail(db: DbExecutor, email: string): Promise<UserRecord | null> {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}

export async function findUserById(db: DbExecutor, userId: string): Promise<UserRecord | null> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Creates a user and assigns the given roles in one transaction.
 * Every role must already exist (seeded by the migration step).
 */
export async function createUser(db: DbExecutor, input: CreateUserInput): Promise<UserRecord> {
  const run = async (tx: DbExecutor): Promise<UserRecord> => {
    const [created] = await tx
      .insert(users)
      .values({
        email: input.email,
        displayName: input.displayName,
        timezone: input.timezone ?? "UTC",
      })
      .returning();
    if (!created) throw new Error("User insert returned no row");

    await assignRoles(tx, created.id, input.roleNames, input.assignedBy ?? null);
    return created;
  };

  return "transaction" in db ? db.transaction(run) : run(db);
}

/** Adds roles to a user. Unknown role names raise an error. */
export async function assignRoles(
  db: DbExecutor,
  userId: string,
  roleNames: readonly string[],
  assignedBy: string | null,
): Promise<void> {
  if (roleNames.length === 0) return;

  const found = await db
    .select({ id: roles.id, name: roles.name })
    .from(roles)
    .where(inArray(roles.name, [...roleNames]));

  const missing = roleNames.filter((name) => !found.some((role) => role.name === name));
  if (missing.length > 0) {
    throw new Error(`Unknown role(s): ${missing.join(", ")}`);
  }

  await db
    .insert(userRoles)
    .values(found.map((role) => ({ userId, roleId: role.id, assignedBy })))
    .onConflictDoNothing();
}

/** Effective permission codes of a user: the union over all assigned roles. */
export async function getPermissionCodes(db: DbExecutor, userId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ code: permissions.code })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId));

  return rows.map((row) => row.code).sort();
}

/** Clears a scheduled deletion; returns true only when a pending deletion was cancelled. */
export async function cancelDeletion(db: DbExecutor, userId: string): Promise<boolean> {
  const rows = await db
    .update(users)
    .set({ deletionRequestedAt: null, updatedAt: new Date() })
    .where(and(eq(users.id, userId), isNotNull(users.deletionRequestedAt)))
    .returning({ id: users.id });
  return rows.length > 0;
}
