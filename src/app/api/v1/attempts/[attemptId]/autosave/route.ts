import { z } from 'zod';
import { handle, ok, readJson } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { autosaveAttempt } from '@/server/assessment/service';

const bodySchema = z.object({
  answers: z
    .array(
      z.object({
        itemAttemptId: z.string().min(1),
        answer: z.unknown(),
        timeMs: z.coerce.number().int().min(0).max(86_400_000).default(0),
      }),
    )
    .max(200),
});

type Ctx = { params: Promise<{ attemptId: string }> };

/**
 * Lưu tạm bài làm. Idempotent và gọi liên tục được — mất mạng ngắn hay bấm F5
 * đều không được làm mất bài của học sinh (specs §19.2 #7).
 */
export const PATCH = handle(async (request: Request, context: Ctx) => {
  const session = await requireSession();
  const { attemptId } = await context.params;

  const { answers } = await readJson(request, bodySchema);

  // z.unknown() sinh ra thuộc tính tùy chọn; chuẩn hóa về null để khớp kiểu service.
  await autosaveAttempt({
    attemptId,
    userId: session.id,
    answers: answers.map((entry) => ({
      itemAttemptId: entry.itemAttemptId,
      answer: entry.answer ?? null,
      timeMs: entry.timeMs,
    })),
  });

  return ok({ saved: true, savedAt: new Date().toISOString(), count: answers.length });
});
