import { handle, ok, readJson, readQuery } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { createStaffUserSchema, listUsersSchema } from '@/server/identity/schemas';
import { createStaffUser, listUsers } from '@/server/identity/service';

export const GET = handle(async (request: Request) => {
  await requireAdmin();
  const filter = readQuery(request, listUsersSchema);
  return ok(await listUsers(filter));
});

/**
 * Tạo tài khoản nhân sự: giáo viên, biên soạn viên, reviewer, admin vận hành.
 *
 * `actorId` được LẤY TỪ PHIÊN ĐĂNG NHẬP chứ không đọc từ body. Trước đây nó nằm
 * trong schema nên client phải tự khai — nghĩa là ai gọi API cũng ghi được nhật
 * ký dưới tên người khác, và giao diện thì không có cách nào biết id của mình để
 * điền vào. Ghép ở đây giải quyết cả hai.
 */
export const POST = handle(async (request: Request) => {
  const session = await requireAdmin();
  const input = await readJson(request, createStaffUserSchema);
  const userId = await createStaffUser(input, session.id);
  return ok({ userId }, 201);
});
