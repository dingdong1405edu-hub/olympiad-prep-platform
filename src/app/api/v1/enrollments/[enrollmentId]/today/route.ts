import { handle, ok } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { requireActiveEnrollment } from '@/server/commerce/service';
import { getTodayPlan } from '@/server/plan/service';

type Ctx = { params: Promise<{ enrollmentId: string }> };

/** Nguồn dữ liệu cho màn hình "Hôm nay học gì" (specs §10.1). */
export const GET = handle(async (_request: Request, context: Ctx) => {
  const session = await requireSession();
  const { enrollmentId } = await context.params;
  const enrollment = await requireActiveEnrollment(session.id, enrollmentId);

  return ok(await getTodayPlan(enrollment.id));
});
