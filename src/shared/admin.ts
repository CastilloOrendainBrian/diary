import { z } from "zod";

// Request schemas for the administration API.

export const updateUserStatusSchema = z.object({
  status: z.enum(["active", "disabled"]),
});

export const updateUserRolesSchema = z.object({
  roles: z.array(z.string().min(1).max(32)).min(1).max(10),
});

export const auditQuerySchema = z.object({
  action: z.string().min(1).max(100).optional(),
  actorId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type UpdateUserRolesInput = z.infer<typeof updateUserRolesSchema>;
export type AuditQueryInput = z.infer<typeof auditQuerySchema>;
