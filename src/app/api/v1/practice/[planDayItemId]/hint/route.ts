import { handle, ok } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { revealHint } from '@/server/learning/service';

type Ctx = { params: Promise<{ planDayItemId: string }> };

/**
 * Mở gợi ý của câu đang làm.
 *
 * Dùng POST vì thao tác này GHI dữ liệu: hệ thống đánh dấu lượt làm hiện tại
 * là có dùng trợ giúp, nên câu đúng sau đó chỉ được tính một phần (specs §7.2).
 */
export const POST = handle(async (_request: Request, context: Ctx) => {
  const session = await requireSession();
  const { planDayItemId } = await context.params;

  return ok(await revealHint(planDayItemId, session.id));
});
