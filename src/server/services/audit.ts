import type { DbExecutor } from "../db/client.js";
import { auditLog } from "../db/schema.js";

export interface AuditEvent {
  /** Dotted action name, e.g. "auth.login.success". */
  action: string;
  actorId?: string | null;
  targetType?: string;
  targetId?: string;
  ip?: string | null;
  /** Extra context. Never include secrets, codes or raw tokens. */
  metadata?: Record<string, unknown>;
}

/** Appends an event to the audit log. The runtime role can only insert here. */
export async function recordAudit(db: DbExecutor, event: AuditEvent): Promise<void> {
  await db.insert(auditLog).values({
    action: event.action,
    actorId: event.actorId ?? null,
    targetType: event.targetType ?? null,
    targetId: event.targetId ?? null,
    ip: event.ip ?? null,
    metadata: event.metadata ?? {},
  });
}
