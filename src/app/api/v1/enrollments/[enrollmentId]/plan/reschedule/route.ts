import { z } from 'zod';
import { handle, ok, readJson } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { requireActiveEnrollment } from '@/server/commerce/service';
import { reschedulePlan } from '@/server/plan/service';

const bodySchema = z.object({
  reason: z.string().trim().min(1).max(200).default('Học sinh yêu cầu sắp xếp lại lịch'),
});

type Ctx = { params: Promise<{ enrollmentId: string }> };

/**
 * Dàn lại lịch sau khi bỏ lỡ vài ngày. Ngày bỏ lỡ KHÔNG bị xóa khỏi lịch sử,
 * chỉ được đánh dấu và dời nội dung sang các ngày còn lại (specs §10.2).
 */
export const POST = handle(async (request: Request, context: Ctx) => {
  const session = await requireSession();
  const { enrollmentId } = await context.params;
  const enrollment = await requireActiveEnrollment(session.id, enrollmentId);

  const input = await readJson(request, bodySchema);
  return ok(await reschedulePlan({ enrollmentId: enrollment.id, reason: input.reason }));
});
