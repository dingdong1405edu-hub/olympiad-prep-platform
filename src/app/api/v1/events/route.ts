import { z } from 'zod';
import { handle, ok, readJson } from '@/lib/http';
import { getSession } from '@/lib/auth';
import { EVENTS, trackBatch } from '@/lib/analytics';

const ALLOWED = new Set<string>(Object.values(EVENTS));

const bodySchema = z.object({
  events: z
    .array(
      z.object({
        eventName: z.string().min(1).max(64),
        enrollmentId: z.string().min(1).optional(),
        properties: z.record(z.unknown()).optional(),
        sessionId: z.string().max(64).optional(),
      }),
    )
    .max(50, 'Mỗi lần gửi tối đa 50 sự kiện.'),
});

/**
 * Nhận sự kiện tracking từ trình duyệt.
 * Chấp nhận cả khách chưa đăng nhập (phễu bán hàng bắt đầu từ trang chủ), và
 * bỏ qua tên sự kiện lạ để không ai bơm rác vào bảng phân tích.
 */
export const POST = handle(async (request: Request) => {
  const session = await getSession();
  const { events } = await readJson(request, bodySchema);

  const accepted = events.filter((event) => ALLOWED.has(event.eventName));
  await trackBatch(
    accepted.map((event) => ({
      eventName: event.eventName,
      userId: session?.id ?? null,
      enrollmentId: event.enrollmentId ?? null,
      properties: event.properties ?? {},
      sessionId: event.sessionId ?? null,
    })),
  );

  return ok({ received: events.length, accepted: accepted.length });
});
