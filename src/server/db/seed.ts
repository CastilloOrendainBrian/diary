import { sql } from "drizzle-orm";
import { PERMISSIONS, SYSTEM_ROLES } from "../security/permissions.js";
import type { Database } from "./client.js";
import { permissions, rolePermissions, roles } from "./schema.js";

/**
 * Synchronizes permissions and system roles with the definitions in code.
 * Idempotent: safe to run on every migration. Existing rows are updated, never deleted.
 */
export async function seedAccessControl(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(permissions)
      .values(PERMISSIONS.map((permission) => ({ ...permission })))
      .onConflictDoUpdate({
        target: permissions.code,
        set: { description: sql`excluded.description` },
      });

    for (const role of SYSTEM_ROLES) {
      await tx
        .insert(roles)
        .values({ name: role.name, description: role.description, isSystem: true })
        .onConflictDoUpdate({
          target: roles.name,
          set: { description: sql`excluded.description`, isSystem: true },
        });
    }

    const permissionIds = new Map(
      (await tx.select({ id: permissions.id, code: permissions.code }).from(permissions)).map(
        (row) => [row.code, row.id],
      ),
    );
    const roleIds = new Map(
      (await tx.select({ id: roles.id, name: roles.name }).from(roles)).map((row) => [
        row.name,
        row.id,
      ]),
    );

    const grants = SYSTEM_ROLES.flatMap((role) => {
      const roleId = roleIds.get(role.name);
      if (roleId === undefined) {
        throw new Error(`System role not found after upsert: ${role.name}`);
      }
      return role.permissions.map((code) => {
        const permissionId = permissionIds.get(code);
        if (permissionId === undefined) {
          throw new Error(`Permission not found after upsert: ${code}`);
        }
        return { roleId, permissionId };
      });
    });

    if (grants.length > 0) {
      await tx.insert(rolePermissions).values(grants).onConflictDoNothing();
    }
  });
}
