import { z } from 'zod';
import { handle, ok, readJson, readQuery } from '@/lib/http';
import { requireContentStaff } from '@/lib/auth';
import { flagFilterSchema, resolveFlagSchema } from '@/server/content/schemas';
import { listFlags, resolveFlag } from '@/server/content/service';

// resolveFlagSchema chỉ mô tả kết quả xử lý; id phiếu đi kèm ở tầng HTTP.
const patchSchema = resolveFlagSchema.extend({ flagId: z.string().min(1) });

/** Phiếu báo lỗi câu hỏi do học sinh, giáo viên hoặc hệ thống gửi lên. */
export const GET = handle(async (request: Request) => {
  await requireContentStaff();
  const filter = readQuery(request, flagFilterSchema);
  return ok(await listFlags(filter));
});

export const PATCH = handle(async (request: Request) => {
  const session = await requireContentStaff();
  const input = await readJson(request, patchSchema);

  await resolveFlag(input.flagId, input.resolution, session.id);
  return ok({ flagId: input.flagId, resolution: input.resolution });
});
