import { getDb } from "@/lib/db";

export type AuditAction =
  | "user.suspend"
  | "user.unsuspend"
  | "user.delete"
  | "user.reset_password"
  | "user.terminate_sessions"
  | "user.set_admin"
  | "user.revoke_admin"
  | "business.delete"
  | "business.plan_override"
  | "business.remove_member"
  | "sync.refresh"
  | "sync.recovery"
  | "discount.create"
  | "discount.delete"
  | "discount.toggle";

export async function logAdminAction(input: {
  adminId: string;
  action: AuditAction;
  targetType: "user" | "business" | "discount" | "subscription";
  targetId?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const sql = getDb();
    await sql`
      INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, meta)
      VALUES (
        ${input.adminId},
        ${input.action},
        ${input.targetType},
        ${input.targetId ?? null},
        ${JSON.stringify(input.meta ?? {})}
      )
    `;
  } catch (error) {
    console.warn("[admin-audit] write_failed", {
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      message: error instanceof Error ? error.message : String(error),
    });
    // Audit log failure should never block the main operation
  }
}

export interface AuditLogRow {
  id: string;
  admin_id: string;
  admin_name: string;
  admin_email: string;
  action: string;
  target_type: string;
  target_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export async function getAuditLogs(options: {
  page?: number;
  limit?: number;
  adminId?: string;
  action?: string;
}): Promise<{ rows: AuditLogRow[]; total: number }> {
  const sql = getDb();
  const limit = options.limit ?? 50;
  const offset = ((options.page ?? 1) - 1) * limit;

  const rows = (await sql`
    SELECT
      al.id, al.admin_id, u.name AS admin_name, u.email AS admin_email,
      al.action, al.target_type, al.target_id, al.meta, al.created_at
    FROM admin_audit_logs al
    JOIN users u ON u.id = al.admin_id
    ORDER BY al.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `) as AuditLogRow[];

  const countResult = (await sql`SELECT COUNT(*) AS total FROM admin_audit_logs`) as Array<{ total: string }>;

  return { rows, total: Number(countResult[0]?.total ?? 0) };
}
