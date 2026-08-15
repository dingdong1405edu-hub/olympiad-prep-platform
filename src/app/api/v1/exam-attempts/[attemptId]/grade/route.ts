import { handle, ok, readJson } from '@/lib/http';
import { getSession } from '@/lib/auth';
import { clientIp, enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { gradeMockEssay } from '@/server/mock-exam/service';
import { gradeEssaySchema } from '@/server/mock-exam/schemas';

/**
 * Một lượt chấm gồm hai lời gọi model (đọc ảnh → chấm barem), tổng 15–40 giây,
 * cá biệt lâu hơn. Nói rõ cho hạ tầng biết để đừng cắt giữa chừng (spec §6).
 */
export const maxDuration = 300;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ attemptId: string }> };

/**
 * CHẤM MỘT CÂU TỰ LUẬN. Đây là route trình duyệt gọi SONG SONG nhiều lần.
 *
 * Không bao giờ ném lỗi ra ngoài vì AI hỏng: service tự ghi câu đó là FAILED
 * kèm lý do và trả về bình thường, để một câu hỏng không kéo đổ cả bài thi.
 */
export const POST = handle(async (request: Request, context: Ctx) => {
  enforceRateLimit(`mock-grade:${clientIp(request)}`, RATE_LIMITS.MOCK_GRADE);

  const { attemptId } = await context.params;
  const body = await readJson(request, gradeEssaySchema);
  const session = await getSession();

  // `doc_lai=1` — học sinh báo "AI đọc sai chữ em": bỏ transcript cũ, đọc ảnh lại.
  const forceTranscribe = new URL(request.url).searchParams.get('doc_lai') === '1';

  return ok(
    await gradeMockEssay({
      attemptId,
      questionId: body.questionId,
      viewer: session,
      forceTranscribe,
    }),
  );
});
