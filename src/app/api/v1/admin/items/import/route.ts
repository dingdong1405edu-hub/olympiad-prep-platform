import { handle, ok, readJson } from '@/lib/http';
import { requireContentStaff } from '@/lib/auth';
import { importRequestSchema } from '@/server/content/schemas';
import { parseCsv } from '@/server/content/csv';
import { importItems } from '@/server/content/import';

/**
 * Nhập câu hỏi hàng loạt.
 * `dryRun` mặc định TRUE: giao diện bắt buộc phải chạy kiểm tra thử và xem báo
 * cáo từng dòng trước khi ghi thật. Câu nhập vào luôn ở trạng thái nháp.
 */
export const POST = handle(async (request: Request) => {
  const session = await requireContentStaff();
  const { csv, dryRun } = await readJson(request, importRequestSchema);

  const { rows } = parseCsv(csv);
  const report = await importItems({ rows, actorId: session.id, dryRun });

  return ok({ ...report, dryRun });
});
