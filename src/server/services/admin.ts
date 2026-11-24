import { and, asc, count, desc, eq, inArray, notInArray } from "drizzle-orm";
import type { Database, DbExecutor, Transaction } from "../db/client.js";
import { auditLog, permissions, rolePermissions, roles, userRoles, users } from "../db/schema.js";
import { errors } from "../errors.js";
import { recordAudit } from "./audit.js";
import { revokeAllSessions } from "./sessions.js";
import { findUserById } from "./users.js";

export type UserStatus = "active" | "disabled";

/** Account data visible to administrators. Diary content is never included. */
export interface AdminUserView {
  id: string;
  email: string;
  displayName: string;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  roles: string[];
}

/** Who performs an administrative action, for the audit trail. */
export interface AdminActor {
  userId: string;
  ip: string | null;
}

export async function listUsers(db: DbExecutor): Promise<AdminUserView[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.email));

  const assignments = await db
    .select({ userId: userRoles.userId, roleName: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId));

  const rolesByUser = new Map<string, string[]>();
  for (const assignment of assignments) {
    const list = rolesByUser.get(assignment.userId) ?? [];
    list.push(assignment.roleName);
    rolesByUser.set(assignment.userId, list);
  }

  return rows.map((row) => ({ ...row, roles: (rolesByUser.get(row.id) ?? []).sort() }));
}

/** Enables or disables an account. Disabling revokes every session of that account. */
export async function setUserStatus(
  db: Database,
  actor: AdminActor,
  targetId: string,
  status: UserStatus,
): Promise<AdminUserView> {
  if (status === "disabled" && targetId === actor.userId) {
    throw errors.cannotModifySelf();
  }

  await db.transaction(async (tx) => {
    await lockAdminMembership(tx);

    const target = await findUserById(tx, targetId);
    if (!target) throw errors.notFound("User");
    if (target.status === status) return;

    if (status === "disabled" && (await isActiveAdmin(tx, targetId))) {
      if ((await countActiveAdmins(tx)) <= 1) throw errors.lastAdmin();
    }

    await tx.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, targetId));

    if (status === "disabled") {
      await revokeAllSessions(tx, targetId);
    }

    await recordAudit(tx, {
      action: status === "disabled" ? "admin.user.disabled" : "admin.user.enabled",
      actorId: actor.userId,
      targetType: "user",
      targetId,
      ip: actor.ip,
    });
  });

  return getUserView(db, targetId);
}

/**
 * Replaces the role set of a user. The "user" role is mandatory. Removing the "admin" role
 * is blocked for yourself and for the last active administrator.
 */
export async function setUserRoles(
  db: Database,
  actor: AdminActor,
  targetId: string,
  requestedRoles: readonly string[],
): Promise<AdminUserView> {
  const requested = [...new Set(requestedRoles)];
  if (!requested.includes("user")) {
    throw errors.validation('The "user" role cannot be removed; disable the account instead');
  }

  const known = await db
    .select({ id: roles.id, name: roles.name })
    .from(roles)
    .where(inArray(roles.name, requested));
  const unknown = requested.filter((name) => !known.some((role) => role.name === name));
  if (unknown.length > 0) {
    throw errors.validation(`Unknown role(s): ${unknown.join(", ")}`);
  }

  await db.transaction(async (tx) => {
    await lockAdminMembership(tx);

    const target = await findUserById(tx, targetId);
    if (!target) throw errors.notFound("User");

    const before = await currentRoleNames(tx, targetId);
    const removesAdmin = before.includes("admin") && !requested.includes("admin");
    if (removesAdmin) {
      if (targetId === actor.userId) throw errors.cannotModifySelf();
      if ((await isActiveAdmin(tx, targetId)) && (await countActiveAdmins(tx)) <= 1) {
        throw errors.lastAdmin();
      }
    }

    const keptRoleIds = known.map((role) => role.id);
    await tx
      .delete(userRoles)
      .where(and(eq(userRoles.userId, targetId), notInArray(userRoles.roleId, keptRoleIds)));
    await tx
      .insert(userRoles)
      .values(
        known.map((role) => ({ userId: targetId, roleId: role.id, assignedBy: actor.userId })),
      )
      .onConflictDoNothing();

    await recordAudit(tx, {
      action: "admin.user.roles_changed",
      actorId: actor.userId,
      targetType: "user",
      targetId,
      ip: actor.ip,
      metadata: { before: [...before].sort(), after: [...requested].sort() },
    });
  });

  return getUserView(db, targetId);
}

export interface RoleView {
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

export async function listRoles(db: DbExecutor): Promise<RoleView[]> {
  const rows = await db
    .select({
      name: roles.name,
      description: roles.description,
      isSystem: roles.isSystem,
      permission: permissions.code,
    })
    .from(roles)
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .orderBy(asc(roles.name), asc(permissions.code));

  const byName = new Map<string, RoleView>();
  for (const row of rows) {
    let view = byName.get(row.name);
    if (!view) {
      view = {
        name: row.name,
        description: row.description,
        isSystem: row.isSystem,
        permissions: [],
      };
      byName.set(row.name, view);
    }
    if (row.permission) view.permissions.push(row.permission);
  }
  return [...byName.values()];
}

export interface AuditQuery {
  action?: string | undefined;
  actorId?: string | undefined;
  limit: number;
}

export async function listAuditEvents(db: DbExecutor, query: AuditQuery) {
  const conditions = [];
  if (query.action) conditions.push(eq(auditLog.action, query.action));
  if (query.actorId) conditions.push(eq(auditLog.actorId, query.actorId));

  return db
    .select()
    .from(auditLog)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(query.limit);
}

async function getUserView(db: DbExecutor, userId: string): Promise<AdminUserView> {
  const user = await findUserById(db, userId);
  if (!user) throw errors.notFound("User");
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    roles: (await currentRoleNames(db, userId)).sort(),
  };
}

async function currentRoleNames(db: DbExecutor, userId: string): Promise<string[]> {
  const rows = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  return rows.map((row) => row.name);
}

async function isActiveAdmin(db: DbExecutor, userId: string): Promise<boolean> {
  const rows = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(userRoles.userId, userId), eq(roles.name, "admin"), eq(users.status, "active")))
    .limit(1);
  return rows.length > 0;
}

async function countActiveAdmins(db: DbExecutor): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(and(eq(roles.name, "admin"), eq(users.status, "active")));
  return row?.value ?? 0;
}

/**
 * Locks the "admin" role row for the rest of the transaction. Concurrent changes to
 * administrator membership are then serialized, so two admins cannot each remove the other.
 */
async function lockAdminMembership(tx: Transaction): Promise<void> {
  await tx.select({ id: roles.id }).from(roles).where(eq(roles.name, "admin")).for("update");
}
