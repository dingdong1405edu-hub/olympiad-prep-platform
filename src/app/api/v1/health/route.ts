import { handle, ok } from '@/lib/http';
import { prisma } from '@/lib/prisma';

/**
 * Health check cho hạ tầng (Railway healthcheck, uptime monitor).
 *
 * Trả 200 kèm `database: 'up'` khi kết nối Postgres còn sống. Nếu truy vấn thăm
 * dò hỏng thì vẫn trả 200 nhưng `database: 'down'` — container đang chạy được,
 * chỉ là phụ thuộc bên ngoài trục trặc, không nên để Railway restart vòng lặp.
 */
export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  let database: 'up' | 'down' = 'down';
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = 'up';
  } catch (error) {
    console.error('[health] không kết nối được database', error);
  }

  return ok({
    status: 'ok',
    database,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
