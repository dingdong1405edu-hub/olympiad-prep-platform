import { handle, ok, readQuery } from '@/lib/http';
import { listCoursesSchema } from '@/server/catalog/schemas';
import { listCourses } from '@/server/catalog/service';

/**
 * Danh sách khóa học — endpoint CÔNG KHAI.
 * Lọc được theo kỳ thi, khối lớp và môn; bỏ trống thì chỉ trả khóa đang mở bán.
 */
export const GET = handle(async (request: Request) => {
  const filter = readQuery(request, listCoursesSchema);
  const rows = await listCourses(filter);
  return ok({ rows, total: rows.length });
});
