import { handle, ok } from '@/lib/http';
import { getExamForPlayer } from '@/server/mock-exam/service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };

/**
 * Đề để làm bài.
 *
 * Service đã bóc `answerKey`, `solutionMd` và barem trước khi trả — route này
 * không được tự nới thêm trường nào (spec §6).
 */
export const GET = handle(async (_request: Request, context: Ctx) => {
  const { slug } = await context.params;
  return ok(await getExamForPlayer(slug));
});
