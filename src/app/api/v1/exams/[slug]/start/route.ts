import { handle, ok } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { clientIp, enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { startMockAttempt } from '@/server/mock-exam/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };

/**
 * BẮT ĐẦU MỘT LƯỢT THI.
 *
 * Bắt buộc đăng nhập: quota "mỗi tài khoản 5 lượt miễn phí một đề" chỉ đếm được
 * khi có tài khoản để đếm. Đang có lượt dở còn hạn thì service trả lại đúng lượt
 * đó (`resumed: true`) chứ không tạo lượt mới — tải lại trang không đốt quota.
 */
export const POST = handle(async (request: Request, context: Ctx) => {
  enforceRateLimit(`mock-start:${clientIp(request)}`, RATE_LIMITS.CHECKOUT);

  const { slug } = await context.params;
  const session = await requireSession();

  return ok(await startMockAttempt({ slug, userId: session.id }), 201);
});
