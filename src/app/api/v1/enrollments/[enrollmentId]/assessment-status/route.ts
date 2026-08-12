import { handle, ok } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { requireActiveEnrollment } from '@/server/commerce/service';
import { getAssessmentStatus } from '@/server/assessment/service';

type Ctx = { params: Promise<{ enrollmentId: string }> };

export const GET = handle(async (_request: Request, context: Ctx) => {
  const session = await requireSession();
  const { enrollmentId } = await context.params;
  const enrollment = await requireActiveEnrollment(session.id, enrollmentId);

  return ok(await getAssessmentStatus(enrollment.id));
});
