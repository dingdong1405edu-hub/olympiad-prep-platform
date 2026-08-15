/**
 * Audit log — bắt buộc cho: sửa câu hỏi, override điểm, entitlement/thanh toán,
 * notes giáo viên, thay đổi cấu hình (specs §14 #4).
 *
 * Ghi log KHÔNG được làm hỏng nghiệp vụ chính: mọi lỗi ở đây chỉ log ra console.
 */
import { prisma } from '@/lib/prisma';

export interface AuditInput {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        before: (input.before ?? undefined) as never,
        after: (input.after ?? undefined) as never,
        ip: input.ip ?? null,
      },
    });
  } catch (error) {
    console.error('[audit] không ghi được audit log', error);
  }
}

export const AUDIT_ACTIONS = {
  ITEM_CREATE: 'item.create',
  ITEM_UPDATE: 'item.update',
  ITEM_STATUS_CHANGE: 'item.status_change',
  ITEM_IMPORT: 'item.import',
  ITEM_FLAG_RESOLVE: 'item.flag_resolve',
  ENROLLMENT_ACTIVATE: 'enrollment.activate',
  ENROLLMENT_EXTEND: 'enrollment.extend',
  ENROLLMENT_SUSPEND: 'enrollment.suspend',
  PAYMENT_WEBHOOK: 'payment.webhook',
  PAYMENT_REFUND: 'payment.refund',
  CONFIG_UPDATE: 'config.update',
  TEACHER_NOTES: 'teacher.notes',
  TEACHER_ASSIGN: 'teacher.assign',
  PLAN_REGENERATE: 'plan.regenerate',
  USER_ROLE_CHANGE: 'user.role_change',
  USER_STATUS_CHANGE: 'user.status_change',
  USER_CREATE: 'user.create',
  SITE_COPY_UPDATE: 'site_copy.update',
  SITE_COPY_RESET: 'site_copy.reset',
  /** Giáo viên sửa điểm một câu trong bài thi thử chấm bằng AI. */
  MOCK_ANSWER_OVERRIDE: 'mock_exam.answer_override',
} as const;
