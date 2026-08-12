import { handle, ok } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { getUserDetail } from '@/server/identity/service';

export const GET = handle(async () => {
  const session = await requireSession();
  const detail = await getUserDetail(session.id);
  return ok(detail);
});
