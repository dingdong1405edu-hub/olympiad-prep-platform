import { handle, ok, readJson } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { requireActiveEnrollment } from '@/server/commerce/service';
import { goalOptionsSchema } from '@/server/plan/schemas';
import { getGoalOptions } from '@/server/plan/service';

type Ctx = { params: Promise<{ enrollmentId: string }> };

/**
 * Học sinh khai quỹ thời gian, hệ thống tính ngược ra các mục tiêu khả thi
 * thay vì áp một kế hoạch duy nhất (specs §6.1).
 */
export const POST = handle(async (request: Request, context: Ctx) => {
  const session = await requireSession();
  const { enrollmentId } = await context.params;
  const enrollment = await requireActiveEnrollment(session.id, enrollmentId);

  const input = await readJson(request, goalOptionsSchema);
  return ok(await getGoalOptions(enrollment.id, input));
});
