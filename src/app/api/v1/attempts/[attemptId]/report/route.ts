import { handle, ok } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { getAttemptReport } from '@/server/assessment/service';

type Ctx = { params: Promise<{ attemptId: string }> };

/** Báo cáo sau khi nộp — lúc này mới được kèm đáp án và lời giải. */
export const GET = handle(async (_request: Request, context: Ctx) => {
  const session = await requireSession();
  const { attemptId } = await context.params;

  return ok(await getAttemptReport(attemptId, session.id));
});
