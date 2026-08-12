import { ADMIN_ROLES, requireRole } from '@/lib/auth';
import { handle, ok, readJson } from '@/lib/http';
import { assignTeacherSchema } from '@/server/teacher/schemas';
import { assignTeacher, getTeacherWorkload } from '@/server/teacher/service';

/**
 * Bảng tải của từng giáo viên: số học sinh đang phụ trách so với sức chứa khai
 * báo, số buổi sắp tới và — chỉ số quan trọng nhất — số buổi đã qua giờ hẹn mà
 * chưa có nhận xét. Buổi không có nhận xét nghĩa là engine không nhận được
 * override cho chu kỳ sau, tức vòng lặp con người bị đứt.
 */
export const GET = handle(async () => {
  await requireRole(...ADMIN_ROLES);
  const rows = await getTeacherWorkload();
  return ok({
    rows,
    total: rows.length,
    overloaded: rows.filter((row) => row.utilization > 1).length,
    pendingNotes: rows.reduce((sum, row) => sum + row.sessionsWithoutNotes, 0),
  });
});

/** Phân công (hoặc đổi) giáo viên phụ trách một học sinh. */
export const POST = handle(async (request: Request) => {
  const session = await requireRole(...ADMIN_ROLES);
  const input = await readJson(request, assignTeacherSchema);
  await assignTeacher({ ...input, actorId: session.id });
  return ok({ assigned: true }, 201);
});
