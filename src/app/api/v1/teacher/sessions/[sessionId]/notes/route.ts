import { ApiError, handle, ok } from '@/lib/http';
import { requireTeacherActor } from '@/server/teacher/actor';
import { saveSessionNotesSchema } from '@/server/teacher/schemas';
import { saveSessionNotes } from '@/server/teacher/service';

type Ctx = { params: Promise<{ sessionId: string }> };

/**
 * Ghi nhận xét sau buổi tư vấn — endpoint quan trọng nhất của khu vực giáo viên.
 *
 * Một lời gọi làm bốn việc: lưu nhận xét, chốt buổi, đẩy override vào engine cho
 * chu kỳ sau và báo cho học sinh. `planUpdated = false` nghĩa là nhận xét ĐÃ lưu
 * nhưng lộ trình chưa đổi được (thường do gói học hết hạn) — giao diện phải hiện
 * cảnh báo kèm theo chứ không được báo lỗi chung chung.
 */
export const POST = handle(async (request: Request, context: Ctx) => {
  const actor = await requireTeacherActor();
  const { sessionId } = await context.params;

  // Không dùng readJson vì body cần ghép thêm hai trường lấy từ ngữ cảnh TRƯỚC
  // khi validate: `sessionId` lấy từ URL và `teacherUserId` lấy từ phiên đăng
  // nhập — cả hai không bao giờ nhận từ body, để không ai ghi nhận xét thay
  // người khác bằng cách sửa payload.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw ApiError.badRequest('Body phải là JSON hợp lệ.');
  }
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const input = saveSessionNotesSchema.parse({
    ...body,
    sessionId,
    teacherUserId: actor.userId,
  });

  return ok(await saveSessionNotes(actor, input));
});
