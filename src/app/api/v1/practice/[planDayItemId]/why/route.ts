import { handle, ok } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { getWhyThisItem } from '@/server/learning/service';

type Ctx = { params: Promise<{ planDayItemId: string }> };

/**
 * "Vì sao hệ thống giao câu này cho em?" — mọi câu đều phải giải thích được
 * bằng ngôn ngữ học sinh hiểu (specs §7.8, §17). Chỉ đọc, không ghi.
 */
export const GET = handle(async (_request: Request, context: Ctx) => {
  const session = await requireSession();
  const { planDayItemId } = await context.params;

  return ok(await getWhyThisItem(planDayItemId, session.id));
});
