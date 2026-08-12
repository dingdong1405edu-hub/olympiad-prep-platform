import { z } from 'zod';
import { handle, ok, readJson, readQuery } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import {
  countUnread,
  listNotifications,
  markAllRead,
  markNotificationRead,
} from '@/server/notification/service';

const querySchema = z.object({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const patchSchema = z.object({
  notificationId: z.string().min(1).optional(),
  all: z.boolean().optional(),
});

export const GET = handle(async (request: Request) => {
  const session = await requireSession();
  const { unreadOnly, limit } = readQuery(request, querySchema);

  const [result, unread] = await Promise.all([
    listNotifications(session.id, { unreadOnly, limit }),
    countUnread(session.id),
  ]);

  return ok({ ...result, unread });
});

/** Đánh dấu đã đọc: một thông báo, hoặc tất cả. */
export const PATCH = handle(async (request: Request) => {
  const session = await requireSession();
  const input = await readJson(request, patchSchema);

  if (input.all) {
    const marked = await markAllRead(session.id);
    return ok({ marked });
  }
  if (!input.notificationId) {
    return ok({ marked: 0 });
  }

  await markNotificationRead(input.notificationId, session.id);
  return ok({ marked: 1 });
});
