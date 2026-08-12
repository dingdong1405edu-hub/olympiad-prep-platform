import { handle, ok } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { requireActiveEnrollment } from '@/server/commerce/service';
import { startDiagnostic } from '@/server/assessment/service';

type Ctx = { params: Promise<{ enrollmentId: string }> };

/** Bắt đầu bài đầu vào, hoặc trả lại bài đang dở để học sinh làm tiếp. */
export const POST = handle(async (_request: Request, context: Ctx) => {
  const session = await requireSession();
  const { enrollmentId } = await context.params;
  const enrollment = await requireActiveEnrollment(session.id, enrollmentId);

  return ok(await startDiagnostic(enrollment.id));
});
