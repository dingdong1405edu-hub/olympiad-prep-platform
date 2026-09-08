import { requireRole } from '@/lib/auth';
import { ApiError, handle, ok } from '@/lib/http';
import { AUDIT_ACTIONS, writeAudit } from '@/lib/audit';
import { deleteAsset } from '@/lib/copy/assets';
import { IMAGE_SLOT_BY_KEY } from '@/lib/copy/images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slot: string }> };

/**
 * Gỡ ảnh khỏi một ô — trang quay về hình mặc định khai báo trong `images.ts`.
 *
 * Cùng nhóm quyền với việc tải lên, và cùng lý do như nút "Khôi phục tất cả"
 * bên kho chữ: đây không phải xóa dữ liệu thật, chỉ là bỏ một lớp ghi đè.
 */
export const DELETE = handle(async (_request: Request, context: Ctx) => {
  const session = await requireRole('SUPER_ADMIN', 'PROGRAM_MANAGER');
  const { slot: raw } = await context.params;
  const slot = decodeURIComponent(raw);

  if (!(slot in IMAGE_SLOT_BY_KEY)) {
    throw ApiError.badRequest('Không có ô ảnh nào mang khóa này.');
  }

  const removed = await deleteAsset(slot);

  // Chỉ ghi nhật ký khi thật sự có ảnh bị gỡ. Bấm nhầm vào một ô vốn đã trống
  // không đáng để lại một dòng trong nhật ký kiểm toán.
  if (removed) {
    await writeAudit({
      actorId: session.id,
      action: AUDIT_ACTIONS.SITE_ASSET_DELETE,
      entityType: 'SiteAsset',
      entityId: slot,
      after: { removed: true },
    });
  }

  return ok({ slot, removed });
});
