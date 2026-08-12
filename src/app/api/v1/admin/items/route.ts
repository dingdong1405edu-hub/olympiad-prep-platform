import { handle, ok, readJson, readQuery } from '@/lib/http';
import { requireContentStaff } from '@/lib/auth';
import { createItemSchema, itemFilterSchema } from '@/server/content/schemas';
import { createItem, listItems } from '@/server/content/service';

export const GET = handle(async (request: Request) => {
  await requireContentStaff();
  const filter = readQuery(request, itemFilterSchema);
  return ok(await listItems(filter));
});

export const POST = handle(async (request: Request) => {
  const session = await requireContentStaff();
  const input = await readJson(request, createItemSchema);

  // Câu mới luôn vào ở trạng thái nháp; muốn xuất bản phải đi qua route đổi trạng thái.
  const item = await createItem(input, session.id);
  return ok({ id: item.id, itemCode: item.itemCode, status: item.status }, 201);
});
