import { hasRole, PUBLISH_ROLES, requireContentStaff } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { routes } from '@/lib/routes';
import { listSkills } from '@/server/content/service';
import { listPrograms } from '@/server/catalog/service';
import { defaultEstimatedTimeSeconds } from '@/server/content/schemas';
import { Alert, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { ItemEditor, type EditorSkillOption } from '../[itemId]/item-editor';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Thêm câu hỏi' };

export default async function NewItemPage() {
  const session = await requireContentStaff();

  const [skills, programs, config] = await Promise.all([
    listSkills({}),
    listPrograms({ includeInactive: true }),
    getConfig(),
  ]);

  const skillOptions: EditorSkillOption[] = skills.map((skill) => ({
    id: skill.id,
    code: skill.code,
    name: skill.name,
    chapterCode: skill.chapter.code,
    chapterName: skill.chapter.name,
    subject: skill.chapter.subject,
    gradeBand: skill.chapter.gradeBand,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Kho câu hỏi"
        title="Thêm câu hỏi mới"
        subtitle="Metadata đúng ngay từ đầu quan trọng hơn số lượng — engine chỉ cá nhân hóa được khi câu được gắn đúng kỹ năng và độ khó."
        action={
          <LinkButton href={routes.adminContent()} variant="secondary">
            ← Về kho câu hỏi
          </LinkButton>
        }
      />

      {skillOptions.length === 0 ? (
        <EmptyState
          icon="🗂"
          title="Chưa có kỹ năng nào để gắn câu hỏi"
          description="Cây kiến thức phải có trước câu hỏi. Hãy khai báo chương và kỹ năng, sau đó quay lại đây để biên soạn câu đầu tiên."
          action={<LinkButton href={routes.adminTaxonomy()}>Dựng cây kiến thức</LinkButton>}
        />
      ) : (
        <>
          <Alert tone="info" className="mb-5" title="Câu mới luôn được lưu ở trạng thái Bản nháp">
            Sau khi lưu, câu cần được thẩm định rồi xuất bản thì engine và AI mới dùng để giao bài
            cho học sinh. Lời giải chuẩn là bắt buộc — đây là nguồn duy nhất để AI giải thích.
          </Alert>

          <ItemEditor
            skills={skillOptions}
            programs={programs.map((program) => ({ code: program.code, name: program.name }))}
            defaultEstimatedTime={defaultEstimatedTimeSeconds(config.recommendation)}
            canPublish={hasRole(session, ...PUBLISH_ROLES)}
          />
        </>
      )}
    </>
  );
}
