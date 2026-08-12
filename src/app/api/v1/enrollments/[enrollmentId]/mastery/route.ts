import { handle, ok } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { requireActiveEnrollment } from '@/server/commerce/service';
import { getMasteryMap } from '@/server/student-model/service';

type Ctx = { params: Promise<{ enrollmentId: string }> };

export const GET = handle(async (_request: Request, context: Ctx) => {
  const session = await requireSession();
  const { enrollmentId } = await context.params;
  const enrollment = await requireActiveEnrollment(session.id, enrollmentId);

  return ok(await getMasteryMap(enrollment.id));
});
