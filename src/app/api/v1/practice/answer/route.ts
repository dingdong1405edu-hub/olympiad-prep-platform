import { handle, ok, readJson } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { answerItemSchema } from '@/server/plan/schemas';
import { answerItem } from '@/server/learning/service';

/**
 * Nộp đáp án một câu và nhận phản hồi tức thì.
 *
 * Cờ trợ giúp (hintUsed, solutionViewedBeforeAnswer) do client gửi chỉ được
 * CỘNG THÊM vào cờ máy chủ đã ghi nhận — service không cho phép ghi đè, nên
 * học sinh không thể "quên" khai báo để lấy trọn mức thành thạo.
 */
export const POST = handle(async (request: Request) => {
  const session = await requireSession();

  // Chặn kịch bản gửi đáp án tự động hàng loạt để cày mức thành thạo.
  enforceRateLimit(`answer:${session.id}`, RATE_LIMITS.ANSWER);

  const input = await readJson(request, answerItemSchema);

  return ok(
    await answerItem({
      userId: session.id,
      planDayItemId: input.planDayItemId,
      answer: input.answer,
      timeMs: input.timeMs,
      hintUsed: input.hintUsed,
      solutionViewedBeforeAnswer: input.solutionViewedBeforeAnswer,
    }),
  );
});
