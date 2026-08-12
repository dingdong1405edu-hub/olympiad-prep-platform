import type { GradeBand, Subject } from '@prisma/client';
import { requireContentStaff } from '@/lib/auth';
import { routes } from '@/lib/routes';
import { getChapterTree, listChapters, listSkills } from '@/server/content/service';
import {
  GRADE_BAND_VALUES,
  SUBJECT_VALUES,
  gradeBandSchema,
  subjectSchema,
} from '@/server/content/schemas';
import { GRADE_BAND_LABEL, SUBJECT_LABEL } from '@/lib/domain';
import {
  Alert,
  Button,
  FilterBar,
  Label,
  LinkButton,
  PageHeader,
  Select,
  StatTile,
} from '@/components/ui';
import { TaxonomyEditor, type PrerequisiteOption } from './taxonomy-editor';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Cây kiến thức' };

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string): string | undefined {
  const raw = params[key];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return value ? value : undefined;
}

export default async function TaxonomyPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireContentStaff();
  const params = await searchParams;

  // Cây luôn xem theo MỘT môn + MỘT khối; mặc định mở đúng nhánh đã có dữ liệu.
  const allChapters = await listChapters({});
  const first = allChapters[0];

  const subjectParsed = subjectSchema.safeParse(readParam(params, 'subject'));
  const gradeBandParsed = gradeBandSchema.safeParse(readParam(params, 'gradeBand'));
  const subject: Subject = subjectParsed.success ? subjectParsed.data : (first?.subject ?? 'MATH');
  const gradeBand: GradeBand = gradeBandParsed.success
    ? gradeBandParsed.data
    : (first?.gradeBand ?? 'A');

  const [chapters, subjectSkills] = await Promise.all([
    getChapterTree(subject, gradeBand),
    // Kỹ năng tiên quyết bắt buộc cùng môn (service chặn khác môn), nhưng được
    // phép nằm ở khối thấp hơn — nên danh sách chọn lấy theo cả môn.
    listSkills({ subject }),
  ]);

  const prerequisiteOptions: PrerequisiteOption[] = subjectSkills.map((skill) => ({
    id: skill.id,
    code: skill.code,
    name: skill.name,
    chapterCode: skill.chapter.code,
    chapterName: skill.chapter.name,
    gradeBand: skill.chapter.gradeBand,
    gradeBandLabel: GRADE_BAND_LABEL[skill.chapter.gradeBand],
  }));

  const skillCount = chapters.reduce((sum, chapter) => sum + chapter.skills.length, 0);
  const publishedCount = chapters.reduce((sum, chapter) => sum + chapter.itemCounts.published, 0);
  const emptySkillCount = chapters.reduce(
    (sum, chapter) => sum + chapter.skills.filter((skill) => skill.itemCounts.published === 0).length,
    0,
  );

  return (
    <>
      <PageHeader
        eyebrow="Kho câu hỏi"
        title="Cây kiến thức"
        subtitle="Chương → kỹ năng → câu hỏi. Taxonomy phải chốt trước khi nhập hàng loạt: sửa cây sau khi đã có hàng nghìn câu đồng nghĩa gắn thẻ lại toàn bộ kho."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <LinkButton href={routes.adminContentCoverage()} variant="secondary">
              Báo cáo độ phủ
            </LinkButton>
            <LinkButton href={routes.adminContent()} variant="secondary">
              ← Về kho câu hỏi
            </LinkButton>
          </div>
        }
      />

      <FilterBar>
        <form
          method="get"
          action={routes.adminTaxonomy()}
          className="grid w-full gap-3 sm:grid-cols-3"
        >
          <div>
            <Label htmlFor="subject">Môn</Label>
            <Select id="subject" name="subject" defaultValue={subject}>
              {SUBJECT_VALUES.map((value) => (
                <option key={value} value={value}>
                  {SUBJECT_LABEL[value]}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="gradeBand">Khối</Label>
            <Select id="gradeBand" name="gradeBand" defaultValue={gradeBand}>
              {GRADE_BAND_VALUES.map((value) => (
                <option key={value} value={value}>
                  {GRADE_BAND_LABEL[value]}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-end">
            <Button type="submit" variant="secondary" className="w-full">
              Mở nhánh này
            </Button>
          </div>
        </form>
      </FilterBar>

      <div className="stagger mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Chương"
          value={<span className="tabular-nums">{chapters.length}</span>}
          hint={`${SUBJECT_LABEL[subject]} · ${GRADE_BAND_LABEL[gradeBand]}`}
        />
        <StatTile
          label="Kỹ năng"
          value={<span className="tabular-nums">{skillCount}</span>}
          hint="Đơn vị nhỏ nhất engine dùng để tìm lỗ hổng"
        />
        <StatTile
          label="Câu đã xuất bản"
          value={<span className="tabular-nums">{publishedCount}</span>}
          hint="Chỉ câu xuất bản mới được giao cho học sinh"
        />
        <StatTile
          label="Kỹ năng chưa có câu"
          value={<span className="tabular-nums">{emptySkillCount}</span>}
          hint={emptySkillCount > 0 ? 'Cần bổ sung câu' : 'Mọi kỹ năng đều có câu'}
          tone={emptySkillCount > 0 ? 'warn' : 'success'}
        />
      </div>

      <Alert tone="info" className="mb-5" title="Ba con số quyết định chất lượng cây kiến thức">
        <strong>Thứ tự</strong> quyết định trình tự học hiển thị cho học sinh.{' '}
        <strong>Tỷ trọng blueprint</strong> quyết định chương/kỹ năng đó chiếm bao nhiêu phần trong
        đề kiểm tra. <strong>Kỹ năng tiên quyết</strong> cho engine biết phải vá phần nền nào trước
        khi dạy phần khó hơn — và không được tạo thành vòng lặp.
      </Alert>

      <TaxonomyEditor
        subject={subject}
        gradeBand={gradeBand}
        subjectLabel={SUBJECT_LABEL[subject]}
        gradeBandLabel={GRADE_BAND_LABEL[gradeBand]}
        chapters={chapters}
        prerequisiteOptions={prerequisiteOptions}
      />
    </>
  );
}
