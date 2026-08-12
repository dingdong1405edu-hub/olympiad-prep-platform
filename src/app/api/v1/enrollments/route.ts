import { handle, ok } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { listEnrollmentsForUser } from '@/server/commerce/service';

export const GET = handle(async () => {
  const session = await requireSession();
  return ok(await listEnrollmentsForUser(session.id));
});
