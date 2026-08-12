import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { handle, ok, readJson } from '@/lib/http';
import { AUDIT_ACTIONS, writeAudit } from '@/lib/audit';
import { listCopyOverrides, resetAllCopy, saveCopy } from '@/lib/copy';

/** Đọc những khóa admin đã ghi đè, kèm bản gốc để trang quản trị so sánh. */
export const GET = handle(async () => {
  await requireRole('SUPER_ADMIN', 'PROGRAM_MANAGER');
  const rows = await listCopyOverrides();
  return ok({ rows, total: rows.length });
});

const saveSchema = z.object({
  entries: z.record(z.string(), z.string().max(4000)),
});

/**
 * Lưu chữ admin vừa sửa.
 * Giá trị để trống hoặc trùng bản gốc được hiểu là "khôi phục mặc định" và xóa
 * hẳn dòng ghi đè — xem `saveCopy` để biết vì sao không lưu bản sao của bản gốc.
 */
export const PUT = handle(async (request: Request) => {
  const session = await requireRole('SUPER_ADMIN', 'PROGRAM_MANAGER');
  const { entries } = await readJson(request, saveSchema);
  const result = await saveCopy(entries, session.id);

  await writeAudit({
    actorId: session.id,
    action: AUDIT_ACTIONS.SITE_COPY_UPDATE,
    entityType: 'SiteCopy',
    entityId: 'batch',
    after: { updated: result.updated, restored: result.restored, keys: Object.keys(entries) },
  });

  return ok(result);
});

/**
 * Khôi phục TOÀN BỘ chữ về bản gốc trong mã nguồn.
 *
 * Cùng nhóm quyền với PUT và với trang. Trước đây chỗ này chỉ nhận SUPER_ADMIN,
 * trong khi Quản lý chương trình vẫn thấy nút "Khôi phục tất cả" sáng bình
 * thường — bấm vào là ăn 403 mà không hiểu vì sao. Thao tác này không xóa dữ
 * liệu thật, nó chỉ gỡ các bản ghi đè để chữ quay về đúng bản trong mã nguồn,
 * nên không có lý do gì thắt chặt hơn quyền sửa.
 */
export const DELETE = handle(async () => {
  const session = await requireRole('SUPER_ADMIN', 'PROGRAM_MANAGER');
  const removed = await resetAllCopy();

  await writeAudit({
    actorId: session.id,
    action: AUDIT_ACTIONS.SITE_COPY_RESET,
    entityType: 'SiteCopy',
    entityId: 'all',
    after: { removed },
  });

  return ok({ removed });
});
