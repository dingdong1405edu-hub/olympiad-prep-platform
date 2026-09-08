import { requireRole } from '@/lib/auth';
import { COPY_GROUPS, getCopyMap } from '@/lib/copy';
import { SITE_IMAGE_GROUPS } from '@/lib/copy/images';
import { listAssets } from '@/lib/copy/assets';
import { routes } from '@/lib/routes';
import { Alert, PageHeader } from '@/components/ui';
import { CopyEditor, type CopyGroupView } from './copy-editor';
import { ImageEditor, type ImageGroupView } from './image-editor';
import { EditorTabs } from './editor-tabs';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Giao diện & nội dung' };

/**
 * Nội dung gốc nằm trong mã nguồn (`src/lib/copy/defaults.ts` cho chữ,
 * `src/lib/copy/images.ts` cho ảnh); màn hình này chỉ ghi phần khác biệt. Nhờ
 * vậy hai điều luôn đúng: dựng môi trường mới là có ngay bản đầy đủ, và "khôi
 * phục bản gốc" chỉ là xóa phần ghi đè chứ không cần ai nhớ lại nội dung cũ.
 */
export default async function AdminSiteCopyPage() {
  await requireRole('SUPER_ADMIN', 'PROGRAM_MANAGER');
  const [current, assets] = await Promise.all([getCopyMap(), listAssets()]);

  /**
   * Nhóm chữ thay ảnh (alt) bị GIẤU khỏi tab Chữ.
   *
   * Nó vẫn phải nằm trong `COPY_GROUPS` — đó là nơi khai báo bản gốc và cũng là
   * danh sách khóa hợp lệ mà API kho chữ dùng để lọc. Nhưng hiện nó ở cả hai
   * tab thì cùng một ô có hai chỗ sửa với hai bản nháp riêng, và người sửa ở tab
   * này sẽ lặng lẽ đè lên người sửa ở tab kia. Alt sống ở tab Ảnh, cạnh tấm ảnh
   * mà nó mô tả.
   */
  const groups: CopyGroupView[] = COPY_GROUPS.filter((group) => group.key !== 'image.alt').map(
    (group) => ({
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
    }),
  );

  const assetBySlot = new Map(assets.map((asset) => [asset.slot, asset]));

  const imageGroups: ImageGroupView[] = SITE_IMAGE_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    description: group.description,
    slots: group.slots.map((slot) => {
      const asset = assetBySlot.get(slot.key);
      return {
        key: slot.key,
        label: slot.label,
        hint: slot.hint,
        aspect: slot.aspect,
        recommended: slot.recommended,
        fallbackNote: slot.fallbackNote,
        url: asset?.url ?? null,
        sizeBytes: asset?.sizeBytes ?? null,
        width: asset?.width ?? null,
        height: asset?.height ?? null,
        alt: current[`${slot.key}.alt`] ?? slot.defaultAlt,
        defaultAlt: slot.defaultAlt,
      };
    }),
  }));

  const totalFields = groups.reduce((sum, group) => sum + group.fields.length, 0);
  const totalSlots = imageGroups.reduce((sum, group) => sum + group.slots.length, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Quản trị"
        title="Giao diện & nội dung"
        subtitle={`${totalFields} ô chữ và ${totalSlots} ô ảnh trên trang chủ, danh mục kỳ thi, danh mục khóa học và trang chi tiết. Sửa xong là có hiệu lực ngay.`}
      />

      <Alert tone="info" className="mb-6" title="Nội dung riêng của từng kỳ thi nằm ở chỗ khác">
        Trang này quản lý phần chữ và ảnh dùng chung của khung trang. Bài giới thiệu, video và câu
        hỏi thường gặp của từng kỳ thi hay từng khóa học được nhập trong mục{' '}
        <a href={routes.adminPrograms()} className="font-medium underline underline-offset-2">
          Chương trình
        </a>
        .
      </Alert>

      <EditorTabs
        copyLabel={`Chữ (${totalFields})`}
        imageLabel={`Ảnh (${assets.length}/${totalSlots})`}
        copyPanel={<CopyEditor groups={groups} />}
        imagePanel={<ImageEditor groups={imageGroups} />}
      />
    </div>
  );
}
