import { handle, ok, readJson } from '@/lib/http';
import { requireRole } from '@/lib/auth';
import { AUDIT_ACTIONS, writeAudit } from '@/lib/audit';
import { clientIp } from '@/lib/rate-limit';
import { overrideAnswerScore } from '@/server/mock-exam/service';
import { overrideAnswerSchema } from '@/server/mock-exam/schemas';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ attemptId: string; answerId: string }> };

/**
 * Giáo viên / quản trị sửa điểm một câu.
 *
 * Ghi nhật ký vì đây là thao tác đổi điểm của người khác — phải truy được ai
 * sửa, sửa lúc nào, từ bao nhiêu thành bao nhiêu.
 */
export const PATCH = handle(async (request: Request, context: Ctx) => {
  const actor = await requireRole(
    'TEACHER',
    'SUPER_ADMIN',
    'OPS_ADMIN',
    'PROGRAM_MANAGER',
    'REVIEWER',
  );
  const { attemptId, answerId } = await context.params;
  const body = await readJson(request, overrideAnswerSchema);

  const result = await overrideAnswerScore({
    attemptId,
    answerId,
    awarded: body.awarded,
    feedbackVi: body.feedbackVi,
    actor,
  });

  await writeAudit({
    actorId: actor.id,
    action: AUDIT_ACTIONS.MOCK_ANSWER_OVERRIDE,
    entityType: 'MockExamAnswer',
    entityId: answerId,
    before: { awarded: result.previousAwarded },
    after: { awarded: result.awarded, attemptId, attemptScore: result.attemptScore },
    ip: clientIp(request),
  });

  return ok(result);
});
