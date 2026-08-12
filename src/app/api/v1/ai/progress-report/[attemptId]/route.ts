import { handle, ok, ApiError } from '@/lib/http';
import { requireSession, hasRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { generateProgressReport } from '@/server/ai/service';

type Ctx = { params: Promise<{ attemptId: string }> };

export const GET = handle(async (_request: Request, context: Ctx) => {
  const session = await requireSession();
  const { attemptId } = await context.params;
  enforceRateLimit(`ai:${session.id}`, RATE_LIMITS.AI);

  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: attemptId },
    select: { enrollment: { select: { student: { select: { userId: true } } } } },
  });
  if (!attempt) throw ApiError.notFound('Không tìm thấy bài kiểm tra.');

  const isOwner = attempt.enrollment.student.userId === session.id;
  const isStaff = hasRole(session, 'TEACHER', 'SUPER_ADMIN', 'PROGRAM_MANAGER', 'OPS_ADMIN');
  if (!isOwner && !isStaff) throw ApiError.forbidden();

  return ok(await generateProgressReport(attemptId));
});
