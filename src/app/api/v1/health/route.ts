import { handle, ok } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { aiStatus } from '@/server/mock-exam/service';

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
 *
 * Phần `ai` trả lời một câu mà trước đây phải đăng nhập mới biết: **khóa AI đã ăn
 * chưa?** Đặt biến môi trường trên Railway rồi mà quên bấm deploy lại thì container
 * cũ vẫn chạy với biến cũ, và nhìn từ ngoài không có dấu hiệu nào cả — cho tới khi
 * một học sinh nộp bài và câu tự luận báo "chưa chấm được".
 *
 * CỐ TÌNH chỉ trả một chữ trạng thái: không tên nhà cung cấp, không tên model,
 * và tuyệt đối không có khóa. Chi tiết đầy đủ nằm ở `/quan-tri/thi-thu`, sau
 * đăng nhập.
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

  const provider = aiStatus();
  const ai = provider.live
    ? 'live'
    : provider.demo
      ? 'demo' // MOCK_AI_PROVIDER=mock — điểm tự luận là điểm mẫu
      : 'no-key'; // chưa gắn khóa: câu tự luận sẽ báo chưa chấm được

  return ok({
    status: 'ok',
    database,
    seed,
    ai,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
