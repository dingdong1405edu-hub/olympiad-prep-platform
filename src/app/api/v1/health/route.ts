import { handle, ok } from '@/lib/http';
import { prisma } from '@/lib/prisma';

/**
 * Health check cho hạ tầng (Railway healthcheck, uptime monitor).
 *
 * Trả 200 kèm `database: 'up'` khi kết nối Postgres còn sống. Nếu truy vấn thăm
 * dò hỏng thì vẫn trả 200 nhưng `database: 'down'` — container đang chạy được,
 * chỉ là phụ thuộc bên ngoài trục trặc, không nên để Railway restart vòng lặp.
 *
 * Kèm theo phần `seed`: SỐ ĐẾM của bốn bảng cốt lõi. Đây là thứ phân biệt được
 * ba trạng thái mà nếu không có thì nhìn hệt như nhau từ bên ngoài:
 *   - database chưa chạy migration  → truy vấn hỏng, `database: 'down'`
 *   - đã có bảng nhưng chưa nạp dữ liệu → mọi số bằng 0, trang chủ trống trơn
 *   - nạp dở dang (chết giữa chừng)   → có chương trình nhưng không có người dùng
 * Chỉ là con số tổng, không kèm bất kỳ dữ liệu cá nhân nào.
 */
export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  let database: 'up' | 'down' = 'down';
  let seed: {
    programs: number;
    courses: number;
    questions: number;
    users: number;
    state: 'empty' | 'partial' | 'ready';
  } | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = 'up';

    const [programs, courses, questions, users] = await Promise.all([
      prisma.program.count(),
      prisma.course.count(),
      prisma.questionItem.count(),
      prisma.user.count(),
    ]);

    const counts = [programs, courses, questions, users];
    const state = counts.every((n) => n === 0)
      ? 'empty'
      : counts.some((n) => n === 0)
        ? 'partial'
        : 'ready';

    seed = { programs, courses, questions, users, state };
  } catch (error) {
    console.error('[health] không kết nối được database', error);
  }

  return ok({
    status: 'ok',
    database,
    seed,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
