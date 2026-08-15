import { handle, ok, readJson } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { clientIp, enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { submitSitting } from '@/server/mock-exam/service';
import { saveDraftSchema } from '@/server/mock-exam/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ attemptId: string }> };

/**
 * NỘP BÀI.
 *
 * Chấm ngay tại đây toàn bộ phần máy chấm được (trắc nghiệm, đáp số, biểu thức,
 * lưới) rồi trả về danh sách câu tự luận còn lại để trình duyệt gọi chấm song
 * song — xem `/api/v1/exam-attempts/[attemptId]/grade`.
 */
export const POST = handle(async (request: Request, context: Ctx) => {
  enforceRateLimit(`mock-submit:${clientIp(request)}`, RATE_LIMITS.CHECKOUT);

  const { attemptId } = await context.params;
  const body = await readJson(request, saveDraftSchema);
  const session = await requireSession();

  return ok(await submitSitting({ attemptId, userId: session.id, answers: body.answers }), 201);
});
