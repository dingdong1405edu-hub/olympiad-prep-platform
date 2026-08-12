import { handle, ok, readJson } from '@/lib/http';
import { requireContentStaff } from '@/lib/auth';
import { updateItemSchema } from '@/server/content/schemas';
import { getItem, updateItem } from '@/server/content/service';

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_request: Request, context: Ctx) => {
  await requireContentStaff();
  const { id } = await context.params;
  return ok(await getItem(id));
});

/** Sửa câu hỏi: service tự tăng version và lưu snapshot cũ để kiểm toán. */
export const PATCH = handle(async (request: Request, context: Ctx) => {
  const session = await requireContentStaff();
  const { id } = await context.params;

  const input = await readJson(request, updateItemSchema);
  const item = await updateItem(id, input, session.id);

  return ok({ id: item.id, itemCode: item.itemCode, version: item.version, status: item.status });
});
