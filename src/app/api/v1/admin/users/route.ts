import { handle, ok, readJson, readQuery } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { createStaffUserSchema, listUsersSchema } from '@/server/identity/schemas';
import { createStaffUser, listUsers } from '@/server/identity/service';

export const GET = handle(async (request: Request) => {
  await requireAdmin();
  const filter = readQuery(request, listUsersSchema);
  return ok(await listUsers(filter));
});

/** Tạo tài khoản nhân sự: giáo viên, biên soạn viên, reviewer, admin vận hành. */
export const POST = handle(async (request: Request) => {
  await requireAdmin();
  const input = await readJson(request, createStaffUserSchema);
  const userId = await createStaffUser(input);
  return ok({ userId }, 201);
});
