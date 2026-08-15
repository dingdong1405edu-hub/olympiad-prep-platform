import { handle, ok, readJson } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { clientIp, enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { saveSittingDraft } from '@/server/mock-exam/service';
import { saveDraftSchema } from '@/server/mock-exam/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ attemptId: string }> };

/**
 * TỰ LƯU TRONG LÚC LÀM BÀI.
 *
 * Gọi vài giây một lần nên dùng hạn mức rộng như route trả lời câu hỏi luyện tập.
 * Trả về số giây còn lại theo đồng hồ MÁY CHỦ để trình duyệt chỉnh lại đồng hồ
 * của mình — máy học sinh chạy sai giờ cũng không xin thêm được phút nào.
 */
export const PUT = handle(async (request: Request, context: Ctx) => {
  enforceRateLimit(`mock-draft:${clientIp(request)}`, RATE_LIMITS.ANSWER);

  const { attemptId } = await context.params;
  const body = await readJson(request, saveDraftSchema);
  const session = await requireSession();

  return ok(await saveSittingDraft({ attemptId, userId: session.id, answers: body.answers }));
});
