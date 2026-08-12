import { z } from 'zod';
import { ADMIN_ROLES, requireRole } from '@/lib/auth';
import { handle, ok, readQuery } from '@/lib/http';
import {
  getBusinessKpis,
  getContentKpis,
  getEngineKpis,
  getLearningKpis,
  getTeacherKpis,
} from '@/server/analytics/service';

/**
 * Bốn nhóm chỉ số của specs §13. Mặc định trả HẾT để màn hình báo cáo chỉ cần
 * một lời gọi; `?groups=business,learning` khi chỉ cần một phần (vd widget).
 */
const querySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  groups: z.string().trim().optional(),
});

const ALL_GROUPS = ['business', 'learning', 'content', 'engine', 'teacher'] as const;
type Group = (typeof ALL_GROUPS)[number];

export const GET = handle(async (request: Request) => {
  await requireRole(...ADMIN_ROLES);
  const query = readQuery(request, querySchema);
  const range = { from: query.from, to: query.to };

  const wanted: Group[] = query.groups
    ? query.groups
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter((value): value is Group => (ALL_GROUPS as readonly string[]).includes(value))
    : [...ALL_GROUPS];

  // Các nhóm chỉ số độc lập nhau nên chạy song song; nhóm nội dung không phụ
  // thuộc khoảng thời gian vì nó đo trạng thái hiện tại của ngân hàng câu hỏi.
  const [business, learning, content, engine, teacher] = await Promise.all([
    wanted.includes('business') ? getBusinessKpis(range) : null,
    wanted.includes('learning') ? getLearningKpis(range) : null,
    wanted.includes('content') ? getContentKpis() : null,
    wanted.includes('engine') ? getEngineKpis(range) : null,
    wanted.includes('teacher') ? getTeacherKpis(range) : null,
  ]);

  return ok({ business, learning, content, engine, teacher });
});
