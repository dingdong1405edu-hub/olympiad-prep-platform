import { handle, ok } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { getDayProgress, getNextItem } from '@/server/learning/service';

type Ctx = { params: Promise<{ planDayId: string }> };

/**
 * Câu tiếp theo của buổi học.
 *
 * Dữ liệu trả về CỐ TÌNH không chứa đáp án, lời giải hay nội dung gợi ý:
 * học sinh muốn xem gợi ý/lời giải phải gọi endpoint riêng để hệ thống còn
 * ghi nhận là đã dùng trợ giúp (specs §9.2).
 *
 * Hết câu thì `finished = true` kèm tổng kết buổi học cho màn hình hoàn thành.
 */
export const GET = handle(async (_request: Request, context: Ctx) => {
  const session = await requireSession();
  const { planDayId } = await context.params;

  const item = await getNextItem(planDayId, session.id);
  if (item) {
    return ok({ finished: false, item, progress: item.progress, summary: null });
  }

  const summary = await getDayProgress(planDayId, session.id);
  return ok({
    finished: true,
    item: null,
    progress: { done: summary.done, total: summary.total },
    summary,
  });
});
