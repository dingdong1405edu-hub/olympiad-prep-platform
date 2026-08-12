import { handle, ok, readJson } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { changePasswordSchema } from '@/server/identity/schemas';
import { changePassword } from '@/server/identity/service';

export const POST = handle(async (request: Request) => {
  const session = await requireSession();
  const input = await readJson(request, changePasswordSchema);

  await changePassword(session.id, input.oldPassword, input.newPassword);
  return ok({ changed: true });
});
