import { handle, ok, readJson } from '@/lib/http';
import { requireContentStaff } from '@/lib/auth';
import { transitionItemSchema } from '@/server/content/schemas';
import { transitionItemStatus } from '@/server/content/service';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Chuyển trạng thái theo luồng Nháp → Đã thẩm định → Xuất bản → Báo lỗi/Ngừng dùng.
 * Quyền xuất bản do service kiểm tra dựa trên vai trò được truyền xuống — biên
 * soạn viên không thể tự đưa câu của mình vào đề thi (specs §5.3).
 */
export const POST = handle(async (request: Request, context: Ctx) => {
  const session = await requireContentStaff();
  const { id } = await context.params;

  const { status } = await readJson(request, transitionItemSchema);
  await transitionItemStatus(id, status, session.id, session.roles);

  return ok({ id, status });
});
