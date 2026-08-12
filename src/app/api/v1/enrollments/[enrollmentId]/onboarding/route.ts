import { z } from 'zod';
import { handle, ok, readJson } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireActiveEnrollment } from '@/server/commerce/service';
import { ensureAssessmentsForCourse } from '@/server/assessment/service';
import { ensureMasteryRows } from '@/server/student-model/service';

const bodySchema = z.object({
  selfDeclaredLevel: z.enum(['WEAK', 'AVERAGE', 'GOOD', 'EXCELLENT']),
});

type Ctx = { params: Promise<{ enrollmentId: string }> };

/**
 * Học sinh tự khai mức hiện tại. Đây CHỈ là dữ liệu khởi tạo để chọn vùng độ khó
 * cho bài đầu vào, không phải kết luận về năng lực (specs §10.1).
 */
export const POST = handle(async (request: Request, context: Ctx) => {
  const session = await requireSession();
  const { enrollmentId } = await context.params;
  const enrollment = await requireActiveEnrollment(session.id, enrollmentId);

  const { selfDeclaredLevel } = await readJson(request, bodySchema);

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { selfDeclaredLevel, onboardedAt: new Date() },
  });

  // Chuẩn bị sẵn bài kiểm tra và bộ khung hồ sơ năng lực để bước sau chạy ngay.
  await ensureAssessmentsForCourse(enrollment.courseId);
  await ensureMasteryRows(enrollment.id);

  return ok({ enrollmentId: enrollment.id, selfDeclaredLevel });
});
