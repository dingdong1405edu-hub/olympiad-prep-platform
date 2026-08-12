import { handle, ok } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { submitAttempt } from '@/server/assessment/service';

type Ctx = { params: Promise<{ attemptId: string }> };

/**
 * Nộp bài: chấm theo trọng số độ khó, dựng/cập nhật hồ sơ năng lực, chụp mốc
 * mastery và tạo yêu cầu đặt lịch tư vấn nếu là bài tiến bộ.
 */
export const POST = handle(async (_request: Request, context: Ctx) => {
  const session = await requireSession();
  const { attemptId } = await context.params;

  return ok(await submitAttempt({ attemptId, userId: session.id }));
});
