import { requireRole } from '@/lib/auth';
import { COPY_GROUPS, getCopyMap } from '@/lib/copy';
import { routes } from '@/lib/routes';
import { Alert, PageHeader } from '@/components/ui';
import { CopyEditor, type CopyGroupView } from './copy-editor';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Giao diện & nội dung' };

/**
 * Nơi sửa mọi câu chữ hiển thị trên các trang công khai.
 *
 * Nội dung gốc nằm trong mã nguồn (`src/lib/copy/defaults.ts`); màn hình này chỉ
 * ghi phần khác biệt. Nhờ vậy hai điều luôn đúng: dựng môi trường mới là có
 * ngay bản chữ đầy đủ, và "khôi phục bản gốc" chỉ là xóa phần ghi đè chứ không
 * cần ai nhớ lại câu cũ viết thế nào.
 */
export default async function AdminSiteCopyPage() {
  await requireRole('SUPER_ADMIN', 'PROGRAM_MANAGER');
  const current = await getCopyMap();

  const groups: CopyGroupView[] = COPY_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    description: group.description,
    fields: group.fields.map((field) => ({
      key: field.key,
      label: field.label,
      hint: field.hint,
      multiline: field.multiline,
      current: current[field.key] ?? field.value,
      defaultValue: field.value,
    })),
  }));

  const total = groups.reduce((sum, group) => sum + group.fields.length, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Quản trị"
        title="Giao diện & nội dung"
        subtitle={`${total} ô chữ trên trang chủ, danh mục kỳ thi, danh mục khóa học và trang chi tiết. Sửa xong là có hiệu lực ngay.`}
      />

      <Alert tone="info" className="mb-6" title="Nội dung riêng của từng kỳ thi nằm ở chỗ khác">
        Trang này quản lý phần chữ dùng chung của khung trang. Bài giới thiệu, video và câu hỏi
        thường gặp của từng kỳ thi hay từng khóa học được nhập trong mục{' '}
        <a href={routes.adminPrograms()} className="font-medium underline underline-offset-2">
          Chương trình
        </a>
        .
      </Alert>

      <CopyEditor groups={groups} />
    </div>
  );
}
