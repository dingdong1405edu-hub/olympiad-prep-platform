import { handle, ok } from '@/lib/http';
import { requireTeacherActor } from '@/server/teacher/actor';
import { getStudentDossier } from '@/server/teacher/service';

type Ctx = { params: Promise<{ enrollmentId: string }> };

/** Hồ sơ đầy đủ một học sinh: mastery, lỗi lặp, tiến độ, lịch sử bài và buổi tư vấn. */
export const GET = handle(async (_request: Request, context: Ctx) => {
  const actor = await requireTeacherActor();
  const { enrollmentId } = await context.params;
  return ok(await getStudentDossier(actor, enrollmentId));
});
