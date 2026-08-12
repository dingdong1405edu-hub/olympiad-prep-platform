import { handle, ok } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { requireActiveEnrollment } from '@/server/commerce/service';
import { startProgressAssessment } from '@/server/assessment/service';

type Ctx = { params: Promise<{ enrollmentId: string }> };

/** Bài kiểm tra tiến bộ của chu kỳ 2 tuần. */
export const POST = handle(async (_request: Request, context: Ctx) => {
  const session = await requireSession();
  const { enrollmentId } = await context.params;
  const enrollment = await requireActiveEnrollment(session.id, enrollmentId);

  return ok(await startProgressAssessment(enrollment.id));
});
