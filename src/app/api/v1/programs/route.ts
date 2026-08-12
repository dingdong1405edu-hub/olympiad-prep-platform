import { handle, ok, readQuery } from '@/lib/http';
import { listProgramsSchema } from '@/server/catalog/schemas';
import { getCatalogTree, listPrograms } from '@/server/catalog/service';

/**
 * Danh mục kỳ thi — endpoint CÔNG KHAI, không cần đăng nhập.
 *
 * `?tree=1` trả về cấu trúc kỳ thi → khối lớp → môn để dựng bộ lọc ở trang chủ
 * mà không phải gọi thêm /courses cho từng kỳ thi.
 */
export const GET = handle(async (request: Request) => {
  const url = new URL(request.url);
  if (url.searchParams.get('tree') === '1') {
    return ok({ tree: await getCatalogTree() });
  }

  const options = readQuery(request, listProgramsSchema);
  const rows = await listPrograms(options);
  return ok({ rows, total: rows.length });
});
