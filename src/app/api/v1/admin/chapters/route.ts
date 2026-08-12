import { handle, ok, readJson, readQuery } from '@/lib/http';
import { requireContentStaff } from '@/lib/auth';
import { chapterFilterSchema, upsertChapterSchema } from '@/server/content/schemas';
import { listChapters, upsertChapter } from '@/server/content/service';

export const GET = handle(async (request: Request) => {
  await requireContentStaff();
  const filter = readQuery(request, chapterFilterSchema);
  return ok(await listChapters(filter));
});

export const POST = handle(async (request: Request) => {
  const session = await requireContentStaff();
  const input = await readJson(request, upsertChapterSchema);
  const chapter = await upsertChapter(input, session.id);
  return ok({ id: chapter.id, code: chapter.code, name: chapter.name });
});
