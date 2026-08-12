import { handle, ok } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { revealSolution } from '@/server/learning/service';

type Ctx = { params: Promise<{ planDayItemId: string }> };

/**
 * Mở lời giải của câu.
 *
 * Dùng POST vì thao tác này GHI dữ liệu: xem lời giải TRƯỚC khi trả lời thì
 * câu đó không được tính là đã thành thạo (specs §9.2) — service trả về
 * `viewedBeforeAnswer` để giao diện nói rõ điều đó với học sinh.
 */
export const POST = handle(async (_request: Request, context: Ctx) => {
  const session = await requireSession();
  const { planDayItemId } = await context.params;

  return ok(await revealSolution(planDayItemId, session.id));
});
