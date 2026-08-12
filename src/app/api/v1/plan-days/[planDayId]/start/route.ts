import { handle, ok } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { startPlanDay } from '@/server/learning/service';

type Ctx = { params: Promise<{ planDayId: string }> };

/**
 * Mở buổi học của ngày. Gọi lại nhiều lần không tạo mốc bắt đầu mới —
 * service tự nhận ra buổi đang dở và trả `alreadyStarted` để giao diện
 * hiển thị "Tiếp tục" thay vì "Bắt đầu".
 */
export const POST = handle(async (_request: Request, context: Ctx) => {
  const session = await requireSession();
  const { planDayId } = await context.params;

  // Service kiểm tra buổi học có thuộc về chính học sinh này và khóa học còn hạn.
  return ok(await startPlanDay(planDayId, session.id));
});
