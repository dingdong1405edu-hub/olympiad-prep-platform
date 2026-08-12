import { z } from 'zod';
import { handle, ok, readJson } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { explainSolution } from '@/server/ai/service';

const bodySchema = z.object({
  level: z.enum(['SHORT', 'DETAILED']).default('DETAILED'),
});

type Ctx = { params: Promise<{ itemId: string }> };

/**
 * Giải thích lại lời giải. Service bám nguyên văn lời giải ĐÃ KIỂM DUYỆT và từ
 * chối những câu chưa xuất bản, nên không có đường nào để AI bịa nội dung mới.
 */
export const POST = handle(async (request: Request, context: Ctx) => {
  const session = await requireSession();
  const { itemId } = await context.params;
  enforceRateLimit(`ai:${session.id}`, RATE_LIMITS.AI);

  const { level } = await readJson(request, bodySchema);
  return ok(await explainSolution({ itemId, level }));
});
