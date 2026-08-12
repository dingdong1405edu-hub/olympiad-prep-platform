import { handle, ok, readJson } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { reportItemSchema } from '@/server/plan/schemas';
import { reportItem } from '@/server/learning/service';

/**
 * Học sinh báo câu hỏi có vấn đề (sai đề, thiếu dữ kiện, lời giải khó hiểu…).
 * Service chỉ nhận báo lỗi cho câu hệ thống ĐÃ GIAO cho chính học sinh này,
 * nên không thể dò id ngẫu nhiên để spam ticket cho bộ phận chuyên môn.
 */
export const POST = handle(async (request: Request) => {
  const session = await requireSession();
  const input = await readJson(request, reportItemSchema);

  return ok(
    await reportItem({
      userId: session.id,
      itemId: input.itemId,
      reason: input.reason,
      detail: input.detail,
    }),
    201,
  );
});
