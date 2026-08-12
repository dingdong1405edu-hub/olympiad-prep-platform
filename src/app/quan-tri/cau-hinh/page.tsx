import { requireRole } from '@/lib/auth';
import { CONFIG_GROUP_META, DEFAULT_CONFIG, getConfig, type ConfigGroup } from '@/lib/config';
import { Alert, PageHeader } from '@/components/ui';
import { ConfigEditor, type ConfigGroupView } from './config-editor';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Cấu hình hệ thống' };

/**
 * Màn hình chứng minh tiêu chí nghiệm thu của đặc tả: "cấu hình được program /
 * course / price / blueprint mà KHÔNG sửa code" (§17). Toàn bộ tham số Phụ lục B
 * nằm ở đây, so sánh trực tiếp với giá trị mặc định xuất xưởng.
 */
export default async function AdminConfigPage() {
  await requireRole('SUPER_ADMIN', 'PROGRAM_MANAGER');
  const current = await getConfig();

  const groups: ConfigGroupView[] = (Object.keys(DEFAULT_CONFIG) as ConfigGroup[]).map((key) => ({
    key,
    label: CONFIG_GROUP_META[key].label,
    description: CONFIG_GROUP_META[key].description,
    value: current[key] as unknown as Record<string, unknown>,
    defaults: DEFAULT_CONFIG[key] as unknown as Record<string, unknown>,
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Quản trị"
        title="Cấu hình hệ thống"
        subtitle="Mọi tham số nghiệp vụ của nền tảng. Sửa ở đây có hiệu lực ngay, không cần deploy."
      />

      <Alert tone="warn" className="mb-6" title="Đọc trước khi sửa">
        Một số tham số tác động trực tiếp tới học sinh đang học: chu kỳ đánh giá, tải tối đa mỗi
        ngày và trọng số của engine. Đổi chúng sẽ thay đổi lộ trình của những em đang trong chu kỳ.
      </Alert>

      <ConfigEditor groups={groups} />
    </div>
  );
}
