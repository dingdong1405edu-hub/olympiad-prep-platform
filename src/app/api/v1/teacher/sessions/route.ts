import { handle, ok, readJson, readQuery } from '@/lib/http';
import { requireTeacherActor } from '@/server/teacher/actor';
import { bookSessionSchema, listSessionsSchema } from '@/server/teacher/schemas';
import { bookSession, listSessions } from '@/server/teacher/service';

/** Lịch tư vấn của giáo viên; mặc định trả cả lịch sử để đối chiếu chu kỳ trước. */
export const GET = handle(async (request: Request) => {
  const actor = await requireTeacherActor();
  const filter = readQuery(request, listSessionsSchema);
  const rows = await listSessions(actor, filter);
  return ok({ rows, total: rows.length });
});

/**
 * Đặt hoặc dời lịch buổi tư vấn 20 phút.
 * Enrollment đã có buổi SCHEDULED thì buổi đó được cập nhật, không tạo buổi mới
 * — tránh việc học sinh nhìn thấy hai lịch trùng nhau.
 */
export const POST = handle(async (request: Request) => {
  const actor = await requireTeacherActor();
  const input = await readJson(request, bookSessionSchema);
  return ok(await bookSession(actor, input), 201);
});
