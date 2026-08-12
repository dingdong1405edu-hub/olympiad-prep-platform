import { z } from 'zod';
import { handle, ok, readJson } from '@/lib/http';
import { requireTeacherActor } from '@/server/teacher/actor';
import { closeSession, getSessionDetail } from '@/server/teacher/service';

type Ctx = { params: Promise<{ sessionId: string }> };

/** Toàn bộ dữ liệu cho màn hình tư vấn 20 phút: brief AI + hồ sơ học sinh. */
export const GET = handle(async (_request: Request, context: Ctx) => {
  const actor = await requireTeacherActor();
  const { sessionId } = await context.params;
  return ok(await getSessionDetail(actor, sessionId));
});

/**
 * Đóng buổi tư vấn không diễn ra. Chỉ nhận hai trạng thái này — buổi đã diễn ra
 * phải đóng bằng cách ghi nhận xét (POST .../notes) để engine nhận được override.
 */
const closeSchema = z.object({
  status: z.enum(['CANCELLED', 'NO_SHOW']),
  reason: z.string().trim().max(500).optional(),
});

export const PATCH = handle(async (request: Request, context: Ctx) => {
  const actor = await requireTeacherActor();
  const { sessionId } = await context.params;
  const input = await readJson(request, closeSchema);
  const rows = await closeSession(actor, { sessionId, ...input });
  return ok({ rows });
});
