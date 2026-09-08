import { requireRole } from '@/lib/auth';
import { ApiError, handle, ok } from '@/lib/http';
import { AUDIT_ACTIONS, writeAudit } from '@/lib/audit';
import { listAssets, saveAsset } from '@/lib/copy/assets';
import { IMAGE_SLOT_BY_KEY } from '@/lib/copy/images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Chỉ ba định dạng. Đây là quyết định về AN TOÀN chứ không phải khẩu vị:
 * SVG là XML chạy được script, mà route phục vụ ảnh trả đúng `Content-Type` đã
 * lưu — nhận SVG vào đây là mở đường chạy mã lạ trên chính miền của trang. GIF
 * bị loại vì ảnh động ở khối hero là thứ không ai gỡ xuống được sau khi đã lên.
 */
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * 4MB, đo SAU khi trình duyệt đã nén (`compressForWeb`).
 *
 * Ảnh marketing nén đúng cách hiếm khi quá 600KB, nên chạm trần này gần như
 * luôn là dấu hiệu ảnh chưa qua bước nén — thường vì admin gọi API bằng tay.
 * Trần đặt ở đây thay vì trong `AppConfig` vì nó là giới hạn kỹ thuật của bảng
 * chứ không phải một nút người vận hành cần vặn.
 */
const MAX_BYTES = 4 * 1024 * 1024;

/** Kích thước ảnh do trình duyệt đo và gửi kèm; sai định dạng thì bỏ, không chặn. */
function readDimension(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string') return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 && n < 100_000 ? n : null;
}

/** Ô nào đang có ảnh, cho trang quản trị. */
export const GET = handle(async () => {
  await requireRole('SUPER_ADMIN', 'PROGRAM_MANAGER');
  const rows = await listAssets();
  return ok({ rows, total: rows.length });
});

/**
 * Tải ảnh lên một ô (multipart: `slot`, `file`, kèm `width`/`height` tùy chọn).
 *
 * Ảnh cũ của ô bị ghi đè chứ không xếp chồng: một ô là một ảnh, nên không có
 * kho ảnh mồ côi cần dọn về sau như bên `MockExamUpload`.
 */
export const POST = handle(async (request: Request) => {
  const session = await requireRole('SUPER_ADMIN', 'PROGRAM_MANAGER');

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw ApiError.badRequest('Yêu cầu phải là multipart/form-data.');
  }

  const slot = form.get('slot');
  if (typeof slot !== 'string' || !(slot in IMAGE_SLOT_BY_KEY)) {
    throw ApiError.badRequest('Không có ô ảnh nào mang khóa này.');
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    throw ApiError.badRequest('Thiếu tệp ảnh trong biểu mẫu (trường `file`).');
  }

  const mimeType = (file.type || '').toLowerCase();
  if (!ALLOWED_TYPES.has(mimeType)) {
    throw ApiError.badRequest('Chỉ nhận ảnh JPEG, PNG hoặc WEBP.');
  }
  if (file.size === 0) {
    throw ApiError.badRequest('Tệp ảnh rỗng.');
  }
  if (file.size > MAX_BYTES) {
    const mb = Math.round((MAX_BYTES / (1024 * 1024)) * 10) / 10;
    throw ApiError.badRequest(`Ảnh nặng quá ${mb}MB. Hãy chọn ảnh nhỏ hơn.`);
  }

  const row = await saveAsset({
    slot,
    mimeType,
    data: Buffer.from(await file.arrayBuffer()),
    width: readDimension(form.get('width')),
    height: readDimension(form.get('height')),
    updatedById: session.id,
  });

  await writeAudit({
    actorId: session.id,
    action: AUDIT_ACTIONS.SITE_ASSET_UPDATE,
    entityType: 'SiteAsset',
    entityId: slot,
    after: {
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      width: row.width,
      height: row.height,
    },
  });

  return ok(row, 201);
});
