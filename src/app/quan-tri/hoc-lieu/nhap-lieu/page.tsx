import { requireContentStaff } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { listChapters, listSkills } from '@/server/content/service';
import { IMPORT_MAX_ROWS, IMPORT_TEMPLATE_HEADERS } from '@/server/content/import';
import { Alert, LinkButton, PageHeader } from '@/components/ui';
import { ImportWizard } from './import-wizard';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Nhập câu hỏi hàng loạt' };

export default async function ImportItemsPage() {
  await requireContentStaff();

  // Taxonomy phải có TRƯỚC khi nhập (specs §18): import không tự tạo chương/kỹ năng.
  const [chapters, skills] = await Promise.all([listChapters({}), listSkills({})]);

  return (
    <>
      <PageHeader
        eyebrow="Kho câu hỏi"
        title="Nhập câu hỏi hàng loạt"
        subtitle="Ba bước: lấy dữ liệu vào, kiểm tra thử từng dòng, rồi mới ghi thật. Không có đường tắt bỏ qua bước kiểm tra."
        action={
          <LinkButton href={routes.adminContent()} variant="secondary">
            ← Về kho câu hỏi
          </LinkButton>
        }
      />

      {skills.length === 0 ? (
        <Alert tone="warn" className="mb-5" title="Chưa khai báo cây kiến thức">
          Chưa có kỹ năng nào trong hệ thống nên mọi dòng nhập vào sẽ báo lỗi. Hãy dựng chương và kỹ
          năng trước — sửa taxonomy sau khi đã nhập hàng nghìn câu đồng nghĩa với việc gắn thẻ lại
          toàn bộ kho.{' '}
          <a className="link-underline font-medium" href={routes.adminTaxonomy()}>
            Mở cây kiến thức
          </a>
        </Alert>
      ) : null}

      <ImportWizard
        templateHeaders={IMPORT_TEMPLATE_HEADERS}
        maxRows={IMPORT_MAX_ROWS}
        chapterCount={chapters.length}
        skillCount={skills.length}
      />
    </>
  );
}
