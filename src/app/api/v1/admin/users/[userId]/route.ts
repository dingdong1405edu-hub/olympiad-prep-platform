import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { ApiError, handle, ok, readJson } from '@/lib/http';
import { assignRole, getUserDetail, removeRole, setUserStatus } from '@/server/identity/service';
import { roleSchema } from '@/server/identity/schemas';

type Ctx = { params: Promise<{ userId: string }> };

export const GET = handle(async (_request: Request, context: Ctx) => {
  await requireRole('SUPER_ADMIN', 'OPS_ADMIN', 'PROGRAM_MANAGER');
  const { userId } = await context.params;
  return ok(await getUserDetail(userId));
});

const patchSchema = z.object({
  /** Danh sách vai trò MONG MUỐN sau khi lưu; hệ thống tự tính phần thêm/bớt. */
  roles: z.array(roleSchema).max(8).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']).optional(),
});

/**
 * Đổi vai trò và trạng thái một tài khoản.
 *
 * BA CHỐT AN TOÀN, đều nhắm vào cùng một tai nạn: khóa mất chính mình hoặc khóa
 * mất người quản trị cuối cùng rồi không ai vào được hệ thống nữa.
 *  1. Chỉ SUPER_ADMIN mới cấp hoặc thu hồi được quyền SUPER_ADMIN.
 *  2. Không tự đổi vai trò hay tự khóa tài khoản của chính mình.
 *  3. Không gỡ SUPER_ADMIN cuối cùng, cũng không khóa tài khoản đó.
 */
export const PATCH = handle(async (request: Request, context: Ctx) => {
  const session = await requireRole('SUPER_ADMIN', 'OPS_ADMIN');
  const { userId } = await context.params;
  const input = await readJson(request, patchSchema);

  if (userId === session.id) {
    throw ApiError.badRequest(
      'Không tự đổi quyền hay khóa tài khoản của chính mình. Nhờ một quản trị viên khác thực hiện.',
    );
  }

  const target = await getUserDetail(userId);
  const before = target.roles.map((entry) => entry.role);
  const isSuperAdmin = session.roles.includes('SUPER_ADMIN');

  if (input.roles) {
    const next = [...new Set(input.roles)];
    const added = next.filter((role) => !before.includes(role));
    const removed = before.filter((role) => !next.includes(role));

    if (!isSuperAdmin && [...added, ...removed].includes('SUPER_ADMIN')) {
      throw ApiError.forbidden('Chỉ quản trị cấp cao nhất mới thay đổi được quyền SUPER_ADMIN.');
    }

    if (removed.includes('SUPER_ADMIN')) await assertNotLastSuperAdmin(userId);
    if (next.length === 0) throw ApiError.badRequest('Tài khoản phải có ít nhất một vai trò.');

    for (const role of added) await assignRole(userId, role, session.id);
    for (const role of removed) await removeRole(userId, role, session.id);
  }

  if (input.status && input.status !== target.status) {
    if (input.status === 'SUSPENDED' && before.includes('SUPER_ADMIN')) {
      await assertNotLastSuperAdmin(userId);
    }
    await setUserStatus(userId, input.status, session.id);
  }

  return ok(await getUserDetail(userId));
});

/** Chặn thao tác làm hệ thống không còn quản trị viên cấp cao nhất nào hoạt động. */
async function assertNotLastSuperAdmin(userId: string): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  const others = await prisma.userRole.count({
    where: { role: 'SUPER_ADMIN', userId: { not: userId }, user: { status: 'ACTIVE' } },
  });
  if (others === 0) {
    throw ApiError.conflict(
      'Đây là quản trị viên cấp cao nhất duy nhất đang hoạt động. Hãy cấp quyền cho người khác trước.',
    );
  }
}
