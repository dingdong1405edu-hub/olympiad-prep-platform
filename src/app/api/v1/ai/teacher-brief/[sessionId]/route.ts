import { handle, ok } from '@/lib/http';
import { generateTeacherBrief } from '@/server/ai/service';
import { requireTeacherActor } from '@/server/teacher/actor';
import { assertCanAccessEnrollment } from '@/server/teacher/service';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/http';

type Ctx = { params: Promise<{ sessionId: string }> };

/**
 * Bản tóm tắt 7 khối trước buổi tư vấn.
 *
 * Không bao giờ ném lỗi AI ra ngoài: hết quota, thiếu API key hay model trả sai
 * cấu trúc đều rơi xuống bản dựng bằng template, `fallbackUsed = true`. Giáo
 * viên luôn có thứ để đọc khi bước vào buổi 20 phút (specs §8.1).
 */
export const GET = handle(async (_request: Request, context: Ctx) => {
  const actor = await requireTeacherActor();
  const { sessionId } = await context.params;

  const session = await prisma.teacherSession.findUnique({
    where: { id: sessionId },
    select: { id: true, enrollmentId: true },
  });
  if (!session) throw ApiError.notFound('Không tìm thấy buổi tư vấn.');
  await assertCanAccessEnrollment(actor, session.enrollmentId);

  return ok(await generateTeacherBrief(sessionId));
});
