import { handle, ok, readQuery } from '@/lib/http';
import { requireTeacherActor } from '@/server/teacher/actor';
import { studentFilterSchema } from '@/server/teacher/schemas';
import { listStudents } from '@/server/teacher/service';

/** Danh sách học sinh giáo viên phụ trách, kèm cảnh báo đã tính sẵn. */
export const GET = handle(async (request: Request) => {
  const actor = await requireTeacherActor();
  const filter = readQuery(request, studentFilterSchema);
  const rows = await listStudents(actor, filter);
  return ok({ rows, total: rows.length });
});
