import { requireRole, hasRole } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { getProgramByCode, listCourses, listPrograms } from '@/server/catalog/service';
import { listCoupons } from '@/server/commerce/service';
import { listAssets } from '@/lib/copy/assets';
import { isCourseCoverSlot } from '@/lib/copy/images';
import { PageHeader, Alert } from '@/components/ui';
import { ProgramManager } from './program-manager';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Chương trình' };

export default async function AdminProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string }>;
}) {
  const session = await requireRole('SUPER_ADMIN', 'PROGRAM_MANAGER', 'OPS_ADMIN');
  const { program: programCode } = await searchParams;

  const [programs, config] = await Promise.all([
    listPrograms({ includeInactive: true }),
    getConfig(),
  ]);

  const activeCode = programCode ?? programs[0]?.code;
  const [selected, coupons] = await Promise.all([
    activeCode ? getProgramByCode(activeCode).catch(() => null) : Promise.resolve(null),
    listCoupons({}).catch(() => ({ items: [], total: 0, page: 1, pageSize: 20 })),
  ]);

  // Khóa đã tắt không nằm trong ProgramDetail.courses, nhưng quản trị vẫn cần thấy để bật lại.
  //
  // `listCourses` mặc định `active: true` (xem catalog/service.ts), nên bản trước
  // lọc `!course.active` trên một danh sách chỉ toàn khóa đang bật — kết quả luôn
  // rỗng. Hệ quả: ẩn một khóa đi là mất hẳn, không còn nút nào để mở lại.
  const hiddenCourses = selected ? await listCourses({ programId: selected.id, active: false }) : [];

  /*
   * Ảnh đại diện của các khóa. Đọc CẢ danh sách rồi lọc trong bộ nhớ thay vì
   * truy vấn theo từng khóa: bảng SiteAsset chỉ có một dòng cho mỗi ô đã tải
   * ảnh, và `listAssets()` cố ý không select cột bytes.
   */
  const coverUrlBySlot = Object.fromEntries(
    (await listAssets().catch(() => []))
      .filter((asset) => isCourseCoverSlot(asset.slot))
      .map((asset) => [asset.slot, asset.url]),
  );

  return (
    <div>
      <PageHeader
        eyebrow="Quản trị"
        title="Chương trình và khóa học"
        subtitle="Kỳ thi, mùa thi, khóa học, bảng giá và mã giảm giá."
      />

      <Alert tone="info" className="mb-6">
        Thêm một kỳ thi mới chỉ là thêm một bản ghi ở đây — <strong>không cần lập trình</strong>.
        Khối lớp, môn học, blueprint và giá đều là dữ liệu cấu hình.
      </Alert>

      <ProgramManager
        programs={programs}
        selected={selected}
        hiddenCourses={hiddenCourses}
        coupons={coupons.items}
        canEdit={hasRole(session, 'SUPER_ADMIN', 'PROGRAM_MANAGER')}
        coverUrlBySlot={coverUrlBySlot}
        defaultPrice={config.commerce.defaultPrice}
        defaultCurrency={config.commerce.currency}
        defaultAccessDays={config.commerce.accessDurationDays}
      />
    </div>
  );
}
