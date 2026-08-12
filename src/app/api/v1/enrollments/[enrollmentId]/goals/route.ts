import { z } from 'zod';
import { handle, ok, readJson } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { requireActiveEnrollment } from '@/server/commerce/service';
import { timeBudgetSchema, studentLevelSchema } from '@/server/plan/schemas';
import { createGoal } from '@/server/plan/service';

const bodySchema = timeBudgetSchema.extend({
  targetLevel: studentLevelSchema,
  deadline: z.coerce.date({ invalid_type_error: 'Mốc thời gian không hợp lệ.' }),
});

type Ctx = { params: Promise<{ enrollmentId: string }> };

/**
 * Lưu mục tiêu và sinh luôn lộ trình chu kỳ đầu.
 * Mục tiêu không khả thi vẫn được lưu — kết quả trả về kèm cảnh báo để giao diện
 * hiển thị, hệ thống không chặn quyền tự quyết của học sinh (specs §6.1).
 */
export const POST = handle(async (request: Request, context: Ctx) => {
  const session = await requireSession();
  const { enrollmentId } = await context.params;
  const enrollment = await requireActiveEnrollment(session.id, enrollmentId);

  const input = await readJson(request, bodySchema);
  const result = await createGoal({ enrollmentId: enrollment.id, ...input });

  return ok(result, 201);
});
