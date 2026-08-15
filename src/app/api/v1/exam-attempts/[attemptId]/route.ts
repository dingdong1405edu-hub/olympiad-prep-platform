import { handle, ok } from '@/lib/http';
import { getSession } from '@/lib/auth';
import { getAttemptResult } from '@/server/mock-exam/service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ attemptId: string }> };

/** Kết quả đầy đủ: kèm barem và lời giải mẫu, vì bài đã nộp rồi (spec §6). */
export const GET = handle(async (_request: Request, context: Ctx) => {
  const { attemptId } = await context.params;
  const session = await getSession();
  return ok(await getAttemptResult(attemptId, session));
});
