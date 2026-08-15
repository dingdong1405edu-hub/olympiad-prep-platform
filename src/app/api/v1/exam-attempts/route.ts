import { handle, ok, readJson } from '@/lib/http';
import { getSession } from '@/lib/auth';
import { clientIp, enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { submitMockAttempt } from '@/server/mock-exam/service';
import { submitAttemptSchema } from '@/server/mock-exam/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * NỘP BÀI.
 *
 * Chấm ngay tại đây toàn bộ phần máy chấm được (trắc nghiệm, đáp số, biểu thức,
 * lưới) rồi trả về danh sách câu tự luận còn lại để trình duyệt gọi chấm song
 * song — xem `/api/v1/exam-attempts/[attemptId]/grade`.
 *
 * Không đăng nhập vẫn nộp được: bài gắn `userId = null`, đường link kết quả
 * chính là chìa khóa (spec §4).
 */
export const POST = handle(async (request: Request) => {
  enforceRateLimit(`mock-submit:${clientIp(request)}`, RATE_LIMITS.CHECKOUT);

  const body = await readJson(request, submitAttemptSchema);
  const session = await getSession();

  return ok(
    await submitMockAttempt({
      slug: body.slug,
      userId: session?.id ?? null,
      startedAt: body.startedAt,
      answers: body.answers,
    }),
    201,
  );
});
