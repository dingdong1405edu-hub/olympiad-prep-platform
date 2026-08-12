import { handle, ok } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { getAttemptForStudent } from '@/server/assessment/service';

type Ctx = { params: Promise<{ attemptId: string }> };

/** Bài đang làm. Service tự kiểm tra quyền sở hữu và không trả đáp án/lời giải. */
export const GET = handle(async (_request: Request, context: Ctx) => {
  const session = await requireSession();
  const { attemptId } = await context.params;

  return ok(await getAttemptForStudent(attemptId, session.id));
});
